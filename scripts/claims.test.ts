import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import {
  PILOT_SLUGS,
  SIGNUP_URL_PATTERN,
  claimEnvReady,
  claimsEnabledFor,
  emailMatchesDomain,
  normalizeEmail,
  registrableDomain,
  signupUrlAllowed,
  unclaimableReason,
} from "../src/lib/claims/rules"
import { randomUUID } from "node:crypto"
import {
  CODE_TTL_MS,
  LIMITS,
  MAIL_TEMPLATES,
  MAX_ATTEMPTS,
  MAX_MEMBERS,
  codeEmail,
  editFlags,
  handleClaim,
  memberAddedEmail,
  signinEmail,
  type AddMemberResult,
  type ClaimDeps,
  type ClaimEvent,
  type ClaimProgram,
  type ClaimRow,
  type ClaimStore,
  type EditRow,
  type EventFilter,
  type MemberRow,
  type OutgoingEmail,
  type SigninCodeRow,
} from "../src/lib/claims/service"
import { liveClaimDeps } from "../src/lib/claims/live"

// ---------------------------------------------------------------- fixtures

const SECRET = "test-signing-secret-that-is-long-enough-0123456789"

function program(slug: string, url: string, rate = "12%", value = 12): ClaimProgram {
  return {
    slug,
    name: slug === "kyma-api" ? "Kyma API" : slug,
    url,
    signupUrl: `${url}/affiliates`,
    commission: { type: "recurring", rate, mode: "percentage", value, currency: "USD", duration: "18 months" },
  }
}

// Pilot slugs with test URLs: citegraph stands in for a multi-label public suffix.
const PROGRAMS: Record<string, ClaimProgram> = {
  "kyma-api": program("kyma-api", "https://kymaapi.com"),
  citegraph: program("citegraph", "https://www.foo.co.uk"),
  "build-to-own-replay": program("build-to-own-replay", "https://build2own.dev"),
  landerlab: program("landerlab", "https://landerlab.io"),
  vercel: program("vercel", "https://vercel.com"),
}

type StoredEvent = ClaimEvent & { id: number; at: number }

/** Same semantics as the Supabase store: conditional updates are atomic per call. */
class MemoryStore implements ClaimStore {
  claims = new Map<string, ClaimRow>()
  events: StoredEvent[] = []
  edits: { claim_id: string; slug: string; fields: Record<string, unknown>; at: number }[] = []
  failNextAddEvent = false
  private seq = 1
  constructor(private clock: () => Date) {}

  async addEvent(event: ClaimEvent) {
    if (this.failNextAddEvent) {
      this.failNextAddEvent = false
      throw Object.assign(new Error("insert failed for owner@kymaapi.com"), { code: "XX000" })
    }
    const id = this.seq++
    this.events.push({ ...event, id, at: this.clock().getTime() })
    return id
  }
  async removeEvent(id: number) {
    this.events = this.events.filter((e) => e.id !== id)
  }
  async countEvents(f: EventFilter) {
    const keys = ["claim_id", "slug", "domain", "email_hash", "ip_hash"] as const
    return this.events.filter(
      (e) => e.type === f.type && e.at >= f.since.getTime() && keys.every((k) => f[k] === undefined || e[k] === f[k]),
    ).length
  }
  async addClaim(claim: Omit<ClaimRow, "attempts" | "verified_at" | "created_at">) {
    this.claims.set(claim.id, { ...claim, attempts: 0, verified_at: null, created_at: this.clock().toISOString() })
  }
  async getClaim(id: string) {
    const c = this.claims.get(id)
    return c ? { ...c } : null
  }
  async hasActiveOwner(domain: string) {
    return [...this.claims.values()].some((c) => c.domain === domain && c.status === "active")
  }
  async takeAttempt(id: string, seen: number, now: Date) {
    const c = this.claims.get(id)
    if (!c || c.attempts !== seen || c.attempts >= MAX_ATTEMPTS || c.status !== "pending" || c.verified_at) return false
    if (Date.parse(c.expires_at) <= now.getTime()) return false
    c.attempts = seen + 1
    return true
  }
  async confirm(id: string, now: Date) {
    const c = this.claims.get(id)
    if (!c || c.status !== "pending" || c.verified_at || Date.parse(c.expires_at) <= now.getTime()) return "gone" as const
    if (await this.hasActiveOwner(c.domain)) return "conflict" as const
    c.verified_at = now.toISOString()
    c.status = "active"
    return "ok" as const
  }
  async release(id: string) {
    const c = this.claims.get(id)
    if (c) Object.assign(c, { status: "released", email: null })
    for (const m of this.members.values()) {
      if (m.claim_id === id && m.status === "active") Object.assign(m, { status: "removed", email: null })
    }
  }
  members = new Map<string, MemberRow>()
  codes = new Map<string, SigninCodeRow>()
  /** Synchronous body, so atomic like claim_add_member in migration 011. */
  async addMember(claimId: string, email: string, addedBy: string | null, max: number): Promise<AddMemberResult> {
    const c = this.claims.get(claimId)
    if (!c || c.status !== "active" || !c.verified_at) return { result: "not_owner" }
    const active = [...this.members.values()].filter((m) => m.status === "active")
    if (addedBy && !active.some((m) => m.id === addedBy && m.claim_id === claimId)) return { result: "not_owner" }
    if (active.filter((m) => m.claim_id === claimId).length >= max) return { result: "full" }
    if (active.some((m) => m.email === email.toLowerCase())) return { result: "exists" }
    const id = randomUUID()
    this.members.set(id, { id, claim_id: claimId, email: email.toLowerCase(), status: "active", added_by: addedBy, created_at: this.clock().toISOString() })
    return { result: "ok", id }
  }
  async getMember(id: string) {
    const m = this.members.get(id)
    return m ? { ...m } : null
  }
  async findActiveMember(email: string) {
    const m = [...this.members.values()].find((x) => x.status === "active" && x.email === email.toLowerCase())
    return m ? { ...m } : null
  }
  async listMembers(claimId: string) {
    return [...this.members.values()].filter((m) => m.claim_id === claimId && m.status === "active").map((m) => ({ ...m }))
  }
  async removeMember(id: string, claimId: string) {
    const m = this.members.get(id)
    if (!m || m.claim_id !== claimId || m.status !== "active") return false
    Object.assign(m, { status: "removed", email: null })
    return true
  }
  async addSigninCode(row: { id: string; member_id: string | null; code_hash: string; expires_at: string }) {
    this.codes.set(row.id, { ...row, attempts: 0, used_at: null })
  }
  async getSigninCode(id: string) {
    const c = this.codes.get(id)
    return c ? { ...c } : null
  }
  async takeSigninAttempt(id: string, seen: number, now: Date) {
    const c = this.codes.get(id)
    if (!c || c.attempts !== seen || c.attempts >= MAX_ATTEMPTS || c.used_at) return false
    if (Date.parse(c.expires_at) <= now.getTime()) return false
    c.attempts = seen + 1
    return true
  }
  async useSigninCode(id: string, now: Date) {
    const c = this.codes.get(id)
    if (!c || c.used_at || Date.parse(c.expires_at) <= now.getTime()) return false
    c.used_at = now.toISOString()
    return true
  }
  async listEdits(claimId: string): Promise<EditRow[]> {
    return this.edits
      .filter((e) => e.claim_id === claimId)
      .map((e, i) => ({ id: String(i), slug: e.slug, kind: "edit" as const, status: "pending", pr_url: null, fields: e.fields, created_at: new Date(e.at).toISOString() }))
      .reverse()
  }
  /** Synchronous body, so atomic like the claim_submit_edit function in migration 010. */
  async submitEdit(edit: { claim_id: string; slug: string; fields: Record<string, unknown> }, dailyLimit: number) {
    const c = this.claims.get(edit.claim_id)
    if (!c || c.status !== "active" || !c.verified_at) return "not_owner" as const
    const since = this.clock().getTime() - 24 * 60 * 60_000
    if (this.edits.filter((e) => e.claim_id === edit.claim_id && e.at > since).length >= dailyLimit) return "quota" as const
    this.edits.push({ ...edit, at: this.clock().getTime() })
    this.events.push({ id: this.seq++, type: "terms.submitted", claim_id: c.id, slug: edit.slug, domain: c.domain, at: this.clock().getTime() })
    return "ok" as const
  }
  async prune() {}
  async countProgramEvents() {
    return 42
  }
  count(type: string) {
    return this.events.filter((e) => e.type === type).length
  }
}

