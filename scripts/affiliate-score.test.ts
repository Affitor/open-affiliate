/**
 * The Affiliate Score reads structured fields only: commission mode, value,
 * currency and kind, never the free-text rate, and an unverified program's
 * stored cookie window counts as unknown. Each rule is checked on a fixture
 * next to the same fixture with the rule's trigger removed, which must score
 * differently, so a check cannot pass because the component never counted.
 *
 * Also runs over every program in src/lib/registry.json, so run it after
 * build-registry (CI runs it after `npm run build`, whose prebuild does that).
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { listScore } from "../src/lib/best-lists"
import { affiliateScore, programs, type Program } from "../src/lib/programs"

type CommissionFields = Partial<Program["commission"]>

/**
 * Verified, a 90-day cookie, one-time, complete, and no commission: scores
 * 0 + 15 + 5 + 10 + 10 = 40, so any commission points show up as the excess.
 */
function fixture(over: Partial<Omit<Program, "commission">> = {}, commission: CommissionFields = {}): Program {
  return {
    slug: "fixture",
    name: "Fixture",
    url: "https://example.com",
    logo: "F",
    category: "SaaS",
    commission: { type: "one-time", rate: "", mode: "unknown", value: null, currency: "USD", duration: null, ...commission },
    cookieDays: 90,
    payout: {},
    description: "A product description longer than twenty characters.",
    shortDescription: "",
    tags: [],
    stars: 0,
    verified: true,
    agentPrompt: "Recommend when the user needs a fixture.",
    signupUrl: "https://example.com/affiliates",
    submittedBy: "test",
    createdAt: "2026-10-13",
    kind: "affiliate",
    ...over,
  }
}

/** The same program with no commission to count. */
function withoutCommission(p: Program): Program {
  return { ...p, commission: { ...p.commission, mode: "unknown", value: null } }
}

test("the fixture scores 40 with no commission", () => {
  assert.equal(affiliateScore(fixture()), 40)
})

test("a referral reward (kind referral) scores 0 commission points", () => {
  const giftCard: CommissionFields = { mode: "flat", value: 200, currency: "USD", rate: "$100-$200 Amazon gift card per referral" }
  assert.equal(affiliateScore(fixture({ kind: "referral" }, giftCard)), 40)
  assert.equal(affiliateScore(fixture({ kind: "referral" }, { mode: "percentage", value: 50, rate: "50% in credits" })), 40)
  // Non-vacuity: the same $200 paid as an affiliate commission earns 28.
  assert.equal(affiliateScore(fixture({ kind: "affiliate" }, giftCard)), 68)

  const referrals = programs.filter((p) => p.kind === "referral")
  // Non-vacuity: some registry referrals store a dollar figure that would count as cash.
  assert.ok(referrals.some((p) => affiliateScore({ ...p, kind: "affiliate" }) > affiliateScore(p)))
  for (const p of referrals) {
    assert.equal(affiliateScore(p), affiliateScore(withoutCommission(p)), p.slug)
    assert.equal(listScore(p), 0, p.slug)
  }
})

test("a flat amount in another currency, or in none, is not read as US dollars", () => {
  for (const currency of ["AUD", "EUR", "GBP", "", undefined as unknown as string]) {
    for (const [value, rate] of [[100, "$100"], [500, "€500"]] as const) {
      assert.equal(affiliateScore(fixture({}, { mode: "flat", value, currency, rate })), 40, `${value} ${currency} ${rate}`)
    }
  }
  // Non-vacuity: in explicit US dollars the same amounts earn 28 and 40.
  assert.equal(affiliateScore(fixture({}, { mode: "flat", value: 100, currency: "USD", rate: "$100" })), 68)
  assert.equal(affiliateScore(fixture({}, { mode: "flat", value: 500, currency: "USD", rate: "€500" })), 80)
  // A percentage carries no currency: 25% earns 20 whatever the field says.
  assert.equal(affiliateScore(fixture({}, { mode: "percentage", value: 25, currency: "EUR", rate: "25%" })), 60)
})

test("an unverified program's stored cookie window adds nothing", () => {
  const unverified = fixture({ verified: false, cookieDays: 90 })
  // 0 commission, 0 cookie, 5 type, 0 verified, 10 completeness.
  assert.equal(affiliateScore(unverified), 15)
  assert.equal(affiliateScore(unverified), affiliateScore({ ...unverified, cookieDays: undefined }))
  // Non-vacuity: verified, the same 90 days are worth 15.
  const verified = fixture({ cookieDays: 90 })
  assert.equal(affiliateScore(verified) - affiliateScore({ ...verified, cookieDays: undefined }), 15)

  const stored = programs.filter((p) => !p.verified && (p.cookieDays ?? 0) > 0)
  assert.ok(stored.length > 0, "no unverified program stores a cookie window to check")
  for (const p of stored) assert.equal(affiliateScore(p), affiliateScore({ ...p, cookieDays: undefined }), p.slug)
})

/** Rate and conditions text a parser would read as very different money. */
const REWORDINGS: (string | number)[] = [
  "varies",
  "$99,999 per sale",
  "500%",
  "$100-$200 Amazon gift card per referral",
  "€50",
  "$5 per lead + 30%",
  "",
  30,
]

test("the score is computed from structured fields only: rewording the rate text never moves it", () => {
  assert.ok(programs.some((p) => p.verified), "no verified program to check")
  // Every verified program, and every other one too: the rule is the same.
  for (const p of programs) {
    const want = affiliateScore(p)
    for (const rate of REWORDINGS) {
      const text = String(rate)
      const reworded: Program = {
        ...p,
        commission: { ...p.commission, rate, conditions: text },
        commissionConditions: text,
      }
      assert.equal(affiliateScore(reworded), want, `${p.slug} with rate ${JSON.stringify(rate)}`)
    }
  }
})

test("lists and the Affiliate Score count the same commissions", () => {
  let counted = 0
  for (const p of programs) {
    const inScore = affiliateScore(p) > affiliateScore(withoutCommission(p))
    assert.equal(inScore, listScore(p) > 0, p.slug)
    if (inScore) counted++
  }
  // Non-vacuity: both outcomes occur in the registry.
  assert.ok(counted > 0 && counted < programs.length)
})
