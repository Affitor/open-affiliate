import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto"
import { z } from "zod"
import { parseCommissionMode } from "@/lib/commission-mode"
import type { Program } from "@/lib/programs"
import { PILOT_SLUGS, emailMatchesDomain, normalizeEmail, registrableDomain, unclaimableReason } from "./rules"

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
/** Manual-review requests are never verified, so the 30-day prune removes them. */
const MANUAL_TTL_MS = 30 * DAY
export const MAX_ATTEMPTS = 5
export const DNS_PREFIX = "openaffiliate-verify="

/** Counted in claim_events, so they hold across serverless instances. */
export const LIMITS = {
  /** send-code, dns-start and manual together, per IP hash per hour. */
  requestsPerIpHour: 5,
  dnsChecksPerIpHour: 20,
  codesPerEmail10Min: 1,
  codesPerEmailDay: 3,
  codesPerSlugDay: 5,
  codesPerDomainDay: 5,
  /** Site-wide ceiling on code emails per 24 hours. */
  codesSiteDay: 100,
  manualPerEmailDay: 2,
  editsPerClaimDay: 10,
} as const

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
   * Pending to active, exactly once: `verified_at IS NULL AND status =
   * 'pending' AND expires_at > now`. "conflict" when the domain already has
   * an active owner (unique index).
   */
  confirm(id: string, now: Date): Promise<"ok" | "gone" | "conflict">
  /** Ends the claim and forgets the owner's address. */
  release(id: string): Promise<void>
  addEdit(edit: { claim_id: string; slug: string; fields: Record<string, unknown> }): Promise<void>
  /** Unverified claims older than 30 days and events older than a year. */
  prune(now: Date): Promise<void>
  /** Program page events for the owner panel; null when unavailable (the panel hides it). */
  countProgramEvents(slug: string, type: string, since: Date): Promise<number | null>
}

export type ClaimProgram = Pick<Program, "slug" | "name" | "url" | "signupUrl" | "commission">

export interface OutgoingEmail {
  to: string
  subject: string
  text: string
  html: string
  idempotencyKey: string
}

