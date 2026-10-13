/**
 * Network and category commission figures (commissionStats, behind the
 * /rankings networks and categories tabs, the category index, the network
 * pages, rankings.md and the SIFT category table) come from structured fields
 * only, and never put a percentage and a dollar amount on one scale. Each
 * fixture check sits next to a case where the excluded input does count, so a
 * check cannot pass because the component never counted anything.
 *
 * Also runs over every network and category in src/lib/registry.json, so run
 * it after build-registry (CI runs it after `npm run build`).
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import {
  IN_HOUSE,
  commissionStats,
  getCategoryStats,
  getNetworkStats,
  livePrograms,
  type CommissionStats,
  type Program,
} from "../src/lib/programs"

function program(name: string, commission: Partial<Program["commission"]>, over: Partial<Omit<Program, "commission">> = {}): Program {
  return {
    slug: name.toLowerCase(),
    name,
    url: "https://example.com",
    logo: name[0],
    category: "SaaS",
    commission: { type: "one-time", rate: "", mode: "unknown", value: null, currency: "USD", duration: null, ...commission },
    payout: {},
    description: "",
    shortDescription: "",
    tags: [],
    stars: 0,
    verified: false,
    agentPrompt: "",
    submittedBy: "test",
    createdAt: "2026-10-13",
    kind: "affiliate",
    ...over,
  }
}

/** The figures with programs reduced to their slugs, for comparison. */
function shape(s: CommissionStats) {
  const paid = (x: CommissionStats["topRate"]) => (x ? `${x.value} ${x.program.slug}` : null)
  return { avgRate: s.avgRate, topRate: paid(s.topRate), topFlatUsd: paid(s.topFlatUsd) }
}

const EXCLUDED = [
  program("Gift", { mode: "flat", value: 200, currency: "USD", rate: "$100-$200 Amazon gift card per referral" }, { kind: "referral" }),
  program("Credits", { mode: "percentage", value: 90, rate: "90% in credits" }, { kind: "referral" }),
  program("Shopify", { mode: "tiered", value: 150, currency: "USD", rate: "up to $150" }),
  program("Mixed", { mode: "hybrid", value: 80, rate: "$5 per lead + 80%" }),
  program("Euro", { mode: "flat", value: 900, currency: "EUR", rate: "€900" }),
  program("Unpublished", { mode: "unknown", value: null, rate: "varies" }),
]

test("referral, tiered, hybrid, non-USD and unpublished commissions count on neither side", () => {
  assert.deepEqual(shape(commissionStats(EXCLUDED)), { avgRate: null, topRate: null, topFlatUsd: null })
  // Non-vacuity: a single rate and a flat USD payout in the same group do count.
  const counted = commissionStats([
    ...EXCLUDED,
    program("Rate", { mode: "percentage", value: 30, rate: "30%" }),
    program("Flat", { mode: "flat", value: 150, currency: "USD", rate: "$150" }),
  ])
  assert.deepEqual(shape(counted), { avgRate: 30, topRate: "30 rate", topFlatUsd: "150 flat" })
})

test("rates and flat payouts are kept apart: the average is of rates only, and $10k beats $1k", () => {
  const s = commissionStats([
    program("Low", { mode: "percentage", value: 20 }),
    program("High", { mode: "percentage", value: 40 }),
    program("Thousand", { mode: "flat", value: 1000, currency: "USD" }),
    program("TenThousand", { mode: "flat", value: 10000, currency: "USD" }),
    program("Unpublished", { mode: "unknown", value: null }),
  ])
  // Neither the dollar amounts nor the unpublished rate move the average.
  assert.deepEqual(shape(s), { avgRate: 30, topRate: "40 high", topFlatUsd: "10000 tenthousand" })
})

test("a tie goes to the verified program, in either order", () => {
  const unverified = program("Unverified", { mode: "percentage", value: 50 })
  const verified = program("Verified", { mode: "percentage", value: 50 }, { verified: true })
  assert.equal(commissionStats([unverified, verified]).topRate?.program.slug, "verified")
  assert.equal(commissionStats([verified, unverified]).topRate?.program.slug, "verified")
  // Non-vacuity: with neither verified, the earlier one wins.
  assert.equal(commissionStats([unverified, { ...verified, verified: false }]).topRate?.program.slug, "unverified")
})

/** Rate and conditions text a parser would read as very different money. */
const REWORDINGS = ["varies", "$99,999 per sale", "500%", "up to $150", "€50", "$5 per lead + 30%", ""]

const networkGroups = getNetworkStats().map((n) => ({
  label: `network ${n.network}`,
  stats: n,
  members: livePrograms.filter((p) => (p.network ?? IN_HOUSE) === n.network),
}))
const categoryGroups = getCategoryStats().map((c) => ({
  label: `category ${c.category}`,
  stats: c,
  members: livePrograms.filter((p) => p.category === c.category),
}))

test("every network and category figure in the registry ignores the rate text", () => {
  assert.ok(networkGroups.length > 0 && categoryGroups.length > 0)
  for (const { label, stats, members } of [...networkGroups, ...categoryGroups]) {
    const want = shape(stats)
    for (const rate of REWORDINGS) {
      const reworded = members.map((p) => ({ ...p, commission: { ...p.commission, rate, conditions: rate } }))
      assert.deepEqual(shape(commissionStats(reworded)), want, `${label} with rate ${JSON.stringify(rate)}`)
    }
  }
})

test("every top rate in the registry is a single percentage, and every top flat payout is in US dollars", () => {
  let excludedAboveTop = 0
  for (const { label, stats, members } of [...networkGroups, ...categoryGroups]) {
    if (stats.topRate) {
      const c = stats.topRate.program
      assert.ok(c.commission.mode === "percentage" && c.kind !== "referral", `${label}: ${c.slug}`)
    }
    if (stats.topFlatUsd) {
      const c = stats.topFlatUsd.program
      assert.ok(c.commission.mode === "flat" && c.commission.currency === "USD" && c.kind !== "referral", `${label}: ${c.slug}`)
    }
    // Non-vacuity: groups where a figure that does not count is larger than the top rate.
    const top = stats.topRate?.value ?? 0
    if (members.some((p) => (p.commission.value ?? 0) > top && p.commission.mode !== "flat")) excludedAboveTop++
  }
  assert.ok(excludedAboveTop > 0, "no group holds an excluded figure above its top rate")
})