/**
 * Test tokens read "tok|<action>|<hostname>": the fake siteverify answers with
 * that action and hostname (hostname defaults to openaffiliate.dev).
 */
const tokenFor = (action: string, hostname = "openaffiliate.dev") => `tok|${action}|${hostname}`

function setup(opts: { turnstile?: boolean | null; sendOk?: boolean } = {}) {
  let now = new Date("2026-10-12T12:00:00Z")
  const clock = () => now
  const store = new MemoryStore(clock)
  const sent: OutgoingEmail[] = []
  const txt: Record<string, string[][]> = {}
  let turnstileCalls = 0
  const deps: ClaimDeps = {
    store,
    secret: SECRET,
    now: clock,
    getProgram: (slug) => PROGRAMS[slug],
    programsOnDomain: (domain) => Object.values(PROGRAMS).filter((p) => registrableDomain(p.url) === domain),
    verifyTurnstile: async (token) => {
      turnstileCalls++
      if (opts.turnstile === null) return null
      const [, action, hostname = "openaffiliate.dev"] = token.split("|")
      return { success: opts.turnstile ?? true, action, hostname }
    },
    sendEmail: async (mail) => {
      sent.push(mail)
      return opts.sendOk ?? true
    },
    resolveTxt: async (domain) => txt[domain] ?? [],
    afterResponse: (task) => {
      deferred.push(task)
    },
  }
  const deferred: (() => Promise<void>)[] = []
  const jar = new Map<string, string>()

  async function call(
    action: string,
    body: Record<string, unknown> | null,
    o: { ip?: string; cookies?: Map<string, string>; method?: string; query?: string } = {},
  ) {
    const cookies = o.cookies ?? jar
    const headers = new Headers({ "content-type": "application/json", "x-forwarded-for": o.ip ?? "203.0.113.7" })
    if (cookies.size) headers.set("cookie", [...cookies].map(([k, v]) => `${k}=${v}`).join("; "))
    const req = new Request(`https://openaffiliate.dev/api/claims/${action}${o.query ?? ""}`, {
      method: o.method ?? "POST",
      headers,
      body: (o.method ?? "POST") === "GET" ? undefined : JSON.stringify(body),
    })
    const res = await handleClaim(action, req, deps)
    // What after() would run once the response is out.
    while (deferred.length) await deferred.shift()!()
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split("; ")
      const [name, ...value] = pair.split("=")
      if (attrs.includes("Max-Age=0")) cookies.delete(name)
      else cookies.set(name, value.join("="))
    }
    return { status: res.status, body: (await res.json()) as Record<string, unknown>, res }
  }

  const codeOf = (mail: OutgoingEmail) => /Your OpenAffiliate code: (\d{6})/.exec(mail.subject)![1]

  return {
    deps,
    store,
    sent,
    txt,
    jar,
    call,
    codeOf,
    turnstileCalls: () => turnstileCalls,
    advance: (ms: number) => (now = new Date(now.getTime() + ms)),
  }
}

const sendCode = (t: ReturnType<typeof setup>, email: string, slug = "kyma-api", o: { ip?: string } = {}) =>
  t.call("send-code", { slug, email, turnstileToken: tokenFor("send-code") }, o)

// ---------------------------------------------------------------- domain rule

test("registrable domain comes from the Public Suffix List, not a naive split", () => {
  assert.equal(registrableDomain("https://www.foo.co.uk/pricing"), "foo.co.uk")
  assert.equal(registrableDomain("https://app.kymaapi.com"), "kymaapi.com")
  // Private section: each github.io site is its own registrable domain.
  assert.equal(registrableDomain("https://alice.github.io"), "alice.github.io")
  assert.equal(registrableDomain("https://203.0.113.9"), null)

  assert.equal(emailMatchesDomain("ceo@foo.co.uk", "foo.co.uk"), true)
  assert.equal(emailMatchesDomain("ceo@bar.co.uk", "foo.co.uk"), false)
  assert.equal(emailMatchesDomain("ceo@co.uk", "foo.co.uk"), false)
  assert.equal(emailMatchesDomain("CEO@FOO.CO.UK", "foo.co.uk"), true)
})

test("a subdomain address is refused: support@acme.freshdesk.com cannot claim freshdesk.com", () => {
  assert.equal(emailMatchesDomain("support@acme.freshdesk.com", "freshdesk.com"), false)
  assert.equal(emailMatchesDomain("me@mail.kymaapi.com", "kymaapi.com"), false)
  assert.equal(emailMatchesDomain("me@kymaapi.com.evil.io", "kymaapi.com"), false)
})

test("only one plain mailbox is accepted as an address", () => {
  for (const bad of [
    "a@evil.com,b@kymaapi.com",
    "Name <a@kymaapi.com>",
    "a b@kymaapi.com",
    "a%evil.com@kymaapi.com",
    "a@kymaapi.com\nbcc:x@evil.com",
    "@kymaapi.com",
    "a@@kymaapi.com",
    "a@kymaapi",
  ]) {
    assert.equal(normalizeEmail(bad), null, bad)
  }
  assert.equal(normalizeEmail("  Ann.Lee+oa@KymaAPI.com "), "Ann.Lee+oa@kymaapi.com")
})

