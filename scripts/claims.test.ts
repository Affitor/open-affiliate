import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import {
  PILOT_SLUGS,
  claimEnvReady,
  claimsEnabledFor,
  emailMatchesDomain,
  normalizeEmail,
  registrableDomain,
  unclaimableReason,
} from "../src/lib/claims/rules"
import {
  CODE_TTL_MS,
  LIMITS,
  MAX_ATTEMPTS,
  codeEmail,
  editFlags,
  handleClaim,
  type ClaimDeps,
  type ClaimEvent,
  type ClaimProgram,
  type ClaimRow,
  type ClaimStore,
  type EventFilter,
  type OutgoingEmail,
} from "../src/lib/claims/service"

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
  edits: { claim_id: string; slug: string; fields: Record<string, unknown> }[] = []
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
  }
  async addEdit(edit: { claim_id: string; slug: string; fields: Record<string, unknown> }) {
    this.edits.push(edit)
  }
  async prune() {}
  async countProgramEvents() {
    return 42
  }
  count(type: string) {
    return this.events.filter((e) => e.type === type).length
  }
}

function setup(opts: { turnstile?: boolean; sendOk?: boolean } = {}) {
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
    verifyTurnstile: async () => {
      turnstileCalls++
      return opts.turnstile ?? true
    },
    sendEmail: async (mail) => {
      sent.push(mail)
      return opts.sendOk ?? true
    },
    resolveTxt: async (domain) => txt[domain] ?? [],
  }
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
  t.call("send-code", { slug, email, turnstileToken: "tok" }, o)

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
    for (const action of ["send-code", "verify", "dns-start", "dns-check", "manual", "terms", "release"]) {
      const res = await route.POST(
        new Request(`https://openaffiliate.dev/api/claims/${action}`, { method: "POST", body: "{}" }),
        { params: Promise.resolve({ action }) },
      )
      assert.equal(res.status, 503, action)
      assert.equal(((await res.json()) as { message: string }).message, "claims not enabled")
    }
    const res = await route.GET(new Request("https://openaffiliate.dev/api/claims/session?slug=kyma-api"), {
      params: Promise.resolve({ action: "session" }),
    })
    assert.equal(res.status, 503)
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
  const a = await t.call("dns-start", { slug: "build-to-own-replay", email: "ops@gmail.com", turnstileToken: "tok" }, { cookies: jarA })
  const b = await t.call("dns-start", { slug: "build-to-own-replay", email: "x@gmail.com", turnstileToken: "tok" }, { cookies: jarB, ip: "198.51.100.2" })
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
  const r = await t.call("dns-start", { slug: "kyma-api", email: "a@b.io", turnstileToken: "tok" })
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
    assert.equal((await t.call("dns-start", { slug: "build-to-own-replay", email: `p${i}@x.io`, turnstileToken: "tok" })).status, 200)
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
    t.call("manual", { slug: "kyma-api", email: "me@agency.io", note: "I run partnerships", turnstileToken: "tok" }, { ip })
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
    const dns = await ok.call("dns-start", { slug: "build-to-own-replay", email: "secret.person@kymaapi.com", turnstileToken: "tok" }, { ip: "198.51.100.3" })
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
