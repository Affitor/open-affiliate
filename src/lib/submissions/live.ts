import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { registrableDomain } from "@/lib/claims/rules"
import { siteverify } from "@/lib/claims/live"
import { oasSummary } from "@/lib/oas"
import { programs } from "@/lib/programs"
import type { ListedProgram, SubmissionDeps, SubmissionRow, SubmissionStore, SubmitOutcome } from "./service"

/** HMAC keys shorter than this are treated as missing, as for claims. */
const MIN_SECRET_LENGTH = 32

/**
 * On when the database and the IP-hash key are set. Turnstile is optional:
 * without TURNSTILE_SECRET_KEY every submission gets the API limits.
 */
export function submissionsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && (env.CLAIM_SIGNING_SECRET ?? "").length >= MIN_SECRET_LENGTH)
}

const ROW_COLUMNS = "id, status, reason, listed_slug, created_at, updated_at"

export function supabaseSubmissionStore(db: SupabaseClient): SubmissionStore {
  return {
    async submit(row, caps) {
      const { data, error } = await db.rpc("submission_submit", {
        p_domain: row.domain,
        p_program_url: row.program_url,
        p_terms_url: row.terms_url,
        p_name: row.name,
        p_contact: row.contact_email,
        p_note: row.note,
        p_source: row.source,
        p_ip_hash: row.ip_hash,
        p_ip_hour: caps.ipHour,
        p_ip_day: caps.ipDay,
        p_domain_day: caps.domainDay,
        p_site_requests_day: caps.siteRequestsDay,
        p_site_new_day: caps.siteNewDay,
        p_site_new_plain_day: caps.siteNewPlainDay,
      })
      if (error) throw error
      return outcomeOf(data)
    },
    async get(id) {
      const { data, error } = await db.from("program_submissions").select(ROW_COLUMNS).eq("id", id).maybeSingle()
      if (error) throw error
      return (data as SubmissionRow | null) ?? null
    },
  }
}

const WINDOWS = new Set(["ip_hour", "ip_day", "domain_day", "site_day", "site_new"])

/** The function's jsonb answer, checked rather than trusted. */
export function outcomeOf(data: unknown): SubmitOutcome {
  const out = (data ?? {}) as Record<string, unknown>
  if (out.result === "limited" && typeof out.window === "string" && WINDOWS.has(out.window)) {
    return { result: "limited", window: out.window as Extract<SubmitOutcome, { result: "limited" }>["window"] }
  }
  if ((out.result === "new" || out.result === "duplicate") && typeof out.id === "string" && typeof out.ip_hour === "number") {
    return {
      result: out.result,
      ipHour: out.ip_hour,
      row: {
        id: out.id,
        status: out.status as SubmissionRow["status"],
        reason: (out.reason ?? null) as SubmissionRow["reason"],
        listed_slug: (out.listed_slug ?? null) as string | null,
        created_at: String(out.created_at),
        updated_at: String(out.updated_at),
      },
    }
  }
  throw Object.assign(new Error("submission_submit returned an unexpected value"), { code: "unexpected_result" })
}

// Registry listings by registrable domain, built once per server instance.
let byDomain: Map<string, ListedProgram[]> | null = null

export function programsOnDomain(domain: string): readonly ListedProgram[] {
  if (!byDomain) {
    byDomain = new Map()
    for (const p of programs) {
      const d = registrableDomain(p.url)
      if (!d) continue
      const list = byDomain.get(d) ?? []
      list.push({ slug: p.slug, url: p.url, status: p.status })
      byDomain.set(d, list)
    }
  }
  return byDomain.get(domain) ?? []
}

/** The real dependencies, or null when submissions are not enabled (routes answer 503). */
export function liveSubmissionDeps(env: Record<string, string | undefined> = process.env): SubmissionDeps | null {
  if (!submissionsEnabled(env)) return null
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const turnstileKey = env.TURNSTILE_SECRET_KEY
  return {
    store: supabaseSubmissionStore(db),
    secret: env.CLAIM_SIGNING_SECRET!,
    programsOnDomain,
    reportUrl: (slug) => oasSummary(slug)?.reportUrl ?? null,
    verifyTurnstile: turnstileKey ? (token, ip) => siteverify(turnstileKey, token, ip) : null,
  }
}
