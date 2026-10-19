/**
 * OAS v1 (src/lib/oas-v1.ts scores, src/lib/oas.ts ranks): every check outcome
 * from a YAML fixture, hold-outs that keep the parts at 70 and 30, the ranking
 * rules, and the served file. Fixtures only: no real score is written here.
 */
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { parse } from "yaml"
import {
  AGREE_FIX,
  buildBoard,
  categoryRank,
  CHECK_IDS,
  CHECKS,
  improveText,
  isStale,
  oasScores,
  oasValue,
  partEarned,
  rankText,
  round1,
  type CheckState,
  type OasScore,
  type ProgramRef,
} from "../src/lib/oas"
import { isScored, scoreAll, scoreProgram, type ProgramYaml } from "../src/lib/oas-v1"
import { NOT_PUBLISHED_FIELDS, notPublishedProblems, payoutLagProblems } from "./program-rules"

const TODAY = new Date("2026-10-20T00:00:00Z")

/** Every term marked Not published by the data lane: an absent field then scores Not published. */
const MARKED = Object.fromEntries(["commission.duration", "cookie_days", "payout.minimum", "payout.methods", "payout.frequency", "approval", "restrictions"].map((f) => [f, "2026-10-14"]))

/** A verified program that meets every check unless `over` changes it; absent terms are marked Not published. */
function yaml(slug: string, over: Partial<ProgramYaml> = {}): ProgramYaml {
  return {
    slug,
    kind: "affiliate",
    verified: true,
    status: "active",
    last_verified_at: "2026-10-13",
    signup_url: `https://${slug}.example/affiliates`,
    commission: { type: "recurring", rate: "30%", duration: "12 months" },
    cookie_days: 60,
    payout: { minimum: 50, currency: "USD", frequency: "monthly", methods: ["paypal"] },
    approval: "auto",
    restrictions: ["No brand bidding"],
    not_published: MARKED,
    ...over,
  }
}

const P = (slug: string, category = "AI", network: string | null = "partnerstack"): ProgramRef => ({ slug, name: slug, category, network })
const states = (s: OasScore) => Object.fromEntries(s.checks.map((c) => [c.id, c.state])) as Record<string, CheckState>
const state = (over: Partial<ProgramYaml>, id: string) => states(scoreProgram(yaml("p", over), TODAY))[id]

test("catalog: 11 checks, Transparency 70 and Partner value 30", () => {
  assert.deepEqual(CHECK_IDS, ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "V1", "V2", "V3"])
  assert.deepEqual(Object.keys(CHECKS).sort(), [...CHECK_IDS].sort())
  const sum = (part: string) => CHECK_IDS.filter((id) => CHECKS[id].part === part).reduce((a, id) => a + CHECKS[id].max, 0)
  assert.equal(sum("transparency"), 70)
  assert.equal(sum("partner_value"), 30)
  for (const id of CHECK_IDS) assert.ok(CHECKS[id].label && CHECKS[id].fix && CHECKS[id].field, id)
})

test("all met: 70 + 30 = 100, with the page checked and the verified date", () => {
  const s = scoreProgram(yaml("full"), TODAY)
  assert.deepEqual([s.transparency, s.partner_value, s.oas, oasValue(s)], [70, 30, 100, 100])
  assert.equal(s.version, "v1")
  assert.equal(s.checked_at, "2026-10-13")
  assert.equal(s.page_url, "https://full.example/affiliates")
  assert.ok(s.checks.every((c) => c.state === "met" && c.points === c.max))
})

test("T1 commission: a number is met; \"varies\" is not met", () => {
  assert.equal(state({}, "T1"), "met")
  assert.equal(state({ commission: { type: "one-time", rate: "$5 per lead" } }, "T1"), "met")
  assert.equal(state({ commission: { type: "recurring", rate: "varies", duration: "lifetime" } }, "T1"), "not_met")
  const c = scoreProgram(yaml("p", { commission: { type: "recurring", rate: "varies", duration: "lifetime" } }), TODAY).checks[0]
  assert.equal(improveText(c), CHECKS.T1.fix)
})

test("T2 duration: one-time or a stated duration; else Not published", () => {
  assert.equal(state({ commission: { type: "one-time", rate: "$20" } }, "T2"), "met")
  assert.equal(state({ commission: { type: "recurring", rate: "30%", duration: "lifetime" } }, "T2"), "met")
  assert.equal(state({ commission: { type: "recurring", rate: "30%", duration: null } }, "T2"), "not_public")
})

