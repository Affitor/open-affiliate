/**
 * The /rankings Recurring and Payout min columns (and rankings.md): every
 * duration the registry stores reads as a length or says it is not published.
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { commissionGroup, compareCommissionFigure, payoutMinText, recurringMonths, recurringText } from "../src/lib/rankings-terms"

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

const c = (mode: string, value: number | null, extra: Record<string, unknown> = {}) => ({ mode, value, rate: "", ...extra })

test("a percentage and a dollar amount never share a list", () => {
  assert.equal(commissionGroup(c("percentage", 100)), "percent")
  assert.equal(commissionGroup(c("flat", 5000, { currency: "USD" })), "flat")
  assert.equal(commissionGroup(c("flat", 50, { currency: undefined })), "flat")
  assert.equal(commissionGroup(c("flat", 50, { currency: "EUR" })), "other")
  assert.equal(commissionGroup(c("flat", 10, { currency: "USD", rate: "$10 in Airtable credits" })), "other")
  assert.equal(commissionGroup(c("tiered", 500)), "other")
  assert.equal(commissionGroup(c("hybrid", 30)), "other")
  assert.equal(commissionGroup(c("percentage", null)), "other")
})

test("same figure: the commission that recurs longer comes first, in both directions", () => {
  const p = (name: string, value: number, type: string, duration: string | null) => ({ name, slug: name, commission: { type, value, duration } })
  const list = [p("A", 30, "one-time", null), p("B", 30, "recurring", "12 months"), p("C", 30, "recurring", "lifetime"), p("D", 30, "recurring", null), p("E", 50, "one-time", null)]
  assert.deepEqual([...list].sort((a, b) => compareCommissionFigure(a, b, -1)).map((x) => x.name), ["E", "C", "B", "D", "A"])
  assert.deepEqual([...list].sort((a, b) => compareCommissionFigure(a, b, 1)).map((x) => x.name), ["C", "B", "D", "A", "E"])
})