test("shared hosts and mailbox providers have no claim button", () => {
  assert.equal(unclaimableReason("https://cloudycotton.github.io"), "shared-host")
  assert.equal(unclaimableReason("https://csv-safecheck.pages.dev"), "shared-host")
  assert.equal(unclaimableReason("https://x.vercel.app"), "shared-host")
  assert.equal(unclaimableReason("https://x.netlify.app"), "shared-host")
  assert.equal(unclaimableReason("https://www.gmail.com"), "email-provider")
  assert.equal(unclaimableReason("https://kymaapi.com"), null)
})

test("floot.app is a shared host even though the PSL does not list it (prismbay-clean)", () => {
  // tldts alone would make floot.app the registrable domain, claimable by floot.app staff.
  assert.equal(registrableDomain("https://prismbay-clean-global.floot.app"), "floot.app")
  assert.equal(unclaimableReason("https://prismbay-clean-global.floot.app"), "shared-host")
  assert.equal(unclaimableReason("https://floot.app"), "shared-host")
  const prismbay = program("prismbay-clean", "https://prismbay-clean-global.floot.app")
  assert.equal(claimsEnabledFor(prismbay, FULL_ENV), false)
})

// ---------------------------------------------------------------- flag and secrets

const FULL_ENV = {
  OA_RESEND_API_KEY: "re_x",
  CLAIM_SIGNING_SECRET: SECRET,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "0x4AAA",
  TURNSTILE_SECRET_KEY: "0x4AAB",
  NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sr",
}

test("claim button shows only on pilot listings and only with every secret set", () => {
  assert.deepEqual([...PILOT_SLUGS].sort(), ["build-to-own-replay", "citegraph", "kyma-api"])
  for (const slug of ["kyma-api", "build-to-own-replay", "citegraph"]) {
    assert.equal(claimsEnabledFor(PROGRAMS[slug], FULL_ENV), true, slug)
  }
  assert.equal(claimsEnabledFor(PROGRAMS.vercel, FULL_ENV), false, "not a pilot slug")
  assert.equal(claimsEnabledFor(PROGRAMS.landerlab, FULL_ENV), false, "third-party brand, left out of the pilot")
  assert.equal(claimsEnabledFor(PROGRAMS["kyma-api"], {}), false)
  for (const name of Object.keys(FULL_ENV)) {
    assert.equal(claimsEnabledFor(PROGRAMS["kyma-api"], { ...FULL_ENV, [name]: "" }), false, `${name} missing`)
  }
  assert.equal(claimEnvReady({ ...FULL_ENV, CLAIM_SIGNING_SECRET: "short" }), false, "short secret counts as missing")
})

test("with secrets missing the route answers 503 'claims not enabled'", async () => {
  const names = Object.keys(FULL_ENV)
  const saved = Object.fromEntries(names.map((n) => [n, process.env[n]]))
  for (const n of names) delete process.env[n]
  try {
    const route = await import("../src/app/api/claims/[action]/route")
    for (const action of [
      "send-code", "verify", "dns-start", "dns-check", "manual", "terms", "release",
      "signin-code", "signin-verify", "signout", "member-add", "member-remove",
    ]) {
      const res = await route.POST(
        new Request(`https://openaffiliate.dev/api/claims/${action}`, { method: "POST", body: "{}" }),
        { params: Promise.resolve({ action }) },
      )
      assert.equal(res.status, 503, action)
      assert.equal(((await res.json()) as { message: string }).message, "claims not enabled")
    }
    for (const action of ["session", "account"]) {
      const res = await route.GET(new Request(`https://openaffiliate.dev/api/claims/${action}?slug=kyma-api`), {
        params: Promise.resolve({ action }),
      })
      assert.equal(res.status, 503, action)
    }
  } finally {
    for (const n of names) if (saved[n] !== undefined) process.env[n] = saved[n]
  }
})

test("a listing outside the pilot gets 404 and nothing is written", async () => {
  const t = setup()
  const r = await sendCode(t, "me@vercel.com", "vercel")
  assert.equal(r.status, 404)
  assert.equal((await sendCode(t, "me@landerlab.io", "landerlab")).status, 404)
  assert.equal(t.sent.length, 0)
  assert.equal(t.store.events.length, 0)
})

// ---------------------------------------------------------------- send code

test("a matching work email gets one code email with the approved copy", async () => {
  const t = setup()
  const r = await sendCode(t, "founder@kymaapi.com")
  assert.equal(r.status, 200)
  assert.equal(t.sent.length, 1)
  const mail = t.sent[0]
  assert.equal(mail.to, "founder@kymaapi.com")
  const code = t.codeOf(mail)
  assert.equal(
    mail.text,
    [
      "Hi,",
      "Someone (hopefully you) asked to manage the Kyma API affiliate program listing on OpenAffiliate.",
      `Your code is ${code}. Enter it on openaffiliate.dev within 10 minutes.`,
      "If this wasn't you, ignore this email. Nothing changes and we won't email you again about it.",
      "OpenAffiliate · openaffiliate.dev",
    ].join("\n\n"),
  )
  assert.match(mail.html, new RegExp(`<strong>${code}</strong>`))
  // The code is stored only as a hash.
  const claim = [...t.store.claims.values()][0]
  assert.notEqual(claim.code_hash, code)
  assert.equal(JSON.stringify(t.store.events).includes(code), false)
  assert.equal(JSON.stringify(t.store.events).includes("founder@kymaapi.com"), false, "events hold hashes, not emails")
})

test("no email is sent when the domain does not match, and Turnstile is not spent", async () => {
  const t = setup()
  for (const email of ["me@mail.kymaapi.com", "me@evil.com", "me@kymaapi.co"]) {
    const r = await sendCode(t, email)
    assert.equal(r.status, 400, email)
    assert.equal(r.body.error, "domain_mismatch")
  }
  const bad = await sendCode(t, "a@evil.com,b@kymaapi.com")
  assert.equal(bad.body.error, "bad_email")
  assert.equal(t.sent.length, 0)
  assert.equal(t.turnstileCalls(), 0)
  assert.equal(t.store.events.length, 0)
  assert.equal(t.store.claims.size, 0)
})

test("a PSL registrable domain with a multi-label suffix works end to end (foo.co.uk)", async () => {
  const t = setup()
  assert.equal((await sendCode(t, "me@bar.co.uk", "citegraph")).body.error, "domain_mismatch")
  assert.equal((await sendCode(t, "me@co.uk", "citegraph")).body.error, "domain_mismatch")
  const ok = await sendCode(t, "me@foo.co.uk", "citegraph")
  assert.equal(ok.status, 200)
  assert.equal(ok.body.domain, "foo.co.uk")
  assert.equal(t.sent.length, 1)
})