test("T3 and V1 cookie: 60+ days or lifetime meet both; 0 is a stated term that fails V1; absent is Not published", () => {
  assert.deepEqual([state({ cookie_days: 90 }, "T3"), state({ cookie_days: 90 }, "V1")], ["met", "met"])
  assert.deepEqual([state({ cookie_days: 30 }, "T3"), state({ cookie_days: 30 }, "V1")], ["met", "not_met"])
  assert.deepEqual([state({ cookie_days: 0 }, "T3"), state({ cookie_days: 0 }, "V1")], ["met", "not_met"])
  assert.deepEqual([state({ cookie_days: undefined, cookie_lifetime: true }, "T3"), state({ cookie_days: undefined, cookie_lifetime: true }, "V1")], ["met", "met"])
  assert.deepEqual([state({ cookie_days: undefined }, "T3"), state({ cookie_days: undefined }, "V1")], ["not_public", "not_public"])
})

test("T4 and V2 minimum: USD 50 or less after the frozen FX; none = 0; other currencies are Checking", () => {
  const pay = (minimum: number | undefined, currency = "USD") => ({ payout: { minimum, currency, frequency: "monthly", methods: ["paypal"] } })
  assert.deepEqual([state(pay(0), "T4"), state(pay(0), "V2")], ["met", "met"])
  assert.equal(state(pay(50), "V2"), "met")
  assert.equal(state(pay(100), "V2"), "not_met")
  assert.equal(state(pay(46, "EUR"), "V2"), "met") // 49.68 USD
  assert.equal(state(pay(46.29, "EUR"), "V2"), "met") // 49.9932 USD
  assert.equal(state(pay(46.3, "EUR"), "V2"), "not_met") // 50.004 USD: compared unrounded
  assert.equal(state(pay(50, "EUR"), "V2"), "not_met") // 54 USD
  assert.equal(state(pay(50, "AUD"), "V2"), "met") // 32.5 USD
  assert.deepEqual([state(pay(undefined), "T4"), state(pay(undefined), "V2")], ["not_public", "not_public"])
  const jpy = scoreProgram(yaml("p", pay(5000, "JPY")), TODAY)
  assert.equal(states(jpy).V2, "checking")
  assert.equal(oasValue(jpy), null, "a check on our side leaves the score in progress")
})

test("T5 methods, T7 approval: stated or Not published", () => {
  assert.equal(state({ payout: { minimum: 50, frequency: "monthly", methods: [] } }, "T5"), "not_public")
  assert.equal(state({ payout: { minimum: 50, frequency: "monthly" } }, "T5"), "not_public")
  assert.equal(state({ approval: "manual" }, "T7"), "met")
  assert.equal(state({ approval: undefined }, "T7"), "not_public")
})

test("T6 and V3 schedule: net-30 and on-request are at least monthly; net-60 and quarterly are not", () => {
  const f = (frequency?: string) => ({ payout: { minimum: 50, currency: "USD", frequency, methods: ["paypal"] } })
  for (const ok of ["daily", "weekly", "bi-weekly", "twice-monthly", "monthly", "on-request", "net-30"]) assert.deepEqual([state(f(ok), "T6"), state(f(ok), "V3")], ["met", "met"], ok)
  for (const slow of ["net-60", "quarterly"]) assert.deepEqual([state(f(slow), "T6"), state(f(slow), "V3")], ["met", "not_met"], slow)
  assert.deepEqual([state(f(undefined), "T6"), state(f(undefined), "V3")], ["not_public", "not_public"])
})

test("T8 rules: a list or [] (the brand says none) is met; null is Not published", () => {
  assert.equal(state({ restrictions: [] }, "T8"), "met")
  assert.equal(state({ restrictions: null }, "T8"), "not_public")
  assert.equal(state({ restrictions: undefined }, "T8"), "not_public")
})

test("a conflict fails the term's T check and its V pair, with the agree fix", () => {
  const s = scoreProgram(yaml("p", { conflicts: [{ field: "cookie_days", quote: "Terms: 60 days; network listing: 90 days." }] }), TODAY)
  const t3 = s.checks.find((c) => c.id === "T3")!
  assert.deepEqual([states(s).T3, states(s).V1], ["not_met", "not_met"])
  assert.equal(t3.conflict, "Terms: 60 days; network listing: 90 days.")
  assert.equal(improveText(t3), AGREE_FIX)
  assert.equal(s.oas, 80)
})

