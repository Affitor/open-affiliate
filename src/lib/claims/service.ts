import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto"
import { z } from "zod"
import { parseCommissionMode } from "@/lib/commission-mode"
import type { Program } from "@/lib/programs"
import {
  PILOT_SLUGS,
  TURNSTILE_HOSTNAMES,
  emailMatchesDomain,
  normalizeEmail,
  registrableDomain,
  signupUrlAllowed,
  unclaimableReason,
} from "./rules"

/**
 * Claim flow v1: prove you run a listing's domain (6-digit email code, or a
 * DNS TXT record), then suggest edits that a person reviews before any YAML
 * changes.
 *
 * Everything here takes its I/O through ClaimDeps so the security properties
 * (attempt cap, single use, expiry, rate limits, domain rule) are tested
 * without a database or a mail API. live.ts wires the real ones.
 *
 * Never log a request body, an email address, a code or a token. Identities
 * are stored and counted as HMACs under CLAIM_SIGNING_SECRET.
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export const CODE_TTL_MS = 10 * MINUTE
export const DNS_TTL_MS = 7 * DAY
export const SESSION_TTL_MS = 7 * DAY
/**
 * /privacy promises deletion within 30 days (unverified claims) and 12 months
 * (events). Rows older than these cutoffs are deleted by the daily pg_cron job
 * in migrations 009/011 and by prune() on claim requests, so with a daily run every
 * row is gone by day 30 / day 365. Keep the two in step with the migration.
 */
export const RETENTION_DAYS = { unverifiedClaims: 29, events: 364, signinCodes: 1, removedMembers: 29 } as const
/** Manual-review requests are never verified, so the retention prune removes them. */
const MANUAL_TTL_MS = 30 * DAY
export const MAX_ATTEMPTS = 5
export const DNS_PREFIX = "openaffiliate-verify="

/** Counted in claim_events, so they hold across serverless instances. */
export const LIMITS = {
  /** send-code, dns-start and manual together, per IP hash per hour. */
  requestsPerIpHour: 5,
  dnsChecksPerIpHour: 20,
  /**
   * One code email per address per 24 hours, so the approved copy ("we won't
   * email you again about it") holds for anyone who did not ask.
   */
  codesPerEmailDay: 1,
  codesPerSlugDay: 5,
  codesPerDomainDay: 5,
  /** Site-wide ceiling on code emails per 24 hours. */
  codesSiteDay: 100,
  manualPerEmailDay: 2,
  editsPerClaimDay: 10,
  /**
   * Sign-in requests per address per 24 hours, counted whether or not the
   * address is on a team, and answered the same way either way.
   */
  signinPerEmailDay: 3,
  /** Sign-in code emails per account per 24 hours. */
  signinCodesPerAccountDay: 10,
  /** Teammate additions per account per 24 hours (each sends one email). */
  memberAddsPerAccountDay: 5,
} as const

/** People who may sign in to one account, the person who claimed included. */
export const MAX_MEMBERS = 4

export type ClaimMethod = "email" | "dns" | "manual"
export type ClaimStatus = "pending" | "active" | "released" | "revoked" | "review"

export interface ClaimRow {
  id: string
  slug: string
  domain: string
  email: string | null
  method: ClaimMethod
  ip_hash: string
  code_hash: string | null
  attempts: number
  expires_at: string
  verified_at: string | null
  status: ClaimStatus
  note: string | null
  created_at: string
}

export type NewClaim = Omit<ClaimRow, "attempts" | "verified_at" | "created_at">

export interface ClaimEvent {
  type: string
  claim_id?: string | null
  slug?: string | null
  domain?: string | null
  email_hash?: string | null
  ip_hash?: string | null
  meta?: Record<string, unknown>
}

export interface EventFilter {
  type: string
  since: Date
  claim_id?: string
  slug?: string
  domain?: string
  email_hash?: string
  ip_hash?: string
}

export interface MemberRow {
  id: string
  claim_id: string
  email: string | null
  status: "active" | "removed"
  added_by: string | null
  created_at: string
}

export interface SigninCodeRow {
  id: string
  /** null when the address is on no team; such a row never verifies. */
  member_id: string | null
  code_hash: string
  attempts: number
  expires_at: string
  used_at: string | null
}

export interface EditRow {
  id: string
  slug: string
  kind: "edit" | "new"
  status: string
  pr_url: string | null
  fields: Record<string, unknown>
  created_at: string
}

export type AddMemberResult = { result: "ok"; id: string } | { result: "full" | "exists" | "not_owner" }

