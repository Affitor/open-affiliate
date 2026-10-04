import assert from "node:assert/strict"
import { test } from "node:test"
import { applyEarnLabel, ctaWordCount } from "../src/lib/apply-cta"
import type { Program } from "../src/lib/programs"

function commission(partial: Partial<Program["commission"]>): Program["commission"] {
  return {
    type: "recurring",
    rate: "20%",
    mode: "percentage",
    value: 20,
    currency: "USD",
    ...partial,
  }
}

test("percentage uses the signed wording and stays within 4 words", () => {
  const label = applyEarnLabel(commission({ mode: "percentage", value: 20, rate: "20%" }))
  assert.equal(label, "Apply & earn 20%")
  assert.ok(ctaWordCount(label) <= 4)
  assert.equal(label.includes("—") || label.includes("–"), false)
})

test("flat fee does not grow a percent sign", () => {
  const label = applyEarnLabel(commission({ mode: "flat", type: "one-time", value: 36, rate: "$36" }))
  assert.equal(label, "Apply & earn $36")
  assert.ok(ctaWordCount(label) <= 4)
})

test("unknown and long rates stay short", () => {
  assert.equal(applyEarnLabel(commission({ mode: "unknown", value: null, rate: "varies" })), "Apply & earn")
  const long = applyEarnLabel(
    commission({ mode: "hybrid", value: null, rate: "$5 per lead + 30%" }),
  )
  assert.equal(long, "Apply & earn")
  assert.ok(ctaWordCount(long) <= 4)
})