test("a missing Turnstile token is refused before any write; a failed one too", async () => {
  const t = setup()
  const r = await t.call("send-code", { slug: "kyma-api", email: "me@kymaapi.com" })
  assert.equal(r.status, 400)
  assert.equal(r.body.error, "turnstile_required")
  for (const action of ["dns-start", "manual"]) {
    assert.equal((await t.call(action, { slug: "kyma-api", email: "me@kymaapi.com" })).body.error, "turnstile_required")
  }
  assert.equal(t.turnstileCalls(), 0)

  const f = setup({ turnstile: false })
  const r2 = await sendCode(f, "me@kymaapi.com")
  assert.equal(r2.status, 403)
  assert.equal(f.sent.length + f.store.events.length + f.store.claims.size, 0)

  const down = setup({ turnstile: null })
  assert.equal((await sendCode(down, "me@kymaapi.com")).status, 403, "siteverify unreachable fails closed")
})

test("Turnstile: a token solved on another host, or for another step, is refused", async () => {
  const t = setup()
  const send = (token: string) => t.call("send-code", { slug: "kyma-api", email: "me@kymaapi.com", turnstileToken: token })
  // Cloudflare's test keys report example.com; a token from a copy of the form elsewhere reports its host.
  for (const host of ["example.com", "openaffiliate.dev.evil.io", "localhost", ""]) {
    assert.equal((await send(tokenFor("send-code", host))).status, 403, host)
  }
  // Solved for the manual-review or DNS form, spent on send-code; or no action at all.
  for (const action of ["manual", "dns-start", ""]) {
    assert.equal((await send(tokenFor(action))).status, 403, action || "no action")
  }
  assert.equal(
    (await t.call("dns-start", { slug: "kyma-api", email: "a@b.io", turnstileToken: tokenFor("send-code") })).status,
    403,
  )
  assert.equal(
    (await t.call("manual", { slug: "kyma-api", email: "a@b.io", turnstileToken: tokenFor("dns-start") })).status,
    403,
  )
  assert.equal(t.sent.length + t.store.events.length + t.store.claims.size, 0)
  // The right step on our own host passes, www included.
  assert.equal((await send(tokenFor("send-code", "www.openaffiliate.dev"))).status, 200)
})

// ---------------------------------------------------------------- verify

test("brute force: five wrong codes lock the claim, the right code after that fails", async () => {
  const t = setup()
  await sendCode(t, "me@kymaapi.com")
  const code = t.codeOf(t.sent[0])
  const wrong = code === "000000" ? "111111" : "000000"
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    const r = await t.call("verify", { slug: "kyma-api", code: wrong })
    assert.equal(r.body.attemptsLeft, MAX_ATTEMPTS - i)
    assert.equal(r.status, i < MAX_ATTEMPTS ? 400 : 429)
  }
  const late = await t.call("verify", { slug: "kyma-api", code })
  assert.equal(late.status, 429)
  assert.equal([...t.store.claims.values()][0].status, "pending")
  assert.equal(t.jar.has("oa_claim_session"), false)
})

test("brute force: parallel guesses never compare more than five codes", async () => {
  const t = setup()
  await sendCode(t, "me@kymaapi.com")
  const code = t.codeOf(t.sent[0])
  const guesses = Array.from({ length: 300 }, (_, i) => String(i).padStart(6, "0"))
  guesses.push(code)
  const results = await Promise.all(guesses.map((g) => t.call("verify", { slug: "kyma-api", code: g })))
  const compared = t.store.count("code.failed") + t.store.count("claim.confirmed")
  assert.ok(compared <= MAX_ATTEMPTS, `compared ${compared} codes`)
  assert.ok([...t.store.claims.values()][0].attempts <= MAX_ATTEMPTS)
  assert.ok(results.filter((r) => r.status === 200).length <= 1)
})

test("replay after verify: the same code and cookie do not verify twice", async () => {
  const t = setup()
  await sendCode(t, "me@kymaapi.com")
  const code = t.codeOf(t.sent[0])
  const pending = new Map(t.jar)
  const first = await t.call("verify", { slug: "kyma-api", code })
  assert.equal(first.status, 200)
  assert.ok(t.jar.has("oa_claim_session"))
  assert.equal(t.jar.has("oa_claim_pending"), false, "pending cookie is cleared")
  const replay = await t.call("verify", { slug: "kyma-api", code }, { cookies: new Map(pending) })
  assert.equal(replay.status, 410)
  assert.equal(t.store.count("claim.confirmed"), 1)
})

test("an expired code is refused and spends no attempt", async () => {
  const t = setup()
  await sendCode(t, "me@kymaapi.com")
  const code = t.codeOf(t.sent[0])
  t.advance(CODE_TTL_MS - 1000)
  const pending = new Map(t.jar)
  t.advance(2000)
  // The pending cookie itself has expired too; send it anyway to reach the row check.
  const r = await t.call("verify", { slug: "kyma-api", code }, { cookies: pending })
  assert.ok(r.status === 401 || r.status === 410, String(r.status))
  const claim = [...t.store.claims.values()][0]
  assert.equal(claim.status, "pending")
  assert.equal(claim.attempts, 0)
})

test("a code only works in the browser that asked for it, for the listing it was sent for", async () => {
  const t = setup()
  await sendCode(t, "me@kymaapi.com")
  const code = t.codeOf(t.sent[0])
  assert.equal((await t.call("verify", { slug: "kyma-api", code }, { cookies: new Map() })).status, 401)
  assert.equal((await t.call("verify", { slug: "build-to-own-replay", code })).status, 401)
  const tampered = new Map(t.jar)
  const [id, exp] = tampered.get("oa_claim_pending")!.split(".")
  tampered.set("oa_claim_pending", `${id}.${Number(exp) + 999999}.${"0".repeat(64)}`)
  assert.equal((await t.call("verify", { slug: "kyma-api", code }, { cookies: tampered })).status, 401)
})

// ---------------------------------------------------------------- DNS

test("DNS token is single-use and bound to its own claim", async () => {
  const t = setup()
  const jarA = new Map<string, string>()
  const jarB = new Map<string, string>()
  const a = await t.call("dns-start", { slug: "build-to-own-replay", email: "ops@gmail.com", turnstileToken: tokenFor("dns-start") }, { cookies: jarA })
  const b = await t.call("dns-start", { slug: "build-to-own-replay", email: "x@gmail.com", turnstileToken: tokenFor("dns-start") }, { cookies: jarB, ip: "198.51.100.2" })
  assert.equal(a.status, 200)
  assert.match(String(a.body.record), /^openaffiliate-verify=[A-Za-z0-9_-]{43}$/)
  assert.notEqual(a.body.record, b.body.record)
  // Only the token itself leaves the server; the row keeps a hash.
  const token = String(a.body.record).split("=")[1]
  assert.equal(JSON.stringify([...t.store.claims.values()]).includes(token), false)

  // Record A is published (TXT strings may arrive in chunks). It does not verify claim B.
  const recordA = String(a.body.record)
  t.txt["build2own.dev"] = [["v=spf1 -all"], [recordA.slice(0, 20), recordA.slice(20)]]
  assert.equal((await t.call("dns-check", { slug: "build-to-own-replay" }, { cookies: new Map(jarB) })).status, 404)

  const pendingA = new Map(jarA)
  const okA = await t.call("dns-check", { slug: "build-to-own-replay" }, { cookies: jarA })
  assert.equal(okA.status, 200)
  assert.ok(jarA.has("oa_claim_session"))
  // Replay of the same check, and of the same record, after verification.
  assert.equal((await t.call("dns-check", { slug: "build-to-own-replay" }, { cookies: pendingA })).status, 410)
  // B publishes its own record now, but the domain has an owner.
  t.txt["build2own.dev"].push([String(b.body.record)])
  assert.equal((await t.call("dns-check", { slug: "build-to-own-replay" }, { cookies: jarB })).status, 409)
  assert.equal(t.store.count("claim.confirmed"), 1)
})