export interface ClaimStore {
  addEvent(event: ClaimEvent): Promise<number>
  removeEvent(id: number): Promise<void>
  countEvents(filter: EventFilter): Promise<number>
  addClaim(claim: NewClaim): Promise<void>
  getClaim(id: string): Promise<ClaimRow | null>
  hasActiveOwner(domain: string): Promise<boolean>
  /**
   * Compare-and-swap `attempts` from `seen` to `seen + 1` on a pending,
   * unexpired, unverified claim with fewer than MAX_ATTEMPTS. A code is only
   * compared after this succeeds, so parallel guesses cannot exceed the cap.
   */
  takeAttempt(id: string, seen: number, now: Date): Promise<boolean>
  /**
   * Pending to active, exactly once (`verified_at IS NULL AND status =
   * 'pending' AND expires_at > now`), in the same transaction as member 1
   * (the claim's address) and clearing the claim's copy of that address
   * (migration 011: claim_confirm). "conflict" when the domain already has an
   * active owner.
   */
  confirm(id: string, now: Date): Promise<{ result: "ok"; memberId: string } | { result: "gone" | "conflict" }>
  /**
   * The actor releases the claim: every member removed, every address
   * cleared. false when the actor is no longer an active member of an active
   * claim. Claim row locked, actor re-checked (claim_release).
   */
  release(claimId: string, actorId: string): Promise<boolean>
  /**
   * Queues a member's edit and its `terms.submitted` event, unless the claim
   * already has `dailyLimit` edits in the last 24 hours, or the member or the
   * claim is no longer active. One atomic step under the claim row lock
   * (claim_member_submit_edit), so parallel submissions cannot pass the quota
   * together and a removed member cannot slip one in.
   */
  submitEdit(
    edit: { member_id: string; slug: string; fields: Record<string, unknown> },
    dailyLimit: number,
  ): Promise<"ok" | "quota" | "not_owner">
  /** Unverified claims older than 30 days and events older than a year. */
  prune(now: Date): Promise<void>
  /** Program page events for the owner panel; null when unavailable (the panel hides it). */
  countProgramEvents(slug: string, type: string, since: Date): Promise<number | null>
  /**
   * `addedBy` adds an address to their team under the claim row lock
   * (claim_add_member), so parallel adds cannot pass `max` together.
   * "exists": already on this team. "not_owner": the adder is no longer an
   * active member of an active claim.
   */
  addMember(claimId: string, email: string, addedBy: string, max: number): Promise<AddMemberResult>
  getMember(id: string): Promise<MemberRow | null>
  /** Every active membership of an address (case-insensitive), oldest first. */
  findActiveMembers(email: string): Promise<MemberRow[]>
  listMembers(claimId: string): Promise<MemberRow[]>
  /**
   * The actor removes a teammate, address cleared, under the claim row lock
   * with the actor re-checked (claim_remove_member).
   */
  removeMember(claimId: string, actorId: string, targetId: string): Promise<"ok" | "not_owner" | "self" | "not_found">
  addSigninCode(row: { id: string; member_id: string | null; code_hash: string; expires_at: string }): Promise<void>
  /** Binds an unbound, unused, unexpired sign-in code row to a member and a real code, exactly once. */
  bindSigninCode(id: string, memberId: string, codeHash: string, now: Date): Promise<boolean>
  getSigninCode(id: string): Promise<SigninCodeRow | null>
  /** Same compare-and-swap as takeAttempt, on an unused, unexpired sign-in code. */
  takeSigninAttempt(id: string, seen: number, now: Date): Promise<boolean>
  /** Marks a sign-in code used, exactly once. */
  useSigninCode(id: string, now: Date): Promise<boolean>
  /** Edits queued for a claim, newest first. */
  listEdits(claimId: string): Promise<EditRow[]>
}

export type ClaimProgram = Pick<Program, "slug" | "name" | "url" | "signupUrl" | "commission">

/**
 * Every email the claim flow may send. Each is a reply to something the
 * recipient (or their teammate) just did on the site. live.ts refuses any
 * other template, so outreach can never go out through this sender.
 */
export const MAIL_TEMPLATES = ["claim-code", "signin-code", "member-added"] as const
export type MailTemplate = (typeof MAIL_TEMPLATES)[number]

export interface OutgoingEmail {
  template: MailTemplate
  to: string
  subject: string
  text: string
  html: string
  idempotencyKey: string
}

export interface TurnstileResult {
  success: boolean
  hostname?: string
  action?: string
}

/** One Turnstile action per step, so a token solved for one form cannot be spent on another. */
export type TurnstileAction = "send-code" | "dns-start" | "manual" | "signin"

export interface ClaimDeps {
  store: ClaimStore
  secret: string
  now: () => Date
  getProgram: (slug: string) => ClaimProgram | undefined
  /** Every listing whose website is on this registrable domain. */
  programsOnDomain: (domain: string) => ClaimProgram[]
  /** siteverify's answer, or null when it could not be reached. */
  verifyTurnstile: (token: string, ip: string) => Promise<TurnstileResult | null>
  sendEmail: (mail: OutgoingEmail) => Promise<boolean>
  resolveTxt: (domain: string) => Promise<string[][]>
  /**
   * Runs work after the response is sent (Next's after()). Sign-in mail goes
   * this way so a member's answer takes no longer than a stranger's.
   */
  afterResponse: (task: () => Promise<void>) => void
}

// ---------------------------------------------------------------- crypto

function mac(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("hex")
}

function same(a: string, b: string | null | undefined): boolean {
  if (!b) return false
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

const hashCode = (secret: string, claimId: string, code: string) => mac(secret, `code:${claimId}:${code}`)
const hashDnsToken = (secret: string, claimId: string, token: string) => mac(secret, `dns:${claimId}:${token}`)
const hashSigninCode = (secret: string, codeId: string, code: string) => mac(secret, `signin:${codeId}:${code}`)
const hashIdentity = (secret: string, kind: "ip" | "email", value: string) => mac(secret, `${kind}:${value}`).slice(0, 32)

// ---------------------------------------------------------------- cookies

/**
 * Holds a claim_members id. Only /api/claims reads it: /account is a static
 * page that calls the API from the same site, so the cookie stays Strict and
 * scoped to the API path.
 */
const SESSION_COOKIE = "oa_claim_session"
const PENDING_COOKIE = "oa_claim_pending"
const SIGNIN_PENDING_COOKIE = "oa_signin_pending"
const COOKIE_ATTRS = "Path=/api/claims; HttpOnly; Secure; SameSite=Strict"

function signedCookie(secret: string, name: string, id: string, now: Date, ttlMs: number): string {
  const expires = now.getTime() + ttlMs
  const value = `${id}.${expires}.${mac(secret, `${name}:${id}:${expires}`)}`
  return `${name}=${value}; ${COOKIE_ATTRS}; Max-Age=${Math.floor(ttlMs / 1000)}`
}

function clearCookie(name: string): string {
  return `${name}=; ${COOKIE_ATTRS}; Max-Age=0`
}

function readSignedCookie(req: Request, secret: string, name: string, now: Date): string | null {
  const header = req.headers.get("cookie")
  if (!header) return null
  const raw = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1)
  const [id, expires, signature, ...rest] = (raw ?? "").split(".")
  if (!id || !expires || !signature || rest.length) return null
  if (!same(mac(secret, `${name}:${id}:${expires}`), signature)) return null
  return Number(expires) > now.getTime() ? id : null
}

// ---------------------------------------------------------------- responses

function reply(status: number, body: Record<string, unknown>, cookies: string[] = []): Response {
  const headers = new Headers({ "Cache-Control": "no-store" })
  for (const c of cookies) headers.append("Set-Cookie", c)
  return Response.json(body, { status, headers })
}

function fail(status: number, error: string, message: string, extra: Record<string, unknown> = {}): Response {
  return reply(status, { error, message, ...extra })
}

const notEnabled = () => fail(404, "not_enabled", "Claims are not enabled for this program.")
const tooMany = () => fail(429, "rate_limited", "Too many requests. Try again later.")
const alreadyClaimed = () =>
  fail(409, "already_claimed", "This listing already has an owner. Ask for a manual review if that is wrong.")