test("a Not published V check shows how to publish the term", () => {
  const v2 = scoreProgram(yaml("p", { payout: { frequency: "monthly", methods: ["paypal"] } }), TODAY).checks.find((c) => c.id === "V2")!
  assert.equal(improveText(v2), CHECKS.T4.fix)
})

test("held out: points spread inside the part, parts stay /70 and /30, weights unrounded", () => {
  const s = scoreProgram(yaml("p", { restrictions: null }), TODAY, ["T8"])
  const t8 = s.checks.find((c) => c.id === "T8")!
  assert.deepEqual([t8.state, t8.max, t8.points], ["held_out", 0, 0])
  assert.equal(s.checks.find((c) => c.id === "T1")!.max, (12 * 70) / 64)
  assert.equal(s.transparency, 70)
  assert.equal(oasValue(s), 100, "a held-out check never blocks the score")
  // T6 held out: 62 points left, so a program missing only T5 (8) keeps 70 - 8 × 70/62.
  const t6 = scoreProgram(yaml("p", { payout: { minimum: 50, currency: "USD", frequency: "monthly" } }), TODAY, ["T6"])
  assert.equal(t6.transparency, round1(70 - (8 * 70) / 62))
})

test("a held-out T check takes its V pair where the term is absent, and only there", () => {
  const absent = scoreProgram(yaml("p", { payout: { minimum: 50, currency: "USD", methods: ["paypal"] } }), TODAY, ["T6"])
  assert.deepEqual([states(absent).T6, states(absent).V3], ["held_out", "held_out"])
  assert.equal(absent.checks.find((c) => c.id === "V1")!.max, 15)
  assert.deepEqual([absent.transparency, absent.partner_value, absent.oas], [70, 30, 100])
  const stated = scoreProgram(yaml("p", { payout: { minimum: 50, currency: "USD", frequency: "net-60", methods: ["paypal"] } }), TODAY, ["T6"])
  assert.deepEqual([states(stated).T6, states(stated).V3], ["held_out", "not_met"])
  assert.equal(stated.partner_value, 20)
})

test("a part with nothing left to assess is Checking, never a crash", () => {
  const bare = { cookie_days: undefined, payout: { methods: ["paypal"] } }
  const s = scoreProgram(yaml("p", bare), TODAY, ["T3", "T4", "T6"])
  assert.deepEqual([states(s).V1, states(s).V2, states(s).V3], ["checking", "checking", "checking"])
  assert.equal(oasValue(s), null)
  const dir = join(process.cwd(), "programs")
  const raw = readdirSync(dir).filter((f) => f.endsWith(".yaml")).map((f) => parse(readFileSync(join(dir, f), "utf8")) as ProgramYaml)
  assert.doesNotThrow(() => scoreAll(raw, TODAY, ["T3", "T4", "T6"]))
  assert.doesNotThrow(() => scoreAll(raw, TODAY, CHECK_IDS))
})

test("a score expires when read more than 90 days after the terms were verified, even with no rebuild", () => {
  const s = scoreProgram(yaml("p"), TODAY)
  assert.equal(oasValue(s, TODAY), 100)
  assert.equal(oasValue(s, new Date("2027-01-12T00:00:00Z")), null)
  const later = buildBoard([s], [P("p")], new Date("2027-01-12T00:00:00Z"))
  assert.deepEqual([later[0].oas, later[0].rank, later[0].unranked], [null, null, "checking"])
})

test("eligibility: unverified, referral and paused are not scored; a review older than 90 days is Scoring in progress", () => {
  assert.equal(isScored(yaml("a")), true)
  assert.equal(isScored(yaml("a", { verified: false })), false)
  assert.equal(isScored(yaml("a", { kind: "referral" })), false)
  assert.equal(isScored(yaml("a", { status: "paused" })), false)
  assert.equal(isScored({ ...yaml("a"), kind: undefined }), true)
  assert.deepEqual(scoreAll([yaml("b"), yaml("a"), yaml("c", { verified: false })], TODAY).map((s) => s.slug), ["a", "b"])
  const old = scoreProgram(yaml("old", { last_verified_at: "2026-06-01" }), TODAY)
  assert.equal(oasValue(old), null)
  assert.ok(old.checks.every((c) => c.state === "checking" && c.points === 0))
})