test("a DNS record on a subdomain or another domain does not count", async () => {
  const t = setup()
  const r = await t.call("dns-start", { slug: "kyma-api", email: "a@b.io", turnstileToken: tokenFor("dns-start") })
  t.txt["www.kymaapi.com"] = [[String(r.body.record)]]
  t.txt["evil.com"] = [[String(r.body.record)]]
  assert.equal((await t.call("dns-check", { slug: "kyma-api" })).status, 404)
})

// ---------------------------------------------------------------- rate limits

test("rate limit: one code per address per 24 hours, so the email's promise holds", async () => {
  assert.equal(LIMITS.codesPerEmailDay, 1)
  const t = setup()
  assert.equal((await sendCode(t, "me@kymaapi.com", "kyma-api", { ip: "198.51.100.1" })).status, 200)
  // Fresh IPs, the address in other letter cases, and most of a day later: still refused.
  const again = await sendCode(t, "me@kymaapi.com", "kyma-api", { ip: "198.51.100.2" })
  assert.equal(again.status, 429)
  assert.match(String(again.body.message), /already sent a code to this address/)
  assert.equal((await sendCode(t, "ME@KymaAPI.com", "kyma-api", { ip: "198.51.100.3" })).status, 429)
  t.advance(23 * 60 * 60_000)
  assert.equal((await sendCode(t, "me@kymaapi.com", "kyma-api", { ip: "198.51.100.4" })).status, 429)
  assert.equal(t.sent.length, 1)
  // Refused reservations are withdrawn, so they never count as sent.
  assert.equal(t.store.count("code.sent"), 1)
  t.advance(61 * 60_000)
  assert.equal((await sendCode(t, "me@kymaapi.com", "kyma-api", { ip: "198.51.100.5" })).status, 200)
  assert.equal(t.sent.length, 2)
})

test("a failed send withdraws the reservation, so the address can try again", async () => {
  const t = setup({ sendOk: false })
  assert.equal((await sendCode(t, "me@kymaapi.com")).status, 502)
  assert.equal(t.store.count("code.sent"), 0)
})

test("rate limit: five requests per IP per hour across send, DNS and manual", async () => {
  const t = setup()
  for (let i = 0; i < LIMITS.requestsPerIpHour; i++) {
    assert.equal((await t.call("dns-start", { slug: "build-to-own-replay", email: `p${i}@x.io`, turnstileToken: tokenFor("dns-start") })).status, 200)
  }
  assert.equal((await sendCode(t, "me@kymaapi.com")).status, 429)
  assert.equal(t.sent.length, 0)
  t.advance(61 * 60_000)
  assert.equal((await sendCode(t, "me@kymaapi.com")).status, 200)
})

test("rate limit: five codes per domain and per listing per day", async () => {
  const t = setup()
  for (let i = 0; i < LIMITS.codesPerDomainDay; i++) {
    assert.equal((await sendCode(t, `p${i}@kymaapi.com`, "kyma-api", { ip: `198.51.100.${i}` })).status, 200)
  }
  assert.equal((await sendCode(t, "p9@kymaapi.com", "kyma-api", { ip: "198.51.100.99" })).status, 429)
  assert.equal(t.sent.length, LIMITS.codesPerDomainDay)
})

test("rate limit: the site-wide ceiling stops all code email and leaves a cap.reached event", async () => {
  const t = setup()
  for (let i = 0; i < LIMITS.codesSiteDay; i++) t.store.events.push({ id: 10_000 + i, type: "code.sent", at: Date.parse("2026-10-12T11:00:00Z") })
  const r = await sendCode(t, "me@kymaapi.com")
  assert.equal(r.status, 429)
  assert.equal(t.sent.length, 0)
  assert.equal(t.store.count("code.sent"), LIMITS.codesSiteDay)
  assert.equal(t.store.count("cap.reached"), 1)
})

test("rate limit: two manual review requests per address per day", async () => {
  const t = setup()
  const ask = (ip: string) =>
    t.call("manual", { slug: "kyma-api", email: "me@agency.io", note: "I run partnerships", turnstileToken: tokenFor("manual") }, { ip })
  assert.equal((await ask("198.51.100.1")).status, 200)
  assert.equal((await ask("198.51.100.2")).status, 200)
  assert.equal((await ask("198.51.100.3")).status, 429)
  const queued = [...t.store.claims.values()]
  assert.equal(queued.length, 2)
  assert.ok(queued.every((c) => c.status === "review" && c.method === "manual" && c.verified_at === null))
  assert.equal(t.sent.length, 0, "manual review sends nothing")
})

// ---------------------------------------------------------------- owner session

async function owner(t: ReturnType<typeof setup>) {
  await sendCode(t, "me@kymaapi.com")
  const r = await t.call("verify", { slug: "kyma-api", code: t.codeOf(t.sent[0]) })
  assert.equal(r.status, 200)
}

test("one owner per domain: a second person is sent to manual review and gets no email", async () => {
  const t = setup()
  await owner(t)
  const r = await sendCode(t, "other@kymaapi.com", "kyma-api", { ip: "198.51.100.5" })
  assert.equal(r.status, 409)
  assert.equal(t.sent.length, 1)
})

test("edits go to the review queue, never to the YAML", async () => {
  const t = setup()
  const yamlPath = join(process.cwd(), "programs", "kyma-api.yaml")
  const before = readFileSync(yamlPath, "utf8")
  await owner(t)
  const session = await t.call("session", null, { method: "GET", query: "?slug=kyma-api" })
  assert.deepEqual(session.body, { owner: true, domain: "kymaapi.com", stats: { views: 42, clicks: 42 } })

  const r = await t.call("terms", {
    slug: "kyma-api",
    terms: { rate: "5%", type: "recurring", duration: "12 months", cookieDays: 60, signupUrl: "https://other.io/join" },
  })
  assert.equal(r.status, 200)
  assert.equal(t.store.edits.length, 1)
  const fields = t.store.edits[0].fields
  assert.equal(fields.mode, "percentage")
  assert.equal(fields.value, 5)
  assert.deepEqual(fields.flags, ["commission_drop_over_50pct", "signup_domain_changed"])
  assert.equal(readFileSync(yamlPath, "utf8"), before)
  // The service has no way to write files at all.
  const source = readFileSync(join(process.cwd(), "src", "lib", "claims", "service.ts"), "utf8")
  assert.equal(/from "(node:)?fs"/.test(source), false)

  assert.equal(
    (await t.call("terms", { slug: "kyma-api", terms: { rate: "20%", type: "recurring", signupUrl: "javascript:alert(1)" } })).status,
    400,
  )
  assert.equal(t.store.count("terms.submitted"), 1, "the event is written with the edit")
})