/** One code per address per day: after a lost or spent code the way on is DNS or a person. */
const NO_NEW_CODE = "Verify with DNS instead, or ask for a manual review."
const startAgain = () =>
  fail(401, "no_pending_claim", `A code works only in the browser that asked for it, for 10 minutes. ${NO_NEW_CODE}`)

// ---------------------------------------------------------------- email copy

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)

/** Approved copy, verbatim. Transactional only: no offer, no links. */
export function codeEmail(brand: string, code: string): Pick<OutgoingEmail, "subject" | "text" | "html"> {
  const before = [
    "Hi,",
    `Someone (hopefully you) asked to manage the ${brand} affiliate program listing on OpenAffiliate.`,
  ]
  const after = [
    "If this wasn't you, ignore this email. Nothing changes and we won't email you again about it.",
    "OpenAffiliate · openaffiliate.dev",
  ]
  const codeLine = (shown: string) => `Your code is ${shown}. Enter it on openaffiliate.dev within 10 minutes.`
  const text = [...before, codeLine(code), ...after].join("\n\n")
  // code is six digits, so only the brand needs escaping.
  const html = [...before.map(escapeHtml), codeLine(`<strong>${code}</strong>`), ...after.map(escapeHtml)]
    .map((line) => `<p>${line}</p>`)
    .join("\n")
  return { subject: `Your OpenAffiliate code: ${code}`, text, html }
}

const paragraphs = (lines: string[]) => lines.map((line) => `<p>${line}</p>`).join("\n")

/** Sent only to an address that is on a team and just asked to sign in. */
export function signinEmail(code: string): Pick<OutgoingEmail, "subject" | "text" | "html"> {
  const codeLine = (shown: string) => `Your code to sign in to OpenAffiliate is ${shown}. Enter it on openaffiliate.dev within 10 minutes.`
  const after = [
    "If this wasn't you, ignore this email. Nobody can sign in without the code.",
    "OpenAffiliate · openaffiliate.dev",
  ]
  return {
    subject: `Your OpenAffiliate sign-in code: ${code}`,
    text: ["Hi,", codeLine(code), ...after].join("\n\n"),
    html: paragraphs(["Hi,", codeLine(`<strong>${code}</strong>`), ...after]),
  }
}

/** Sent once to an address a teammate just added. Names nobody, links nowhere. */
export function memberAddedEmail(domain: string): Pick<OutgoingEmail, "subject" | "text" | "html"> {
  const lines = [
    "Hi,",
    `A teammate added you to the ${domain} team on OpenAffiliate, so you can update your company's affiliate program listings.`,
    "Sign in at openaffiliate.dev/account with this address. There is no password: we email you a code each time.",
    "If you don't know why you got this, reply and we'll remove you.",
    "OpenAffiliate · openaffiliate.dev",
  ]
  return {
    subject: `You were added to the ${domain} team on OpenAffiliate`,
    text: lines.join("\n\n"),
    // domain comes from tldts (letters, digits, dots, hyphens); escaped anyway.
    html: paragraphs(lines.map(escapeHtml)),
  }
}

// ---------------------------------------------------------------- shared steps

interface Target {
  program: ClaimProgram
  domain: string
}

function pilotTarget(deps: ClaimDeps, slug: string): Target | null {
  if (!PILOT_SLUGS.has(slug)) return null
  const program = deps.getProgram(slug)
  if (!program || unclaimableReason(program.url)) return null
  const domain = registrableDomain(program.url)
  return domain ? { program, domain } : null
}

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown"
}

const ago = (now: Date, ms: number) => new Date(now.getTime() - ms)

async function readBody<T>(req: Request, schema: z.ZodType<T>): Promise<T | null> {
  const parsed = schema.safeParse(await req.json().catch(() => null))
  return parsed.success ? parsed.data : null
}

/**
 * null when the visitor passed Turnstile on our own site, for this step;
 * otherwise the response to send.
 */
async function turnstileFailure(
  req: Request,
  deps: ClaimDeps,
  token: string | undefined,
  action: TurnstileAction,
): Promise<Response | null> {
  if (!token) return fail(400, "turnstile_required", "Complete the check above the button.")
  const result = await deps.verifyTurnstile(token, clientIp(req))
  const passed =
    result?.success === true && TURNSTILE_HOSTNAMES.has(result.hostname ?? "") && result.action === action
  return passed ? null : fail(403, "turnstile_failed", "The check did not pass. Reload the page and try again.")
}

type Identity = { slug: string; domain: string; email_hash: string; ip_hash: string }

/**
 * Records the request first and then counts, so concurrent requests from one
 * IP cannot slip under the limit together, and refused requests keep counting.
 */
async function requestLimited(deps: ClaimDeps, who: Identity, method: ClaimMethod): Promise<boolean> {
  await deps.store.addEvent({ ...who, type: "claim.requested", meta: { method } })
  const count = await deps.store.countEvents({
    type: "claim.requested",
    since: ago(deps.now(), HOUR),
    ip_hash: who.ip_hash,
  })
  return count > LIMITS.requestsPerIpHour
}

/**
 * Reserves a `code.sent` row before the email goes out, then counts every
 * window including it. Over any cap, the reservation is withdrawn. Two racing
 * requests can both be refused; neither can push a window past its cap.
 */
async function reserveCode(deps: ClaimDeps, who: Identity, claimId: string): Promise<number | Response> {
  const since = ago(deps.now(), DAY)
  const id = await deps.store.addEvent({ ...who, type: "code.sent", claim_id: claimId })
  const tryLater = "Too many codes requested for this listing today. Try again tomorrow, or verify with DNS."
  const windows: [Omit<EventFilter, "type">, number, string][] = [
    [
      { since, email_hash: who.email_hash },
      LIMITS.codesPerEmailDay,
      "We already sent a code to this address in the last 24 hours. Use that code, or verify with DNS.",
    ],
    [{ since, slug: who.slug }, LIMITS.codesPerSlugDay, tryLater],
    [{ since, domain: who.domain }, LIMITS.codesPerDomainDay, tryLater],
    [{ since }, LIMITS.codesSiteDay, "We cannot send more codes today. Try again tomorrow."],
  ]
  const counts = await Promise.all(windows.map(([filter]) => deps.store.countEvents({ ...filter, type: "code.sent" })))
  // The site-wide ceiling is one budget for claim and sign-in codes.
  counts[windows.length - 1] += await deps.store.countEvents({ since, type: "signin.code_sent" })
  const over = windows.findIndex(([, cap], i) => counts[i] > cap)
  if (over === -1) return id
  await deps.store.removeEvent(id)
  // The site-wide ceiling is the one maintainers need to hear about.
  if (over === windows.length - 1) await deps.store.addEvent({ type: "cap.reached", meta: { cap: LIMITS.codesSiteDay } })
  return fail(429, "rate_limited", windows[over][2])
}

