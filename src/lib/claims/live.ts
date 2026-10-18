import { Resolver } from "node:dns/promises"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { claimEnvReady } from "./rules"
import {
  MAIL_TEMPLATES,
  MAX_ATTEMPTS,
  RETENTION_DAYS,
  type AddMemberResult,
  type ClaimDeps,
  type ClaimProgram,
  type ClaimRow,
  type ClaimStore,
  type EditRow,
  type MemberRow,
  type SigninCodeRow,
} from "./service"

/**
 * Claim mail comes from OpenAffiliate's own domain (Sơn, 17/10). The domain
 * must be verified in Resend and OA_RESEND_API_KEY must be allowed to send
 * from it before the flag goes on. Reply-to stays the address approved in the
 * v1 pack until a monitored openaffiliate.dev inbox exists.
 */
const CLAIM_FROM = "OpenAffiliate <claims@openaffiliate.dev>"
const CLAIM_REPLY_TO = "support@affitor.com"
const ALLOWED_TEMPLATES: ReadonlySet<string> = new Set(MAIL_TEMPLATES)

const DAY = 24 * 60 * 60 * 1000

function supabaseStore(db: SupabaseClient): ClaimStore {
  const claims = () => db.from("program_claims")
  const events = () => db.from("claim_events")
  const members = () => db.from("claim_members")
  const signinCodes = () => db.from("claim_signin_codes")
  const check = <T extends { error: unknown }>(result: T): T => {
    if (result.error) throw result.error
    return result
  }

  return {
    async addEvent(event) {
      const { data } = check(await events().insert(event).select("id").single())
      return (data as { id: number }).id
    },
    async removeEvent(id) {
      check(await events().delete().eq("id", id))
    },
    async countEvents(filter) {
      let query = events()
        .select("id", { count: "exact", head: true })
        .eq("type", filter.type)
        .gte("created_at", filter.since.toISOString())
      for (const key of ["claim_id", "slug", "domain", "email_hash", "ip_hash"] as const) {
        const value = filter[key]
        if (value !== undefined) query = query.eq(key, value)
      }
      return check(await query).count ?? 0
    },
    async addClaim(claim) {
      check(await claims().insert(claim))
    },
    async getClaim(id) {
      const { data } = check(await claims().select("*").eq("id", id).maybeSingle())
      return (data as ClaimRow | null) ?? null
    },
    async hasActiveOwner(domain) {
      const { data } = check(await claims().select("id").eq("domain", domain).eq("status", "active").limit(1))
      return (data ?? []).length > 0
    },
    async takeAttempt(id, seen, now) {
      const { data } = check(
        await claims()
          .update({ attempts: seen + 1 })
          .eq("id", id)
          .eq("attempts", seen)
          .lt("attempts", MAX_ATTEMPTS)
          .eq("status", "pending")
          .is("verified_at", null)
          .gt("expires_at", now.toISOString())
          .select("id"),
      )
      return (data ?? []).length === 1
    },
    async confirm(id, now) {
      const result = await claims()
        .update({ verified_at: now.toISOString(), status: "active" })
        .eq("id", id)
        .eq("status", "pending")
        .is("verified_at", null)
        .gt("expires_at", now.toISOString())
        .select("id")
      // program_claims_one_owner_per_domain
      if (result.error?.code === "23505") return "conflict"
      check(result)
      return (result.data ?? []).length === 1 ? "ok" : "gone"
    },
    async release(id) {
      check(await claims().update({ status: "released", email: null }).eq("id", id))
      check(
        await members()
          .update({ status: "removed", email: null, removed_at: new Date().toISOString() })
          .eq("claim_id", id)
          .eq("status", "active"),
      )
    },
    async submitEdit(edit, dailyLimit) {
      // Migration 010: lock the claim row, check the quota, insert the edit and
      // its terms.submitted event, all in one transaction.
      const { data } = check(
        await db.rpc("claim_submit_edit", {
          p_claim_id: edit.claim_id,
          p_slug: edit.slug,
          p_fields: edit.fields,
          p_daily_limit: dailyLimit,
        }),
      )
      if (data === "ok" || data === "quota" || data === "not_owner") return data
      throw Object.assign(new Error("claim_submit_edit returned an unexpected value"), { code: "unexpected_result" })
    },
    // Same cutoffs as the daily pg_cron job in migration 009; this covers a
    // database where pg_cron is not enabled.
    async prune(now) {
      const before = (days: number) => new Date(now.getTime() - days * DAY).toISOString()
      check(await claims().delete().is("verified_at", null).lt("created_at", before(RETENTION_DAYS.unverifiedClaims)))
      check(await events().delete().lt("created_at", before(RETENTION_DAYS.events)))
      check(await signinCodes().delete().lt("created_at", before(RETENTION_DAYS.signinCodes)))
      check(await members().delete().eq("status", "removed").lt("removed_at", before(RETENTION_DAYS.removedMembers)))
    },
    async addMember(claimId, email, addedBy, max) {
      // Migration 011: lock the claim row, check the cap, insert, all at once.
      const { data } = check(
        await db.rpc("claim_add_member", {
          p_claim_id: claimId,
          p_email: email.toLowerCase(),
          p_added_by: addedBy,
          p_max: max,
        }),
      )
      const out = data as { result?: unknown; id?: unknown } | null
      if (out?.result === "ok" && typeof out.id === "string") return { result: "ok", id: out.id }
      if (out?.result === "full" || out?.result === "exists" || out?.result === "not_owner") {
        return { result: out.result } as AddMemberResult
      }
      throw Object.assign(new Error("claim_add_member returned an unexpected value"), { code: "unexpected_result" })
    },
    async getMember(id) {
      const { data } = check(await members().select("*").eq("id", id).maybeSingle())
      return (data as MemberRow | null) ?? null
    },
    async findActiveMember(email) {
      // Member addresses are stored lowercase; the unique index on
      // lower(email) allows at most one active row.
      const { data } = check(await members().select("*").eq("email", email.toLowerCase()).eq("status", "active").limit(1))
      return ((data ?? [])[0] as MemberRow | undefined) ?? null
    },
    async listMembers(claimId) {
      const { data } = check(
        await members().select("*").eq("claim_id", claimId).eq("status", "active").order("created_at", { ascending: true }),
      )
      return (data ?? []) as MemberRow[]
    },
    async removeMember(id, claimId) {
      const { data } = check(
        await members()
          .update({ status: "removed", email: null, removed_at: new Date().toISOString() })
          .eq("id", id)
          .eq("claim_id", claimId)
          .eq("status", "active")
          .select("id"),
      )
      return (data ?? []).length === 1
    },
    async addSigninCode(row) {
      check(await signinCodes().insert(row))
    },
    async getSigninCode(id) {
      const { data } = check(await signinCodes().select("*").eq("id", id).maybeSingle())
      return (data as SigninCodeRow | null) ?? null
    },
    async takeSigninAttempt(id, seen, now) {
      const { data } = check(
        await signinCodes()
          .update({ attempts: seen + 1 })
          .eq("id", id)
          .eq("attempts", seen)
          .lt("attempts", MAX_ATTEMPTS)
          .is("used_at", null)
          .gt("expires_at", now.toISOString())
          .select("id"),
      )
      return (data ?? []).length === 1
    },
    async useSigninCode(id, now) {
      const { data } = check(
        await signinCodes()
          .update({ used_at: now.toISOString() })
          .eq("id", id)
          .is("used_at", null)
          .gt("expires_at", now.toISOString())
          .select("id"),
      )
      return (data ?? []).length === 1
    },
    async listEdits(claimId) {
      const { data } = check(
        await db
          .from("claim_edits")
          .select("id, slug, kind, status, pr_url, fields, created_at")
          .eq("claim_id", claimId)
          .order("created_at", { ascending: false })
          .limit(50),
      )
      return (data ?? []) as EditRow[]
    },
    async countProgramEvents(slug, type, since) {
      const { count, error } = await db
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("slug", slug)
        .eq("type", type)
        .gte("created_at", since.toISOString())
      return error ? null : (count ?? null)
    },
  }
}