test("same input, same score", () => {
  assert.deepEqual(scoreProgram(yaml("p", { cookie_days: 30 }), TODAY), scoreProgram(yaml("p", { cookie_days: 30 }), TODAY))
})

test("ranking: ties share a rank; Kyma, the Affitor network, scoring, no apply link and stale are not ranked", () => {
  const score = (slug: string, over: Partial<ProgramYaml> = {}) => scoreProgram(yaml(slug, over), TODAY)
  const scores = [
    score("top"),
    score("tie-a", { cookie_days: 30 }),
    score("tie-b", { cookie_days: 30 }),
    score("third", { cookie_days: 30, approval: undefined }),
    score("kyma-api"),
    score("on-affitor"),
    score("scoring", { last_verified_at: "2026-01-01" }),
    score("no-apply", { signup_url: null }),
    { ...score("stale"), checked_at: "2026-06-01" },
    score("not-in-registry"),
  ]
  const programs = [P("top"), P("tie-a"), P("tie-b"), P("third", "Marketing"), P("kyma-api"), P("on-affitor", "AI", "affitor"), P("scoring"), P("no-apply"), P("stale")]
  const board = buildBoard(scores, programs, TODAY)
  const by = Object.fromEntries(board.map((r) => [r.program.slug, r]))
  assert.equal(board.length, 9)
  assert.deepEqual(board.filter((r) => r.rank != null).map((r) => [r.program.slug, r.rank]), [["top", 1], ["tie-a", 2], ["tie-b", 2], ["third", 4]])
  assert.equal(by["kyma-api"].unranked, "same-team")
  assert.equal(by["kyma-api"].oas, 100, "same team is scored with the same rules")
  assert.equal(by["on-affitor"].unranked, "affitor")
  assert.equal(by["scoring"].unranked, "checking")
  assert.equal(by["no-apply"].unranked, "no-apply-link")
  assert.equal(by["stale"].unranked, "checking")
  assert.equal(by["stale"].oas, null)
  assert.deepEqual(categoryRank(board, "tie-b"), { rank: 2, of: 3, category: "AI" })
  assert.equal(categoryRank(board, "kyma-api"), null)
})

test("rank line: #1 always, others only with 5 or more ranked", () => {
  assert.equal(rankText({ rank: 1, of: 2, category: "AI" }), "#1 of 2 ranked in AI")
  assert.equal(rankText({ rank: 2, of: 2, category: "AI" }), null)
  assert.equal(rankText({ rank: 1, of: 8, category: "AI" }), "#1 in AI")
  assert.equal(rankText({ rank: 3, of: 8, category: "AI" }), "Top 3 in AI")
  assert.equal(rankText({ rank: 4, of: 8, category: "AI" }), "Top half in AI")
  assert.equal(rankText({ rank: 5, of: 8, category: "AI" }), null)
  assert.equal(rankText(null), null)
})

test("v1.1/v1.2: an absent term is Not published only with a marker; unmarked it is not assessed yet, so no number", () => {
  const marked = scoreProgram(yaml("p", { restrictions: null, not_published: { restrictions: "2026-10-15" } }), TODAY)
  const t8 = marked.checks.find((c) => c.id === "T8")!
  assert.deepEqual([t8.state, t8.checked, t8.points], ["not_public", "2026-10-15", 0])
  assert.equal(marked.transparency, 64)

  const unmarked = scoreProgram(yaml("p", { restrictions: null, not_published: null }), TODAY)
  assert.equal(states(unmarked).T8, "checking")
  assert.deepEqual([unmarked.transparency, unmarked.oas, oasValue(unmarked)], [null, null, null], "an unchecked term neither costs nor gives points")

  // An unmarked absent cookie leaves T3 and V1 unassessed.
  const cookie = scoreProgram(yaml("p", { cookie_days: undefined, not_published: {} }), TODAY)
  assert.deepEqual([states(cookie).T3, states(cookie).V1], ["checking", "checking"])
  assert.equal(oasValue(cookie), null)

  // A marker for another field does not mark this one.
  assert.equal(states(scoreProgram(yaml("p", { approval: undefined, not_published: { cookie_days: "2026-10-15" } }), TODAY)).T7, "checking")

  // Stated terms ignore markers; a conflict still fails the check (assessed, so a number).
  assert.equal(state({ not_published: { cookie_days: "2026-10-15" } }, "T3"), "met")
  const conflict = scoreProgram(yaml("p", { cookie_days: undefined, conflicts: [{ field: "cookie_days", quote: "30 vs 90 days" }], not_published: null }), TODAY)
  assert.deepEqual([states(conflict).T3, states(conflict).V1, conflict.oas], ["not_met", "not_met", 80])
})