async function confirmClaim(deps: ClaimDeps, claim: ClaimRow): Promise<Response> {
  const now = deps.now()
  // Activation and member 1 (the person who claimed) are one transaction.
  const result = await deps.store.confirm(claim.id, now)
  if (result.result !== "ok") {
    return result.result === "conflict"
      ? alreadyClaimed()
      : fail(410, "used_or_expired", "This has expired or was already used. Start again, or ask for a manual review.")
  }
  await deps.store.addEvent({
    type: "claim.confirmed",
    claim_id: claim.id,
    slug: claim.slug,
    domain: claim.domain,
    meta: { method: claim.method },
  })
  return reply(200, { ok: true, domain: claim.domain }, [
    // A code mailed to an address at the domain proves that mailbox; a DNS record does not.
    sessionCookie(deps, result.memberId, claim.method === "email", now),
    clearCookie(PENDING_COOKIE),
  ])
}

async function pendingClaim(req: Request, deps: ClaimDeps, slug: string, method: ClaimMethod): Promise<ClaimRow | null> {
  const id = readSignedCookie(req, deps.secret, PENDING_COOKIE, deps.now())
  if (!id) return null
  const claim = await deps.store.getClaim(id)
  return claim && claim.slug === slug && claim.method === method ? claim : null
}

/**
 * A session proven by a mailbox (an email claim, or a sign-in code) is marked
 * inside the signed value; one proven only by a DNS record is not. A DNS
 * record proves the domain, not the contact address typed next to it, so a
 * DNS session never reaches other teams that address is on.
 */
const MAILBOX_MARK = "m_"

function sessionCookie(deps: ClaimDeps, memberId: string, mailbox: boolean, now: Date): string {
  return signedCookie(deps.secret, SESSION_COOKIE, `${mailbox ? MAILBOX_MARK : ""}${memberId}`, now, SESSION_TTL_MS)
}

/**
 * The signed-in member and their account. Member and claim are re-read on
 * every request, so removing a member, releasing or revoking the claim ends
 * the session at once.
 */
async function accountOf(
  req: Request,
  deps: ClaimDeps,
): Promise<{ member: MemberRow; claim: ClaimRow; mailbox: boolean } | null> {
  const value = readSignedCookie(req, deps.secret, SESSION_COOKIE, deps.now())
  if (!value) return null
  const mailbox = value.startsWith(MAILBOX_MARK)
  const member = await deps.store.getMember(mailbox ? value.slice(MAILBOX_MARK.length) : value)
  if (!member || member.status !== "active") return null
  const claim = await deps.store.getClaim(member.claim_id)
  if (!claim || claim.status !== "active" || !claim.verified_at) return null
  return { member, claim, mailbox }
}

async function ownerOf(
  req: Request,
  deps: ClaimDeps,
  slug: string,
): Promise<{ member: MemberRow; claim: ClaimRow; target: Target } | null> {
  const target = pilotTarget(deps, slug)
  if (!target) return null
  const account = await accountOf(req, deps)
  if (!account || account.claim.domain !== target.domain) return null
  return { ...account, target }
}

// ---------------------------------------------------------------- actions

const slugField = z.string().min(1).max(100)
const turnstileField = z.string().max(4096).optional()

const ContactBody = z.object({ slug: slugField, email: z.string().max(320), turnstileToken: turnstileField })
const VerifyBody = z.object({ slug: slugField, code: z.string().max(20) })
const SlugBody = z.object({ slug: slugField })
const ManualBody = ContactBody.extend({ note: z.string().max(1000).optional() })
const TermsBody = z.object({
  slug: slugField,
  terms: z.object({
    rate: z.string().trim().min(1).max(80),
    type: z.enum(["recurring", "one-time", "tiered", "hybrid"]),
    duration: z.string().trim().max(60).optional(),
    cookieDays: z.number().int().min(0).max(3650).nullable().optional(),
    payoutMinimum: z.number().min(0).max(100_000).nullable().optional(),
    signupUrl: z.string().trim().max(500).optional(),
    note: z.string().trim().max(1000).optional(),
  }),
})

const badRequest = () => fail(400, "bad_request", "Check the form and try again.")
const badEmail = () => fail(400, "bad_email", "Enter a single email address, like name@example.com.")

async function sendCode(req: Request, deps: ClaimDeps): Promise<Response> {
  const body = await readBody(req, ContactBody)
  if (!body) return badRequest()
  const target = pilotTarget(deps, body.slug)
  if (!target) return notEnabled()
  const email = normalizeEmail(body.email)
  if (!email) return badEmail()
  // Before Turnstile and before any write: a mismatch sends nothing and costs
  // nothing, and the visitor keeps their Turnstile token to fix a typo.
  if (!emailMatchesDomain(email, target.domain)) {
    return fail(400, "domain_mismatch", `Use an email address at ${target.domain}, or verify with DNS.`)
  }
  const turnstile = await turnstileFailure(req, deps, body.turnstileToken, "send-code")
  if (turnstile) return turnstile

  const who: Identity = {
    slug: body.slug,
    domain: target.domain,
    email_hash: hashIdentity(deps.secret, "email", email.toLowerCase()),
    ip_hash: hashIdentity(deps.secret, "ip", clientIp(req)),
  }
  if (await requestLimited(deps, who, "email")) return tooMany()
  await deps.store.prune(deps.now())
  if (await deps.store.hasActiveOwner(target.domain)) return alreadyClaimed()

  const claimId = randomUUID()
  const reservation = await reserveCode(deps, who, claimId)
  if (reservation instanceof Response) return reservation

  const now = deps.now()
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0")
  await deps.store.addClaim({
    id: claimId,
    slug: body.slug,
    domain: target.domain,
    email,
    method: "email",
    ip_hash: who.ip_hash,
    code_hash: hashCode(deps.secret, claimId, code),
    expires_at: new Date(now.getTime() + CODE_TTL_MS).toISOString(),
    status: "pending",
    note: null,
  })
  const sent = await deps.sendEmail({
    template: "claim-code",
    to: email,
    ...codeEmail(target.program.name, code),
    idempotencyKey: claimId,
  })
  if (!sent) {
    // The claim row stays unusable (nobody holds its code) and is pruned later.
    await deps.store.removeEvent(reservation)
    return fail(502, "send_failed", "We could not send the email. Try again in a few minutes.")
  }
  return reply(200, { ok: true, domain: target.domain }, [
    signedCookie(deps.secret, PENDING_COOKIE, claimId, now, CODE_TTL_MS),
  ])
}