test("edit quota: 20 parallel submissions at 9 of 10 queue exactly one", async () => {
  const t = setup()
  await owner(t)
  const terms = { rate: "20%", type: "recurring" }
  for (let i = 0; i < LIMITS.editsPerClaimDay - 1; i++) {
    assert.equal((await t.call("terms", { slug: "kyma-api", terms })).status, 200)
  }
  const results = await Promise.all(Array.from({ length: 20 }, () => t.call("terms", { slug: "kyma-api", terms })))
  assert.equal(results.filter((r) => r.status === 200).length, 1)
  assert.equal(results.filter((r) => r.status === 429).length, 19)
  assert.equal(t.store.edits.length, LIMITS.editsPerClaimDay)
  assert.equal(t.store.count("terms.submitted"), LIMITS.editsPerClaimDay)
  // The window is 24 hours.
  t.advance(24 * 60 * 60_000 + 1000)
  assert.equal((await t.call("terms", { slug: "kyma-api", terms })).status, 200)
})

test("an edit that lands after a release is refused by the store, not queued", async () => {
  const t = setup()
  await owner(t)
  const claim = [...t.store.claims.values()][0]
  // Released between the session check and the write.
  const realGet = t.store.getClaim.bind(t.store)
  t.store.getClaim = async (id: string) => {
    const row = await realGet(id)
    await t.store.release(id)
    return row
  }
  const r = await t.call("terms", { slug: "kyma-api", terms: { rate: "20%", type: "recurring" } })
  assert.equal(r.status, 401)
  assert.equal(t.store.edits.length, 0)
  assert.equal(claim.status, "released")
})

test("owner signup links follow the schema's signup_url rule", () => {
  const schema = JSON.parse(readFileSync(join(process.cwd(), "schema", "program.schema.json"), "utf8"))
  const declared: string | undefined = schema.properties.signup_url.pattern
  // Read from the schema, never copied: when the schema gains or tightens a pattern, owner edits follow.
  assert.equal(SIGNUP_URL_PATTERN?.source ?? null, declared ? new RegExp(declared, "u").source : null)

  assert.equal(signupUrlAllowed("https://kymaapi.com/partners?ref=oa"), true)
  for (const bad of ["javascript:alert(1)", "http://kymaapi.com/partners", "https://", "https://exa mple.com", "partners", ""]) {
    assert.equal(signupUrlAllowed(bad), false, bad)
  }
  // With a pattern like the one #170 adds (no user@ before the host, host of at most 253 characters).
  const strict = new RegExp("^(?=https?://[^/?#@]{1,253}(?:[/?#]|$))", "u")
  assert.equal(signupUrlAllowed("https://kymaapi.com/partners", strict), true)
  assert.equal(signupUrlAllowed("https://kymaapi.com@evil.io/join", strict), false)
  assert.equal(signupUrlAllowed(`https://${"a".repeat(250)}.com/`, strict), false)
})

test("edits need a live session: no cookie, a forged cookie, or another domain's listing all fail", async () => {
  const t = setup()
  const terms = { rate: "20%", type: "recurring" }
  assert.equal((await t.call("terms", { slug: "kyma-api", terms })).status, 401)
  await owner(t)
  const forged = new Map(t.jar)
  const [id, exp] = forged.get("oa_claim_session")!.split(".")
  forged.set("oa_claim_session", `${id}.${exp}.${"f".repeat(64)}`)
  assert.equal((await t.call("terms", { slug: "kyma-api", terms }, { cookies: forged })).status, 401)
  assert.equal((await t.call("terms", { slug: "build-to-own-replay", terms })).status, 401, "kymaapi.com owner cannot edit build2own.dev")
  assert.equal(t.store.edits.length, 0)
})

test("release ends the session at once and clears the owner's address", async () => {
  const t = setup()
  await owner(t)
  const kept = new Map(t.jar)
  assert.equal((await t.call("release", { slug: "kyma-api" })).status, 200)
  const claim = [...t.store.claims.values()][0]
  assert.equal(claim.status, "released")
  assert.equal(claim.email, null)
  // The old cookie is still validly signed, but the row says released.
  assert.equal((await t.call("terms", { slug: "kyma-api", terms: { rate: "20%", type: "recurring" } }, { cookies: kept })).status, 401)
  const s = await t.call("session", null, { method: "GET", query: "?slug=kyma-api", cookies: kept })
  assert.deepEqual(s.body, { owner: false })
})

test("edit flags: a cut of more than half, or a signup link on another domain", () => {
  const p = PROGRAMS["kyma-api"]
  assert.deepEqual(editFlags(p, { rate: "12%" }), [])
  assert.deepEqual(editFlags(p, { rate: "6%" }), [])
  assert.deepEqual(editFlags(p, { rate: "5%" }), ["commission_drop_over_50pct"])
  assert.deepEqual(editFlags(p, { rate: "12%", signupUrl: "https://kymaapi.com/partners" }), [])
  assert.deepEqual(editFlags(p, { rate: "12%", signupUrl: "https://affitor.com/marketplace/kyma-api" }), ["signup_domain_changed"])
})

// ---------------------------------------------------------------- logging

test("logs never contain an email address, a code or a DNS token", async () => {
  const lines: string[] = []
  const original = { log: console.log, error: console.error, warn: console.warn, info: console.info }
  for (const k of Object.keys(original) as (keyof typeof original)[]) console[k] = (...args: unknown[]) => lines.push(args.map(String).join(" "))
  try {
    const t = setup({ sendOk: false })
    assert.equal((await sendCode(t, "secret.person@kymaapi.com")).status, 502)
    const code = t.codeOf(t.sent[0])
    const ok = setup()
    await sendCode(ok, "secret.person@kymaapi.com")
    await ok.call("verify", { slug: "kyma-api", code: "123456" })
    const dns = await ok.call("dns-start", { slug: "build-to-own-replay", email: "secret.person@kymaapi.com", turnstileToken: tokenFor("dns-start") }, { ip: "198.51.100.3" })
    // A store failure whose message carries an address must not reach the log.
    ok.store.failNextAddEvent = true
    assert.equal((await sendCode(ok, "other.person@kymaapi.com", "kyma-api", { ip: "198.51.100.4" })).status, 500)
    const all = lines.join("\n")
    for (const secret of ["secret.person", "other.person", "owner@kymaapi.com", code, String(dns.body.record).split("=")[1]]) {
      assert.equal(all.includes(secret), false, `log leaked ${secret}`)
    }
    assert.ok(lines.length > 0, "the failures were logged")
  } finally {
    Object.assign(console, original)
  }
})

