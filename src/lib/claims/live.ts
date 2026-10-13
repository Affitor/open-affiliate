import { Resolver } from "node:dns/promises"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { claimEnvReady } from "./rules"
import { MAX_ATTEMPTS, type ClaimDeps, type ClaimProgram, type ClaimRow, type ClaimStore } from "./service"

/**
 * affitor.com is the domain verified in the Resend account; openaffiliate.dev
 * is not.
 */
const CLAIM_FROM = "OpenAffiliate <claims@affitor.com>"
const CLAIM_REPLY_TO = "support@affitor.com"

const DAY = 24 * 60 * 60 * 1000

function supabaseStore(db: SupabaseClient): ClaimStore {
  const claims = () => db.from("program_claims")
  const events = () => db.from("claim_events")
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
    },
    async addEdit(edit) {
      check(await db.from("claim_edits").insert(edit))
    },
    async prune(now) {
      check(
        await claims()
          .delete()
          .is("verified_at", null)
          .lt("created_at", new Date(now.getTime() - 30 * DAY).toISOString()),
      )
      check(await events().delete().lt("created_at", new Date(now.getTime() - 365 * DAY).toISOString()))
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
    async verifyTurnstile(token, ip) {
      const form = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY!, response: token })
      if (ip !== "unknown") form.set("remoteip", ip)
      try {
        const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          body: form,
          signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) return false
        const result = (await res.json()) as { success?: unknown }
        return result.success === true
      } catch {
        return false
      }
    },
    async sendEmail(mail) {
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