async function verifyCode(req: Request, deps: ClaimDeps): Promise<Response> {
  const body = await readBody(req, VerifyBody)
  if (!body) return badRequest()
  const code = body.code.replace(/\s/g, "")
  if (!/^\d{6}$/.test(code)) return fail(400, "bad_code", "Enter the 6-digit code from the email.")
  const claim = await pendingClaim(req, deps, body.slug, "email")
  if (!claim) return startAgain()

  const now = deps.now()
  if (claim.status !== "pending" || claim.verified_at) {
    return fail(410, "used_or_expired", "This code was already used.")
  }
  if (Date.parse(claim.expires_at) <= now.getTime()) {
    return fail(410, "used_or_expired", `This code has expired. ${NO_NEW_CODE}`)
  }
  if (claim.attempts >= MAX_ATTEMPTS) return fail(429, "too_many_attempts", `Too many attempts. ${NO_NEW_CODE}`)
  // Spend the attempt before comparing: a guess that loses the race is never compared.
  if (!(await deps.store.takeAttempt(claim.id, claim.attempts, now))) {
    return fail(409, "retry", "Try that code again.")
  }
  if (!same(hashCode(deps.secret, claim.id, code), claim.code_hash)) {
    await deps.store.addEvent({ type: "code.failed", claim_id: claim.id, slug: claim.slug, domain: claim.domain })
    const left = MAX_ATTEMPTS - (claim.attempts + 1)
    return left > 0
      ? fail(400, "wrong_code", `That code is not right. ${left} ${left === 1 ? "try" : "tries"} left.`, { attemptsLeft: left })
      : fail(429, "too_many_attempts", `Too many attempts. ${NO_NEW_CODE}`, { attemptsLeft: 0 })
  }
  return confirmClaim(deps, claim)
}

async function startDns(req: Request, deps: ClaimDeps): Promise<Response> {
  const body = await readBody(req, ContactBody)
  if (!body) return badRequest()
  const target = pilotTarget(deps, body.slug)
  if (!target) return notEnabled()
  // Any address works here: it is how we reach the owner, not the proof.
  const email = normalizeEmail(body.email)
  if (!email) return badEmail()
  const turnstile = await turnstileFailure(req, deps, body.turnstileToken, "dns-start")
  if (turnstile) return turnstile

  const who: Identity = {
    slug: body.slug,
    domain: target.domain,
    email_hash: hashIdentity(deps.secret, "email", email.toLowerCase()),
    ip_hash: hashIdentity(deps.secret, "ip", clientIp(req)),
  }
  if (await requestLimited(deps, who, "dns")) return tooMany()
  await deps.store.prune(deps.now())
  if (await deps.store.hasActiveOwner(target.domain)) return alreadyClaimed()

  const now = deps.now()
  const claimId = randomUUID()
  const token = randomBytes(32).toString("base64url")
  await deps.store.addClaim({
    id: claimId,
    slug: body.slug,
    domain: target.domain,
    email,
    method: "dns",
    ip_hash: who.ip_hash,
    code_hash: hashDnsToken(deps.secret, claimId, token),
    expires_at: new Date(now.getTime() + DNS_TTL_MS).toISOString(),
    status: "pending",
    note: null,
  })
  return reply(200, { ok: true, domain: target.domain, record: `${DNS_PREFIX}${token}` }, [
    signedCookie(deps.secret, PENDING_COOKIE, claimId, now, DNS_TTL_MS),
  ])
}

async function checkDns(req: Request, deps: ClaimDeps): Promise<Response> {
  const body = await readBody(req, SlugBody)
  if (!body) return badRequest()
  const claim = await pendingClaim(req, deps, body.slug, "dns")
  if (!claim) return fail(401, "no_pending_claim", "Start DNS verification first to get your record.")
  const now = deps.now()
  if (claim.status !== "pending" || claim.verified_at || Date.parse(claim.expires_at) <= now.getTime()) {
    return fail(410, "used_or_expired", "This DNS record has expired or was already used. Start again.")
  }
  const ipHash = hashIdentity(deps.secret, "ip", clientIp(req))
  await deps.store.addEvent({ type: "dns.checked", claim_id: claim.id, slug: claim.slug, domain: claim.domain, ip_hash: ipHash })
  const checks = await deps.store.countEvents({ type: "dns.checked", since: ago(now, HOUR), ip_hash: ipHash })
  if (checks > LIMITS.dnsChecksPerIpHour) return tooMany()

  const records = await deps.resolveTxt(claim.domain).catch(() => [] as string[][])
  // Only this claim's token matches: the hash binds it to the claim id.
  const found = records
    .map((chunks) => chunks.join("").trim())
    .filter((txt) => txt.startsWith(DNS_PREFIX))
    .some((txt) => same(hashDnsToken(deps.secret, claim.id, txt.slice(DNS_PREFIX.length).trim()), claim.code_hash))
  if (!found) {
    return fail(404, "dns_not_found", `No matching TXT record on ${claim.domain} yet. DNS changes can take a few hours to show.`)
  }
  return confirmClaim(deps, claim)
}

