import { Resolver } from "node:dns/promises"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { claimEnvReady, claimReplyTo } from "./rules"
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
  type TurnstileResult,
} from "./service"

/**
 * Claim mail comes from OpenAffiliate's own domain (Sơn, 17/10). The domain
 * must be verified in Resend and OA_RESEND_API_KEY must be allowed to send
 * from it before the flag goes on. Reply-to comes from OA_CLAIM_REPLY_TO
 * (claimReplyTo in rules.ts).
 */
const CLAIM_FROM = "OpenAffiliate <claims@openaffiliate.dev>"
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
    async confirm(id) {
      // Migration 011: activation, member 1 and clearing the claim's copy of
      // the address in one transaction (the database clock decides expiry).
      const { data } = check(await db.rpc("claim_confirm", { p_claim_id: id }))
      const out = data as { result?: unknown; member_id?: unknown } | null
      if (out?.result === "ok" && typeof out.member_id === "string") return { result: "ok", memberId: out.member_id }
      if (out?.result === "gone" || out?.result === "conflict") return { result: out.result }
      throw Object.assign(new Error("claim_confirm returned an unexpected value"), { code: "unexpected_result" })
    },
    async release(claimId, actorId) {
      const { data } = check(await db.rpc("claim_release", { p_claim_id: claimId, p_actor: actorId }))
      return data === true
    },
    async submitEdit(edit, limits) {
      // Migration 012: lock the claim row, re-check the member and the
      // domain, check both quotas, insert the change and its event, all at once.
      const { data } = check(
        await db.rpc("claim_member_submit_edit", {
          p_member_id: edit.member_id,
          p_slug: edit.slug,
          p_domain: edit.domain,
          p_kind: edit.kind,
          p_fields: edit.fields,
          p_daily_limit: limits.perDay,
          p_new_limit: limits.newPerDay,
        }),
      )
      if (data === "ok" || data === "quota" || data === "quota_new" || data === "already_sent" || data === "not_owner") return data
      throw Object.assign(new Error("claim_member_submit_edit returned an unexpected value"), { code: "unexpected_result" })
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
    async findActiveMembers(email) {
      // Member addresses are stored lowercase.
      const { data } = check(
        await members()
          .select("*")
          .eq("email", email.toLowerCase())
          .eq("status", "active")
          .order("created_at", { ascending: true })
          .limit(20),
      )
      return (data ?? []) as MemberRow[]
    },
    async listMembers(claimId) {
      const { data } = check(
        await members().select("*").eq("claim_id", claimId).eq("status", "active").order("created_at", { ascending: true }),
      )
      return (data ?? []) as MemberRow[]
    },
    async removeMember(claimId, actorId, targetId) {
      const { data } = check(
        await db.rpc("claim_remove_member", { p_claim_id: claimId, p_actor: actorId, p_target: targetId }),
      )
      if (data === "ok" || data === "not_owner" || data === "self" || data === "not_found") return data
      throw Object.assign(new Error("claim_remove_member returned an unexpected value"), { code: "unexpected_result" })
    },
    async addSigninCode(row) {
      check(await signinCodes().insert(row))
    },
    async bindSigninCode(id, memberId, codeHash, now) {
      const { data } = check(
        await signinCodes()
          .update({ member_id: memberId, code_hash: codeHash })
          .eq("id", id)
          .is("member_id", null)
          .is("used_at", null)
          .gt("expires_at", now.toISOString())
          .select("id"),
      )
      return (data ?? []).length === 1
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

/** Cloudflare's siteverify answer for a token, or null when it could not be reached. */
export async function siteverify(secretKey: string, token: string, ip: string): Promise<TurnstileResult | null> {
  const form = new URLSearchParams({ secret: secretKey, response: token })
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
}

/** The real dependencies, or null when any claim secret is missing (routes answer 503). */
export function liveClaimDeps(
  getProgram: (slug: string) => ClaimProgram | undefined,
  programsOnDomain: (domain: string) => ClaimProgram[],
  allPrograms: () => readonly ClaimProgram[],
  afterResponse: (task: () => Promise<void>) => void,
  env: Record<string, string | undefined> = process.env,
): ClaimDeps | null {
  if (!claimEnvReady(env)) return null
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
  const resolver = new Resolver({ timeout: 3000, tries: 2 })
  const replyTo = claimReplyTo(env)

  return {
    store: supabaseStore(db),
    secret: env.CLAIM_SIGNING_SECRET!,
    now: () => new Date(),
    getProgram,
    programsOnDomain,
    allPrograms,
    afterResponse,
    verifyTurnstile: (token, ip) => siteverify(env.TURNSTILE_SECRET_KEY!, token, ip),
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
            reply_to: replyTo,
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
