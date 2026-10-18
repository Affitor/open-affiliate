/**
 * The /rankings Recurring and Payout min columns (and rankings.md): every
 * duration the registry stores reads as a length or says it is not published.
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { payoutMinText, recurringMonths, recurringText } from "../src/lib/rankings-terms"

const months = (type: string, duration: string | null) => recurringMonths({ type, duration })

test("durations as the registry writes them", () => {
  assert.equal(months("recurring", "12 months"), 12)
  assert.equal(months("recurring", "lifetime"), Infinity)
  assert.equal(months("tiered", "Lifetime"), Infinity)
  assert.equal(months("recurring", "2 years"), 24)
  assert.equal(months("recurring", "up to 2 years"), 24)
  assert.equal(months("recurring", "365 days"), 12)
  assert.equal(months("recurring", "12 calendar months from the first payment"), 12)
  assert.equal(months("recurring", "first subscription year"), 12)
  assert.equal(months("recurring", "3 years (year 4+ 0% for collaborators)"), 36)
})

test("one-time, unknown length, and tiered without a length", () => {
  assert.equal(months("one-time", "12 months"), 0)
  assert.equal(months("recurring", null), null)
  assert.equal(months("tiered", null), undefined)
  assert.equal(months("hybrid", null), undefined)
})

test("text", () => {
  assert.deepEqual([0, 1, 12, 24, 30, Infinity, null, undefined].map(recurringText), ["No", "1 month", "12 months", "2 years", "30 months", "Lifetime", "Length not published", "—"])
})

test("payout minimum", () => {
  assert.equal(payoutMinText(undefined, "USD"), null)
  assert.equal(payoutMinText(0, undefined), "None")
  assert.equal(payoutMinText(50, "USD"), "$50")
  assert.equal(payoutMinText(1000, undefined), "$1,000")
  assert.equal(payoutMinText(50, "EUR"), "50 EUR")
})