async function requestManual(req: Request, deps: ClaimDeps): Promise<Response> {
  const body = await readBody(req, ManualBody)
  if (!body) return badRequest()
  const target = pilotTarget(deps, body.slug)
  if (!target) return notEnabled()
  const email = normalizeEmail(body.email)
  if (!email) return badEmail()
  const turnstile = await turnstileFailure(req, deps, body.turnstileToken, "manual")
  if (turnstile) return turnstile

  const now = deps.now()
  const who: Identity = {
    slug: body.slug,
    domain: target.domain,
    email_hash: hashIdentity(deps.secret, "email", email.toLowerCase()),
    ip_hash: hashIdentity(deps.secret, "ip", clientIp(req)),
  }
  if (await requestLimited(deps, who, "manual")) return tooMany()
  await deps.store.addEvent({ ...who, type: "manual.requested" })
  const sameEmail = await deps.store.countEvents({ type: "manual.requested", since: ago(now, DAY), email_hash: who.email_hash })
  if (sameEmail > LIMITS.manualPerEmailDay) return tooMany()
  await deps.store.prune(now)

  await deps.store.addClaim({
    id: randomUUID(),
    slug: body.slug,
    domain: target.domain,
    email,
    method: "manual",
    ip_hash: who.ip_hash,
    code_hash: null,
    expires_at: new Date(now.getTime() + MANUAL_TTL_MS).toISOString(),
    status: "review",
    note: body.note?.trim() || null,
  })
  return reply(200, { ok: true })
}

async function session(req: Request, deps: ClaimDeps): Promise<Response> {
  const slug = new URL(req.url).searchParams.get("slug") ?? ""
  const owner = await ownerOf(req, deps, slug)
  if (!owner) return reply(200, { owner: false })
  const since = ago(deps.now(), 90 * DAY)
  const [views, clicks] = await Promise.all([
    deps.store.countProgramEvents(slug, "program_view", since),
    deps.store.countProgramEvents(slug, "outbound_click", since),
  ])
  return reply(200, { owner: true, domain: owner.claim.domain, stats: { views, clicks } })
}

/** Marks edits a person must confirm with the owner before applying them. */
export function editFlags(program: ClaimProgram, terms: { rate: string; signupUrl?: string }): string[] {
  const flags: string[] = []
  const next = parseCommissionMode(terms.rate)
  const current = program.commission
  if (current.value != null && next.value != null && next.mode === current.mode && next.value < current.value * 0.5) {
    flags.push("commission_drop_over_50pct")
  }
  if (terms.signupUrl && registrableDomain(terms.signupUrl) !== registrableDomain(program.signupUrl ?? program.url)) {
    flags.push("signup_domain_changed")
  }
  return flags
}

async function submitTerms(req: Request, deps: ClaimDeps): Promise<Response> {
  const body = await readBody(req, TermsBody)
  if (!body) return badRequest()
  const owner = await ownerOf(req, deps, body.slug)
  if (!owner) return fail(401, "not_owner", "Verify that you run this listing first.")
  const { terms } = body
  if (terms.signupUrl && !signupUrlAllowed(terms.signupUrl)) {
    return fail(400, "bad_signup_url", "Use a full https:// link to your affiliate signup page.")
  }

  const derived = parseCommissionMode(terms.rate)
  // A queue row for a person to review and turn into a YAML PR. Nothing here
  // writes to the registry.
  const result = await deps.store.submitEdit(
    {
      member_id: owner.member.id,
      slug: body.slug,
      fields: { ...terms, mode: derived.mode, value: derived.value, flags: editFlags(owner.target.program, terms) },
    },
    LIMITS.editsPerClaimDay,
  )
  if (result === "not_owner") return fail(401, "not_owner", "Verify that you run this listing first.")
  if (result === "quota") return tooMany()
  return reply(200, { ok: true })
}

/** Ends the account: every member is signed out and the listings show as unclaimed again. */
async function release(req: Request, deps: ClaimDeps): Promise<Response> {
  const body = await readBody(req, ReleaseBody)
  if (!body) return badRequest()
  const account = await accountOf(req, deps)
  if (!account) return notSignedIn()
  const { member, claim } = account
  // The page names the account it shows (a slug on the claim page, a domain
  // on /account); a session switched in another tab must not release a
  // different one.
  const expected = body.slug ? pilotTarget(deps, body.slug)?.domain : body.domain
  if (expected !== claim.domain) return accountChanged()
  if (!(await deps.store.release(claim.id, member.id))) return notSignedIn()
  await deps.store.addEvent({ type: "claim.released", claim_id: claim.id, slug: claim.slug, domain: claim.domain })
  return reply(200, { ok: true }, [clearCookie(SESSION_COOKIE)])
}

// ---------------------------------------------------------------- account (v4)

const notSignedIn = () => fail(401, "not_signed_in", "Sign in first.")
const accountChanged = () => fail(409, "account_changed", "You are signed in to another account now. Reload this page.")
const domainField = z.string().min(1).max(253)
const SigninBody = z.object({ email: z.string().max(320), turnstileToken: turnstileField })
const CodeBody = z.object({ code: z.string().max(20) })
const ReleaseBody = z
  .object({ slug: slugField.optional(), domain: domainField.optional() })
  .refine((b) => Boolean(b.slug) !== Boolean(b.domain))
const MemberEmailBody = z.object({ domain: domainField, email: z.string().max(320) })
const MemberIdBody = z.object({ domain: domainField, memberId: z.string().uuid() })
const SwitchBody = z.object({ memberId: z.string().uuid() })

/**
 * Step 1 of sign-in. Everything before the response is the same for any
 * address: limits, a code row bound to nobody (the hash of a code nobody was
 * given), the same body and cookie. Whether the address is on a team is
 * looked up only after the response is sent; if it is, and the account's and
 * the site's daily caps allow, the row is bound to the member and a real code
 * is mailed. Status, body, cookie, timing and the next step therefore say
 * nothing about membership.
 */
