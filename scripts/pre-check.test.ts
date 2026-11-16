/**
 * pre-check decides NEW vs SKIP from the registry index. A brand whose name is
 * also an Object.prototype key (constructor, __proto__, toString) must read as
 * new, while a real duplicate is still skipped.
 *
 * Run with `npx tsx --test scripts/pre-check.test.ts`.
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { decide, toLookup, type RegistryIndex } from "./pre-check"

// Parsed from JSON, as pre-check reads src/lib/registry-index.json.
const fresh = new Date().toISOString()
const index = toLookup(
  JSON.parse(
    JSON.stringify({
      generated_at: fresh,
      count: 1,
      by_slug: ["stripe"],
      by_domain: { "stripe.com": "stripe" },
      by_alias: { "stripe payments": "stripe" },
      source_lastsync: {},
      last_verified: { stripe: fresh },
    } satisfies RegistryIndex),
  ) as RegistryIndex,
)

test("brands named like Object.prototype keys are NEW", () => {
  for (const candidate of [
    "constructor.com",
    "toString.io",
    "__proto__.dev",
    "constructor",
    "__proto__",
    "hasOwnProperty",
    "valueOf",
  ]) {
    const d = decide(candidate, index)
    assert.equal(d.tier, "NEW", `${candidate}: ${d.reason}`)
    assert.equal(d.matched_slug, null, candidate)
  }
})

test("a real duplicate is still SKIP", () => {
  for (const [candidate, type] of [
    ["https://www.stripe.com/partners", "domain"],
    ["stripe", "slug"],
    ["Stripe Payments", "alias"],
  ] as const) {
    const d = decide(candidate, index)
    assert.equal(d.tier, "SKIP", `${candidate}: ${d.reason}`)
    assert.equal(d.matched_slug, "stripe", candidate)
    assert.equal(d.match_type, type, candidate)
  }
})

test("an alias named __proto__ survives JSON and still matches", () => {
  const raw = '{"by_slug":["proto-co"],"by_domain":{},"by_alias":{"__proto__":"proto-co"},"source_lastsync":{},"last_verified":{"proto-co":null}}'
  const d = decide("__proto__", toLookup(JSON.parse(raw) as RegistryIndex))
  assert.equal(d.matched_slug, "proto-co")
  assert.equal(d.match_type, "alias")
})