test("v1.2 (spec fixtures): a number needs every check assessed; only a gate-level hold-out redistributes", () => {
  // Thin YAML, like visualcv: only the rate and a 60-day cookie, nothing marked. v1.1 gave it 100; v1.2 gives no number.
  const thin = scoreProgram(
    yaml("thin", { commission: { type: "recurring", rate: "30%", duration: null }, payout: null, approval: undefined, restrictions: null, not_published: null }),
    TODAY,
  )
  assert.equal(oasValue(thin), null)
  assert.deepEqual(thin.checks.filter((c) => c.state === "met").map((c) => c.id), ["T1", "T3", "V1"])

  // All 11 assessed, approval and rules marked Not published: a number, below 100.
  const assessed = scoreProgram(yaml("p", { approval: undefined, restrictions: null }), TODAY)
  assert.ok(assessed.checks.every((c) => c.state !== "checking" && c.state !== "held_out"))
  assert.deepEqual([assessed.transparency, assessed.partner_value, oasValue(assessed)], [58, 30, 88])

  // A check held out for every program after a gate (HELD_OUT) still spreads its points: T8 out, T1-T7 scaled to 70.
  const gate = scoreProgram(yaml("p", { restrictions: null, not_published: null }), TODAY, ["T8"])
  assert.equal(states(gate).T8, "held_out")
  assert.deepEqual([gate.transparency, oasValue(gate)], [70, 100])
})

test("v1.1 markers are validated at build: known terms, real dates, a map", () => {
  const schema = JSON.parse(readFileSync(join(process.cwd(), "schema", "program.schema.json"), "utf8"))
  assert.deepEqual(Object.keys(schema.properties.not_published.properties).sort(), [...NOT_PUBLISHED_FIELDS].sort(), "the rule and the schema name the same terms")
  assert.deepEqual(notPublishedProblems({}), [])
  assert.deepEqual(notPublishedProblems({ not_published: { "payout.methods": "2026-10-15", approval: "2026-10-15" } }), [])
  assert.equal(notPublishedProblems({ not_published: { "payout.metods": "2026-10-15" } }).length, 1, "a typo fails instead of leaving the term unassessed")
  assert.equal(notPublishedProblems({ not_published: { cookie_days: "not-a-date" } }).length, 1)
  assert.equal(notPublishedProblems({ not_published: { cookie_days: "2026-02-30" } }).length, 1)
  assert.equal(notPublishedProblems({ not_published: { cookie_days: 20261015 } }).length, 1)
  for (const scalar of ["2026-10-15", null, ["cookie_days"]]) assert.equal(notPublishedProblems({ not_published: scalar }).length, 1, JSON.stringify(scalar))
})

test("a cadence beside a stated wait over 30 days fails the build: up to 30 days is net-30, 31-60 net-60", () => {
  const lag = (frequency: string, conditions: string, where: "payout" | "commission" = "commission") =>
    payoutLagProblems(where === "payout" ? { payout: { frequency, conditions } } : { payout: { frequency }, commission: { conditions } })
  const hit = lag("monthly", "Paid monthly. Commissions are paid 60 days after the qualifying purchase.")
  assert.equal(hit.length, 1)
  assert.match(hit[0], /payout\.frequency is monthly, but commission\.conditions states a 60-day wait \("Commissions are paid 60 days after the qualifying purchase\."\)/)
  assert.match(lag("monthly", "Payment within 45 days after the end of the calendar month.", "payout")[0], /payout\.conditions states a 45-day wait/)
  assert.match(lag("twice-monthly", "Commissions are sent 35-40 days after the end of the month.")[0], /40-day wait/, "a range waits its upper number")
  for (const f of ["weekly", "bi-weekly", "daily"]) assert.equal(lag(f, "Paid 31 business days following the sale.").length, 1, f)
  assert.equal(lag("monthly", "Paid 31 days after sale. Held 45 days after the refund window.").length, 2, "one problem per sentence")
  // Not a cadence, or no wait over 30 days, or no wait at all.
  for (const f of ["net-30", "net-60", "quarterly", "on-request"]) assert.deepEqual(lag(f, "Paid 60 days after the sale."), [], f)
  assert.deepEqual(lag("monthly", "Paid 30 days after the end of the month."), [])
  assert.deepEqual(lag("monthly", "Customers must stay subscribed for 90 days. A 60-day cookie."), [])
  assert.deepEqual(payoutLagProblems({}), [])
  assert.deepEqual(payoutLagProblems({ payout: { frequency: "monthly", conditions: null } }), [])
})