export interface ClaimDeps {
  store: ClaimStore
  secret: string
  now: () => Date
  getProgram: (slug: string) => ClaimProgram | undefined
  verifyTurnstile: (token: string, ip: string) => Promise<boolean>
  sendEmail: (mail: OutgoingEmail) => Promise<boolean>
  resolveTxt: (domain: string) => Promise<string[][]>
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
const hashIdentity = (secret: string, kind: "ip" | "email", value: string) => mac(secret, `${kind}:${value}`).slice(0, 32)

// ---------------------------------------------------------------- cookies

const SESSION_COOKIE = "oa_claim_session"
const PENDING_COOKIE = "oa_claim_pending"
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
const startAgain = () => fail(401, "no_pending_claim", "Start again to get a new code.")

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

/** null when the visitor passed Turnstile; otherwise the response to send. */
async function turnstileFailure(req: Request, deps: ClaimDeps, token: string | undefined): Promise<Response | null> {
  if (!token) return fail(400, "turnstile_required", "Complete the check above the button.")
  if (!(await deps.verifyTurnstile(token, clientIp(req)))) {
    return fail(403, "turnstile_failed", "The check did not pass. Reload the page and try again.")
  }
  return null
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
async function reserveCode(deps: ClaimDeps, who: Identity, claimId: string): Promise<number | null> {
  const now = deps.now()
  const id = await deps.store.addEvent({ ...who, type: "code.sent", claim_id: claimId })
  const windows: [Omit<EventFilter, "type">, number][] = [
    [{ since: ago(now, 10 * MINUTE), email_hash: who.email_hash }, LIMITS.codesPerEmail10Min],
    [{ since: ago(now, DAY), email_hash: who.email_hash }, LIMITS.codesPerEmailDay],
    [{ since: ago(now, DAY), slug: who.slug }, LIMITS.codesPerSlugDay],
    [{ since: ago(now, DAY), domain: who.domain }, LIMITS.codesPerDomainDay],
    [{ since: ago(now, DAY) }, LIMITS.codesSiteDay],
  ]
  const counts = await Promise.all(windows.map(([filter]) => deps.store.countEvents({ ...filter, type: "code.sent" })))
  const over = windows.findIndex(([, cap], i) => counts[i] > cap)
  if (over === -1) return id
  await deps.store.removeEvent(id)
  // The site-wide ceiling is the one maintainers need to hear about.
  if (over === windows.length - 1) await deps.store.addEvent({ type: "cap.reached", meta: { cap: LIMITS.codesSiteDay } })
  return null
}

async function confirmClaim(deps: ClaimDeps, claim: ClaimRow): Promise<Response> {
  const now = deps.now()
  const result = await deps.store.confirm(claim.id, now)
  if (result === "conflict") return alreadyClaimed()
  if (result === "gone") return fail(410, "used_or_expired", "This code has expired or was already used. Request a new one.")
  await deps.store.addEvent({
    type: "claim.confirmed",
    claim_id: claim.id,
    slug: claim.slug,
    domain: claim.domain,
    meta: { method: claim.method },
  })
  return reply(200, { ok: true, domain: claim.domain }, [
    signedCookie(deps.secret, SESSION_COOKIE, claim.id, now, SESSION_TTL_MS),
    clearCookie(PENDING_COOKIE),
  ])
}

async function pendingClaim(req: Request, deps: ClaimDeps, slug: string, method: ClaimMethod): Promise<ClaimRow | null> {
  const id = readSignedCookie(req, deps.secret, PENDING_COOKIE, deps.now())
  if (!id) return null
  const claim = await deps.store.getClaim(id)
  return claim && claim.slug === slug && claim.method === method ? claim : null
}

async function ownerOf(req: Request, deps: ClaimDeps, slug: string): Promise<{ claim: ClaimRow; target: Target } | null> {
  const target = pilotTarget(deps, slug)
  if (!target) return null
  const id = readSignedCookie(req, deps.secret, SESSION_COOKIE, deps.now())
  if (!id) return null
  const claim = await deps.store.getClaim(id)
  // Checked on every request, so a release or a revoke ends the session at once.
  if (!claim || claim.status !== "active" || !claim.verified_at || claim.domain !== target.domain) return null
  return { claim, target }
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
  const turnstile = await turnstileFailure(req, deps, body.turnstileToken)
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
  if (reservation === null) return fail(429, "rate_limited", "Too many codes requested. Try again later.")

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
  const sent = await deps.sendEmail({ to: email, ...codeEmail(target.program.name, code), idempotencyKey: claimId })
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
    return fail(410, "used_or_expired", "This code was already used. Request a new one.")
  }
  if (Date.parse(claim.expires_at) <= now.getTime()) {
    return fail(410, "used_or_expired", "This code has expired. Request a new one.")
  }
  if (claim.attempts >= MAX_ATTEMPTS) return fail(429, "too_many_attempts", "Too many attempts. Request a new code.")
  // Spend the attempt before comparing: a guess that loses the race is never compared.
  if (!(await deps.store.takeAttempt(claim.id, claim.attempts, now))) {
    return fail(409, "retry", "Try that code again.")
  }
  if (!same(hashCode(deps.secret, claim.id, code), claim.code_hash)) {
    await deps.store.addEvent({ type: "code.failed", claim_id: claim.id, slug: claim.slug, domain: claim.domain })
    const left = MAX_ATTEMPTS - (claim.attempts + 1)
    return left > 0
      ? fail(400, "wrong_code", `That code is not right. ${left} ${left === 1 ? "try" : "tries"} left.`, { attemptsLeft: left })
      : fail(429, "too_many_attempts", "Too many attempts. Request a new code.", { attemptsLeft: 0 })
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
  const turnstile = await turnstileFailure(req, deps, body.turnstileToken)
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
  const turnstile = await turnstileFailure(req, deps, body.turnstileToken)
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
  if (terms.signupUrl && !/^https:\/\/[^\s]+$/i.test(terms.signupUrl)) {
    return fail(400, "bad_signup_url", "The signup link must start with https://.")
  }
  const now = deps.now()
  const recent = await deps.store.countEvents({ type: "terms.submitted", since: ago(now, DAY), claim_id: owner.claim.id })
  if (recent >= LIMITS.editsPerClaimDay) return tooMany()

  const derived = parseCommissionMode(terms.rate)
  // A queue row for a person to review and turn into a YAML PR. Nothing here
  // writes to the registry.
  await deps.store.addEdit({
    claim_id: owner.claim.id,
    slug: body.slug,
    fields: { ...terms, mode: derived.mode, value: derived.value, flags: editFlags(owner.target.program, terms) },
  })
  await deps.store.addEvent({ type: "terms.submitted", claim_id: owner.claim.id, slug: body.slug, domain: owner.claim.domain })
  return reply(200, { ok: true })
}

async function release(req: Request, deps: ClaimDeps): Promise<Response> {
  const body = await readBody(req, SlugBody)
  if (!body) return badRequest()
  const owner = await ownerOf(req, deps, body.slug)
  if (!owner) return fail(401, "not_owner", "Verify that you run this listing first.")
  await deps.store.release(owner.claim.id)
  await deps.store.addEvent({ type: "claim.released", claim_id: owner.claim.id, slug: body.slug, domain: owner.claim.domain })
  return reply(200, { ok: true }, [clearCookie(SESSION_COOKIE)])
}

const POST_ACTIONS: Record<string, (req: Request, deps: ClaimDeps) => Promise<Response>> = {
  "send-code": sendCode,
  verify: verifyCode,
  "dns-start": startDns,
  "dns-check": checkDns,
  manual: requestManual,
  terms: submitTerms,
  release,
}

const GET_ACTIONS: Record<string, (req: Request, deps: ClaimDeps) => Promise<Response>> = { session }

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