async function signinCode(req: Request, deps: ClaimDeps): Promise<Response> {
  const body = await readBody(req, SigninBody)
  if (!body) return badRequest()
  const email = normalizeEmail(body.email)
  if (!email) return badEmail()
  const turnstile = await turnstileFailure(req, deps, body.turnstileToken, "signin")
  if (turnstile) return turnstile

  const now = deps.now()
  const emailHash = hashIdentity(deps.secret, "email", email.toLowerCase())
  const ipHash = hashIdentity(deps.secret, "ip", clientIp(req))
  await deps.store.addEvent({ type: "signin.requested", email_hash: emailHash, ip_hash: ipHash })
  const [byIp, byEmail] = await Promise.all([
    deps.store.countEvents({ type: "signin.requested", since: ago(now, HOUR), ip_hash: ipHash }),
    deps.store.countEvents({ type: "signin.requested", since: ago(now, DAY), email_hash: emailHash }),
  ])
  if (byIp > LIMITS.requestsPerIpHour) return tooMany()
  if (byEmail > LIMITS.signinPerEmailDay) {
    return fail(429, "rate_limited", "Too many code requests for this address today. Use the newest code you received, or try again tomorrow.")
  }
  await deps.store.prune(now)

  const codeId = randomUUID()
  await deps.store.addSigninCode({
    id: codeId,
    member_id: null,
    code_hash: hashSigninCode(deps.secret, codeId, randomBytes(16).toString("hex")),
    expires_at: new Date(now.getTime() + CODE_TTL_MS).toISOString(),
  })
  deps.afterResponse(() => mailSigninCode(deps, email, codeId))
  return reply(200, { ok: true }, [signedCookie(deps.secret, SIGNIN_PENDING_COOKIE, codeId, now, CODE_TTL_MS)])
}