test("payout-lag debt: frozen files only, each still failing the rule, until it expires", () => {
  const debt = JSON.parse(readFileSync(join(process.cwd(), "schema", "payout-lag-debt.json"), "utf8")) as { slugs: string[]; expires: string }
  const dir = join(process.cwd(), "programs")
  const failing = readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => parse(readFileSync(join(dir, f), "utf8")) as Record<string, unknown>)
    .filter((p) => payoutLagProblems(p).length > 0)
    .map((p) => String(p.slug))
  assert.deepEqual(debt.slugs.filter((s) => !failing.includes(s)), [], "a fixed file leaves the list")
  assert.ok(debt.slugs.length <= 8, "the list never grows")
  assert.ok(new Date().toISOString().slice(0, 10) <= debt.expires, `payout-lag-debt.json expired on ${debt.expires}: fix ${debt.slugs.join(", ")}`)
})

test("the registry's own YAML: read raw; an absent term is Not published only with its marker (spec 7b.1, v1.1)", () => {
  const dir = join(process.cwd(), "programs")
  const raw = readdirSync(dir).filter((f) => f.endsWith(".yaml")).map((f) => parse(readFileSync(join(dir, f), "utf8")) as ProgramYaml)
  const scored = scoreAll(raw, new Date())
  assert.ok(scored.length > 0)
  const bySlug = new Map(raw.map((p) => [p.slug, p]))
  for (const s of scored) {
    const t8 = s.checks.find((c) => c.id === "T8")!
    const p = bySlug.get(s.slug)!
    const fresh = !isStale(p.last_verified_at, new Date())
    // Same as scoreProgram: the last entry for a field wins, and only a non-empty quote counts.
    const disagree = Boolean(new Map((p.conflicts ?? []).map((c) => [c.field, c.quote])).get("restrictions"))
    assert.equal(t8.state, !fresh ? "checking" : disagree ? "not_met" : Array.isArray(p.restrictions) ? "met" : p.not_published?.restrictions ? "not_public" : "checking", s.slug)
    if (s.oas != null) assert.equal(s.oas, round1(partEarned(s, "transparency") + partEarned(s, "partner_value")), s.slug)
  }
})

test("oas-scores.json: [] while OAS_PUBLISHED is false, and well formed", () => {
  const script = readFileSync(join(process.cwd(), "scripts", "build-oas.ts"), "utf8")
  if (/^const OAS_PUBLISHED = false$/m.test(script)) assert.deepEqual(oasScores, [])
  for (const s of oasScores) {
    assert.match(s.slug, /^[a-z0-9-]+$/)
    assert.ok(!Number.isNaN(Date.parse(s.checked_at)), `${s.slug} checked_at`)
    assert.deepEqual(s.checks.map((c) => c.id), CHECK_IDS, `${s.slug} has every check once, in order`)
    for (const c of s.checks) {
      assert.ok(["met", "not_met", "not_public", "checking", "held_out"].includes(c.state), `${s.slug} ${c.id} state`)
      assert.equal(c.points, c.state === "met" ? c.max : 0, `${s.slug} ${c.id} points`)
    }
    if (s.oas != null) {
      assert.equal(s.transparency, partEarned(s, "transparency"), `${s.slug} transparency`)
      assert.equal(s.partner_value, partEarned(s, "partner_value"), `${s.slug} partner value`)
      assert.equal(s.oas, round1(s.transparency! + s.partner_value!), `${s.slug} oas`)
    }
  }
})