test("unknown actions and inherited property names are 404", async () => {
  const t = setup()
  for (const action of ["constructor", "__proto__", "toString", "nope"]) {
    assert.equal((await t.call(action, {})).status, 404, action)
  }
  assert.equal((await t.call("send-code", null, { method: "GET" })).status, 404)
})

test("the approved email copy is plain transactional text", () => {
  const mail = codeEmail("<b>Acme</b>", "042137")
  assert.equal(mail.subject, "Your OpenAffiliate code: 042137")
  assert.equal(/affitor|launch|free until/i.test(mail.text), false, "no offer in the code email")
  assert.match(mail.html, /&lt;b&gt;Acme&lt;\/b&gt;/)
})

// ---------------------------------------------------------------- accounts (v4)

const signinCodeOf = (mail: OutgoingEmail) => /Your OpenAffiliate sign-in code: (\d{6})/.exec(mail.subject)![1]
const signinRequest = (t: ReturnType<typeof setup>, email: string, o: { ip?: string; cookies?: Map<string, string> } = {}) =>
  t.call("signin-code", { email, turnstileToken: tokenFor("signin") }, o)

test("claiming makes the claimer member 1 and signs them in to the account", async () => {
  const t = setup()
  await owner(t)
  const acct = await t.call("account", null, { method: "GET" })
  assert.equal(acct.status, 200)
  assert.equal(acct.body.signedIn, true)
  assert.equal(acct.body.domain, "kymaapi.com")
  assert.deepEqual((acct.body.members as { email: string; you: boolean }[]).map((m) => [m.email, m.you]), [["me@kymaapi.com", true]])
  assert.deepEqual((acct.body.programs as { slug: string }[]).map((p) => p.slug), ["kyma-api"])
})

test("sign in again after the session is gone: code to a member, session back", async () => {
  const t = setup()
  await owner(t)
  t.jar.clear()
  assert.deepEqual((await t.call("account", null, { method: "GET" })).body, { signedIn: false })
  const r = await signinRequest(t, "Me@KymaAPI.com")
  assert.equal(r.status, 200)
  const mail = t.sent.at(-1)!
  assert.equal(mail.template, "signin-code")
  assert.equal(mail.to, "me@kymaapi.com")
  const v = await t.call("signin-verify", { code: signinCodeOf(mail) })
  assert.equal(v.status, 200)
  assert.equal((await t.call("account", null, { method: "GET" })).body.signedIn, true)
  // Single use: the same code and cookie do not sign in twice.
  const again = await t.call("signin-verify", { code: signinCodeOf(mail) })
  assert.equal(again.status, 401)
})

test("sign-in answers a stranger exactly like a member, and mails nobody", async () => {
  const t = setup()
  await owner(t)
  const before = t.sent.length
  const member = await signinRequest(t, "me@kymaapi.com", { cookies: new Map(), ip: "198.51.100.10" })
  const stranger = await signinRequest(t, "nobody@kymaapi.com", { cookies: new Map(), ip: "198.51.100.11" })
  const outsider = await signinRequest(t, "someone@gmail.com", { cookies: new Map(), ip: "198.51.100.12" })
  assert.deepEqual([member.status, stranger.status, outsider.status], [200, 200, 200])
  assert.deepEqual(member.body, stranger.body)
  assert.deepEqual(stranger.body, outsider.body)
  const cookieNames = (r: { res: Response }) => r.res.headers.getSetCookie().map((c) => c.split("=")[0])
  assert.deepEqual(cookieNames(member), cookieNames(stranger))
  assert.equal(t.sent.length, before + 1, "only the member got a code")
  // The stranger's next step looks the same too: a wrong code, tries counting down.
  const jar = new Map<string, string>()
  await signinRequest(t, "nobody@kymaapi.com", { cookies: jar, ip: "198.51.100.13" })
  const guess = await t.call("signin-verify", { code: "123456" }, { cookies: jar })
  assert.equal(guess.status, 400)
  assert.equal(guess.body.error, "wrong_code")
})

test("sign-in limit: three requests per address per day, same answer for members and strangers", async () => {
  const t = setup()
  await owner(t)
  for (const email of ["me@kymaapi.com", "nobody@kymaapi.com"]) {
    const statuses: number[] = []
    for (let i = 0; i < 4; i++) statuses.push((await signinRequest(t, email, { cookies: new Map(), ip: `198.51.100.${20 + i}` })).status)
    assert.deepEqual(statuses, [200, 200, 200, 429], email)
  }
  const limited = (await signinRequest(t, "nobody@kymaapi.com", { cookies: new Map(), ip: "198.51.100.30" })).body
  const memberLimited = (await signinRequest(t, "me@kymaapi.com", { cookies: new Map(), ip: "198.51.100.31" })).body
  assert.deepEqual(limited, memberLimited)
})

test("sign-in codes: five wrong guesses lock the code; an expired code fails", async () => {
  const t = setup()
  await owner(t)
  t.jar.clear()
  await signinRequest(t, "me@kymaapi.com")
  const code = signinCodeOf(t.sent.at(-1)!)
  const wrong = code === "000000" ? "111111" : "000000"
  for (let i = 0; i < MAX_ATTEMPTS; i++) await t.call("signin-verify", { code: wrong })
  assert.equal((await t.call("signin-verify", { code })).status, 429)

  const u = setup()
  await owner(u)
  u.jar.clear()
  await signinRequest(u, "me@kymaapi.com")
  u.advance(CODE_TTL_MS + 1)
  assert.equal((await u.call("signin-verify", { code: signinCodeOf(u.sent.at(-1)!) })).status, 401, "pending cookie expired with the code")
})

test("teammates: same-domain addresses only, up to the cap, each gets one notice", async () => {
  const t = setup()
  await owner(t)
  assert.equal((await t.call("member-add", { email: "pal@gmail.com" })).status, 400)
  assert.equal((await t.call("member-add", { email: "pal@mail.kymaapi.com" })).status, 400, "subdomain refused like a claim")
  for (const name of ["ann", "bo", "cy"]) assert.equal((await t.call("member-add", { email: `${name}@kymaapi.com` })).status, 200, name)
  const full = await t.call("member-add", { email: "dee@kymaapi.com" })
  assert.equal(full.status, 409)
  assert.equal(full.body.error, "team_full")
  assert.equal((await t.store.listMembers([...t.store.claims.keys()][0])).length, MAX_MEMBERS)
  const notices = t.sent.filter((m) => m.template === "member-added")
  assert.deepEqual(notices.map((m) => m.to), ["ann@kymaapi.com", "bo@kymaapi.com", "cy@kymaapi.com"])
  assert.equal(notices.some((m) => m.text.includes("me@kymaapi.com")), false, "the notice names nobody")
})