/** After the response: bind the code row to the address's team and mail a real code, within the caps. */
async function mailSigninCode(deps: ClaimDeps, email: string, codeId: string): Promise<void> {
  // An address on several teams signs in to the oldest; the account page offers the others.
  let target: { member: MemberRow; claim: ClaimRow } | null = null
  for (const m of await deps.store.findActiveMembers(email)) {
    const claim = await deps.store.getClaim(m.claim_id)
    if (claim?.status === "active" && claim.verified_at) {
      target = { member: m, claim }
      break
    }
  }
  const to = target?.member.email
  if (!target || !to) return
  const { member, claim } = target

  const now = deps.now()
  const since = ago(now, DAY)
  const reservation = await deps.store.addEvent({ type: "signin.code_sent", claim_id: claim.id, domain: claim.domain })
  const [forAccount, signinSite, claimSite] = await Promise.all([
    deps.store.countEvents({ type: "signin.code_sent", since, claim_id: claim.id }),
    deps.store.countEvents({ type: "signin.code_sent", since }),
    deps.store.countEvents({ type: "code.sent", since }),
  ])
  const overSite = signinSite + claimSite > LIMITS.codesSiteDay
  if (forAccount > LIMITS.signinCodesPerAccountDay || overSite) {
    await deps.store.removeEvent(reservation)
    if (overSite) await deps.store.addEvent({ type: "cap.reached", meta: { cap: LIMITS.codesSiteDay } })
    return
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0")
  if (!(await deps.store.bindSigninCode(codeId, member.id, hashSigninCode(deps.secret, codeId, code), now))) {
    await deps.store.removeEvent(reservation)
    return
  }
  const sent = await deps.sendEmail({ template: "signin-code", to, ...signinEmail(code), idempotencyKey: codeId })
  // A failed send gives the quota back; the person asks again.
  if (!sent) await deps.store.removeEvent(reservation)
}

/** Step 2 of sign-in: the code from the email, in the browser that asked for it. */
async function signinVerify(req: Request, deps: ClaimDeps): Promise<Response> {
  const body = await readBody(req, CodeBody)
  if (!body) return badRequest()
  const code = body.code.replace(/\s/g, "")
  if (!/^\d{6}$/.test(code)) return fail(400, "bad_code", "Enter the 6-digit code from the email.")
  const id = readSignedCookie(req, deps.secret, SIGNIN_PENDING_COOKIE, deps.now())
  const row = id ? await deps.store.getSigninCode(id) : null
  if (!row) return fail(401, "no_pending_signin", "A code works only in the browser that asked for it, for 10 minutes. Ask for a new one.")

  const now = deps.now()
  if (row.used_at) return fail(410, "used_or_expired", "This code was already used. Ask for a new one.")
  if (Date.parse(row.expires_at) <= now.getTime()) return fail(410, "used_or_expired", "This code has expired. Ask for a new one.")
  if (row.attempts >= MAX_ATTEMPTS) return fail(429, "too_many_attempts", "Too many attempts. Ask for a new code.")
  if (!(await deps.store.takeSigninAttempt(row.id, row.attempts, now))) return fail(409, "retry", "Try that code again.")
  if (!same(hashSigninCode(deps.secret, row.id, code), row.code_hash) || !row.member_id) {
    const left = MAX_ATTEMPTS - (row.attempts + 1)
    return left > 0
      ? fail(400, "wrong_code", `That code is not right. ${left} ${left === 1 ? "try" : "tries"} left.`, { attemptsLeft: left })
      : fail(429, "too_many_attempts", "Too many attempts. Ask for a new code.", { attemptsLeft: 0 })
  }

  const member = await deps.store.getMember(row.member_id)
  const claim = member?.status === "active" ? await deps.store.getClaim(member.claim_id) : null
  if (!member || !claim || claim.status !== "active" || !claim.verified_at) {
    return fail(410, "used_or_expired", "This account is no longer active.")
  }
  if (!(await deps.store.useSigninCode(row.id, now))) return fail(410, "used_or_expired", "This code was already used. Ask for a new one.")
  await deps.store.addEvent({ type: "signin.ok", claim_id: claim.id, domain: claim.domain })
  return reply(200, { ok: true, domain: claim.domain }, [
    sessionCookie(deps, member.id, true, now),
    clearCookie(SIGNIN_PENDING_COOKIE),
  ])
}

async function signout(): Promise<Response> {
  return reply(200, { ok: true }, [clearCookie(SESSION_COOKIE)])
}

/** Everything the account page shows. Members see their own team's addresses, nobody else's. */
async function account(req: Request, deps: ClaimDeps): Promise<Response> {
  const acct = await accountOf(req, deps)
  if (!acct) return reply(200, { signedIn: false })
  const { member, claim } = acct
  const since = ago(deps.now(), 90 * DAY)
  const listings = deps.programsOnDomain(claim.domain).slice(0, 50)
  const [programs, members, edits, mine] = await Promise.all([
    Promise.all(
      listings.map(async (p) => {
        const [views, clicks] = await Promise.all([
          deps.store.countProgramEvents(p.slug, "program_view", since),
          deps.store.countProgramEvents(p.slug, "outbound_click", since),
        ])
        return { slug: p.slug, name: p.name, editable: PILOT_SLUGS.has(p.slug), stats: { views, clicks } }
      }),
    ),
    deps.store.listMembers(claim.id),
    deps.store.listEdits(claim.id),
    // Only a mailbox-proven session may see the other teams its address is on.
    acct.mailbox && member.email ? deps.store.findActiveMembers(member.email) : Promise.resolve([] as MemberRow[]),
  ])
  // Other teams this same address is on (an agency, say): offered as a switch.
  const otherAccounts: { memberId: string; domain: string }[] = []
  for (const m of mine) {
    if (m.id === member.id) continue
    const c = await deps.store.getClaim(m.claim_id)
    if (c?.status === "active" && c.verified_at) otherAccounts.push({ memberId: m.id, domain: c.domain })
  }
  return reply(200, {
    signedIn: true,
    domain: claim.domain,
    you: { id: member.id, email: member.email },
    maxMembers: MAX_MEMBERS,
    otherAccounts,
    programs,
    members: members.map((m) => ({ id: m.id, email: m.email, addedAt: m.created_at, you: m.id === member.id })),
    changes: edits.map((e) => ({
      slug: e.slug,
      kind: e.kind,
      status: e.status,
      prUrl: e.pr_url,
      fields: Object.keys(e.fields).filter((k) => k !== "flags"),
      sentAt: e.created_at,
    })),
  })
}

async function addTeammate(req: Request, deps: ClaimDeps): Promise<Response> {
  const body = await readBody(req, MemberEmailBody)
  if (!body) return badRequest()
  const acct = await accountOf(req, deps)
  if (!acct) return notSignedIn()
  const { member, claim } = acct
  if (body.domain !== claim.domain) return accountChanged()
  const email = normalizeEmail(body.email)
  if (!email) return badEmail()
  // Teammates are proven the same way as a claim: an address at the domain.
  if (!emailMatchesDomain(email, claim.domain)) {
    return fail(400, "domain_mismatch", `Teammates need an address at ${claim.domain}.`)
  }
  await deps.store.addEvent({ type: "member.add_requested", claim_id: claim.id, domain: claim.domain })
  const adds = await deps.store.countEvents({ type: "member.add_requested", since: ago(deps.now(), DAY), claim_id: claim.id })
  if (adds > LIMITS.memberAddsPerAccountDay) return tooMany()

  const result = await deps.store.addMember(claim.id, email, member.id, MAX_MEMBERS)
  if (result.result !== "ok") {
    if (result.result === "not_owner") return notSignedIn()
    if (result.result === "full") {
      return fail(409, "team_full", `Your team is full (${MAX_MEMBERS} of ${MAX_MEMBERS}). Remove someone to add a new teammate.`)
    }
    // "exists" is per team (migration 011): it says nothing about other teams.
    return fail(409, "already_member", "This address is already on your team.")
  }
  await deps.store.addEvent({ type: "member.added", claim_id: claim.id, domain: claim.domain })
  // Best effort: the teammate can sign in whether or not this arrives.
  await deps.sendEmail({ template: "member-added", to: email, ...memberAddedEmail(claim.domain), idempotencyKey: result.id })
  return reply(200, { ok: true })
}

async function removeTeammate(req: Request, deps: ClaimDeps): Promise<Response> {
  const body = await readBody(req, MemberIdBody)
  if (!body) return badRequest()
  const acct = await accountOf(req, deps)
  if (!acct) return notSignedIn()
  if (body.domain !== acct.claim.domain) return accountChanged()
  const result = await deps.store.removeMember(acct.claim.id, acct.member.id, body.memberId)
  if (result === "self") return fail(400, "cannot_remove_self", "Ask a teammate to remove you, or release the listing.")
  if (result === "not_owner") return notSignedIn()
  if (result === "not_found") return fail(404, "not_found", "No such teammate.")
  await deps.store.addEvent({ type: "member.removed", claim_id: acct.claim.id, domain: acct.claim.domain })
  return reply(200, { ok: true })
}

/** Moves a mailbox-proven session to another team the same address is on. */
async function switchAccount(req: Request, deps: ClaimDeps): Promise<Response> {
  const body = await readBody(req, SwitchBody)
  if (!body) return badRequest()
  const acct = await accountOf(req, deps)
  if (!acct) return notSignedIn()
  if (!acct.mailbox) return fail(403, "mailbox_unproven", "Sign in with your email to switch teams.")
  const target = await deps.store.getMember(body.memberId)
  const claim = target?.status === "active" ? await deps.store.getClaim(target.claim_id) : null
  // Same person: the address that proved itself for this session.
  if (!target || !claim || claim.status !== "active" || !claim.verified_at || !acct.member.email || target.email !== acct.member.email) {
    return fail(404, "not_found", "No such account.")
  }
  return reply(200, { ok: true, domain: claim.domain }, [sessionCookie(deps, target.id, true, deps.now())])
}

const POST_ACTIONS: Record<string, (req: Request, deps: ClaimDeps) => Promise<Response>> = {
  "send-code": sendCode,
  verify: verifyCode,
  "dns-start": startDns,
  "dns-check": checkDns,
  manual: requestManual,
  terms: submitTerms,
  release,
  "signin-code": signinCode,
  "signin-verify": signinVerify,
  signout,
  "member-add": addTeammate,
  "member-remove": removeTeammate,
  "account-switch": switchAccount,
}

const GET_ACTIONS: Record<string, (req: Request, deps: ClaimDeps) => Promise<Response>> = { session, account }

export async function handleClaim(action: string, req: Request, deps: ClaimDeps): Promise<Response> {
  const table = req.method === "GET" ? GET_ACTIONS : POST_ACTIONS
  // hasOwn: "constructor" or "__proto__" must not resolve to an inherited function.
  const handler = Object.hasOwn(table, action) ? table[action] : undefined
  if (!handler) return fail(404, "not_found", "Unknown claim action.")
  try {
    return await handler(req, deps)
  } catch (err) {
    // The error code only: messages and details can echo row values.
    const code = (typeof err === "object" && err && "code" in err && String(err.code)) || "unknown"
    console.error("claims: action failed", action, code)
    return fail(500, "server_error", "Something went wrong. Try again later.")
  }
}

export const claimDisabledResponse = () =>
  Response.json({ error: "claims_disabled", message: "claims not enabled" }, { status: 503, headers: { "Cache-Control": "no-store" } })