/** The real dependencies, or null when any claim secret is missing (routes answer 503). */
export function liveClaimDeps(
  getProgram: (slug: string) => ClaimProgram | undefined,
  programsOnDomain: (domain: string) => ClaimProgram[],
  afterResponse: (task: () => Promise<void>) => void,
  env: Record<string, string | undefined> = process.env,
): ClaimDeps | null {
  if (!claimEnvReady(env)) return null
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
  const resolver = new Resolver({ timeout: 3000, tries: 2 })

  return {
    store: supabaseStore(db),
    secret: env.CLAIM_SIGNING_SECRET!,
    now: () => new Date(),
    getProgram,
    programsOnDomain,
    afterResponse,
    async verifyTurnstile(token, ip) {
      const form = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY!, response: token })
      if (ip !== "unknown") form.set("remoteip", ip)
      try {
        const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          body: form,
          signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) return null
        const result = (await res.json()) as { success?: unknown; hostname?: unknown; action?: unknown }
        return {
          success: result.success === true,
          hostname: typeof result.hostname === "string" ? result.hostname : undefined,
          action: typeof result.action === "string" ? result.action : undefined,
        }
      } catch {
        return null
      }
    },
    async sendEmail(mail) {
      // Only mail someone asked for. Outreach never goes through this sender
      // (Resend's acceptable-use policy forbids it on this shared account).
      if (!ALLOWED_TEMPLATES.has(mail.template)) {
        console.error("claims: email refused, template not allowed")
        return false
      }
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.OA_RESEND_API_KEY}`,
            "Content-Type": "application/json",
            // One claim, one email, even if the request is retried.
            "Idempotency-Key": mail.idempotencyKey,
          },
          body: JSON.stringify({
            from: CLAIM_FROM,
            to: [mail.to],
            reply_to: CLAIM_REPLY_TO,
            subject: mail.subject,
            text: mail.text,
            html: mail.html,
          }),
          signal: AbortSignal.timeout(8000),
        })
        // Status only: the response body echoes the recipient.
        if (!res.ok) console.error("claims: email send failed", res.status)
        return res.ok
      } catch {
        console.error("claims: email send failed", "network")
        return false
      }
    },
    resolveTxt: (domain) => resolver.resolveTxt(domain),
  }
}