test("a teammate signs in with their own address; removing them ends their session at once", async () => {
  const t = setup()
  await owner(t)
  const ownerJar = new Map(t.jar)
  await t.call("member-add", { email: "ann@kymaapi.com" })
  const annJar = new Map<string, string>()
  await signinRequest(t, "ann@kymaapi.com", { cookies: annJar, ip: "198.51.100.40" })
  const annMail = t.sent.filter((m) => m.template === "signin-code").at(-1)!
  assert.equal(annMail.to, "ann@kymaapi.com")
  assert.equal((await t.call("signin-verify", { code: signinCodeOf(annMail) }, { cookies: annJar })).status, 200)
  const acct = await t.call("account", null, { method: "GET", cookies: annJar })
  assert.equal(acct.body.signedIn, true)
  const annId = (acct.body.members as { id: string; you: boolean }[]).find((m) => m.you)!.id

  assert.equal((await t.call("member-remove", { memberId: annId }, { cookies: annJar })).status, 400, "cannot remove yourself")
  assert.equal((await t.call("member-remove", { memberId: annId }, { cookies: ownerJar })).status, 200)
  assert.deepEqual((await t.call("account", null, { method: "GET", cookies: annJar })).body, { signedIn: false })
  assert.equal((await t.call("terms", { slug: "kyma-api", terms: { rate: "20%", type: "recurring" } }, { cookies: annJar })).status, 401)
  const removed = (await t.store.getMember(annId))!
  assert.equal(removed.email, null, "the address is forgotten on removal")
})

test("release signs every member out and forgets every address", async () => {
  const t = setup()
  await owner(t)
  const ownerJar = new Map(t.jar)
  await t.call("member-add", { email: "ann@kymaapi.com" })
  assert.equal((await t.call("release", {}, { cookies: ownerJar })).status, 200)
  for (const m of t.store.members.values()) {
    assert.equal(m.status, "removed")
    assert.equal(m.email, null)
  }
  assert.deepEqual((await t.call("account", null, { method: "GET", cookies: ownerJar })).body, { signedIn: false })
  // Sign-in for a former member now mails nothing.
  const before = t.sent.length
  assert.equal((await signinRequest(t, "ann@kymaapi.com", { cookies: new Map(), ip: "198.51.100.50" })).status, 200)
  assert.equal(t.sent.length, before)
})

test("one address, one team: a DNS claimer already on another team is refused and the claim undone", async () => {
  const t = setup()
  await owner(t)
  const dns = await t.call(
    "dns-start",
    { slug: "build-to-own-replay", email: "me@kymaapi.com", turnstileToken: tokenFor("dns-start") },
    { cookies: new Map(t.jar), ip: "198.51.100.60" },
  )
  assert.equal(dns.status, 200)
  t.txt["build2own.dev"] = [[String(dns.body.record)]]
  const pending = new Map(t.jar)
  for (const c of dns.res.headers.getSetCookie()) {
    const [pair] = c.split("; ")
    const [name, ...value] = pair.split("=")
    pending.set(name, value.join("="))
  }
  const r = await t.call("dns-check", { slug: "build-to-own-replay" }, { cookies: pending, ip: "198.51.100.60" })
  assert.equal(r.status, 409)
  assert.equal(r.body.error, "address_on_another_team")
  const b2o = [...t.store.claims.values()].find((c) => c.domain === "build2own.dev")!
  assert.equal(b2o.status, "released")
})

test("only allow-listed templates leave the live sender; the template is set on every mail", async () => {
  const t = setup()
  await owner(t)
  t.jar.clear()
  await signinRequest(t, "me@kymaapi.com")
  await t.call("signin-verify", { code: signinCodeOf(t.sent.at(-1)!) })
  await t.call("member-add", { email: "ann@kymaapi.com" })
  for (const m of t.sent) assert.ok((MAIL_TEMPLATES as readonly string[]).includes(m.template), m.template)

  const deps = liveClaimDeps(() => undefined, () => [], () => {}, FULL_ENV)!
  const realFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async () => {
    calls++
    return new Response("{}", { status: 200 })
  }) as typeof fetch
  try {
    const ok = await deps.sendEmail({ template: "outreach" as never, to: "x@example.com", subject: "s", text: "t", html: "h", idempotencyKey: "k" })
    assert.equal(ok, false)
    assert.equal(calls, 0, "refused before any request to the mail API")
    assert.equal(await deps.sendEmail({ template: "signin-code", to: "x@example.com", subject: "s", text: "t", html: "h", idempotencyKey: "k" }), true)
    assert.equal(calls, 1)
  } finally {
    globalThis.fetch = realFetch
  }
})

test("account mails are plain transactional text with no offer", () => {
  const s = signinEmail("042137")
  assert.equal(s.subject, "Your OpenAffiliate sign-in code: 042137")
  const m = memberAddedEmail("kymaapi.com")
  for (const text of [s.text, m.text]) assert.equal(/affitor|launch|free until|pricing/i.test(text), false)
  assert.match(m.text, /openaffiliate\.dev\/account/)
})

test("a member's sign-in answer does not wait for the mail; a failed send gives the quota back", async () => {
  const t = setup({ sendOk: false })
  // Claim with a working sender first.
  const ok = setup()
  await owner(ok)
  const claimed = [...ok.store.claims.values()][0]
  t.store.claims.set(claimed.id, claimed)
  for (const m of ok.store.members.values()) t.store.members.set(m.id, m)
  const r = await signinRequest(t, "me@kymaapi.com", { cookies: new Map() })
  assert.equal(r.status, 200, "same answer as a stranger even though the mail failed")
  assert.equal(t.store.count("signin.code_sent"), 0, "reservation withdrawn after the failed send")
})

test("adding an address that is on another team does not say so; one already on yours does", async () => {
  const t = setup()
  await owner(t)
  await t.call("member-add", { email: "ann@kymaapi.com" })
  const again = await t.call("member-add", { email: "ANN@kymaapi.com" })
  assert.equal(again.body.error, "already_member")
  // Another account holds this address (as a DNS claim's contact would).
  const otherClaim = randomUUID()
  t.store.claims.set(otherClaim, { ...[...t.store.claims.values()][0], id: otherClaim, domain: "build2own.dev", slug: "build-to-own-replay" })
  await t.store.addMember(otherClaim, "bo@kymaapi.com", null, MAX_MEMBERS)
  const elsewhere = await t.call("member-add", { email: "bo@kymaapi.com" })
  assert.equal(elsewhere.status, 409)
  assert.equal(elsewhere.body.error, "cannot_add")
  assert.equal(String(elsewhere.body.message).includes("team"), false, "no hint of another team")
})
