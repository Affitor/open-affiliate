/**
 * A payout minimum is written in the program's own payout currency on every
 * surface that prints it: "$50" for US dollars, "50 EUR" for anything else, "no
 * minimum" for zero, and dollars when no currency is stored (the schema default).
 * /programs/kalyvox once read "Net 30, from a $50 minimum" for terms of 50 EUR.
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { minimumAmount, payoutMinText } from "../src/lib/rankings-terms"
import { payoutText as pagePayout } from "../src/lib/program-page"
import { buildFaq, seoDescription } from "../src/lib/program-seo"
import { payoutText as postPayout } from "../src/lib/best-posts"
import { payoutText as cliPayout } from "../packages/cli/src/format"
import { getProgram, programs, termsConfirmed, type Program } from "../src/lib/programs"

const base = getProgram("kalyvox")!
const withPayout = (payout: Program["payout"]): Program => ({ ...base, payout })

const EUR = withPayout({ minimum: 50, currency: "EUR", frequency: "net-30" })
const USD = withPayout({ minimum: 50, currency: "USD", frequency: "monthly" })
const ZERO = withPayout({ minimum: 0, currency: "EUR", frequency: "monthly" })
const NO_CURRENCY = withPayout({ minimum: 50, frequency: "monthly" })

test("the amount: dollars for USD or no currency, the code after the figure otherwise", () => {
  assert.equal(minimumAmount(50, "EUR"), "50 EUR")
  assert.equal(minimumAmount(50, "USD"), "$50")
  assert.equal(minimumAmount(50, undefined), "$50")
  assert.equal(minimumAmount(50, null), "$50")
  assert.equal(minimumAmount(1000, "AUD"), "1,000 AUD")
  assert.equal(payoutMinText(0, "EUR"), "None")
})

test("program page payout row and 'You get paid' step", () => {
  assert.equal(pagePayout(EUR), "Net 30, from a 50 EUR minimum")
  assert.equal(pagePayout(USD), "Monthly, from a $50 minimum")
  assert.equal(pagePayout(ZERO), "Monthly, no minimum")
  assert.equal(pagePayout(NO_CURRENCY), "Monthly, from a $50 minimum")
  assert.equal(pagePayout(withPayout({ minimum: 40, currency: "EUR" })), "From a 40 EUR minimum")
})

test("meta description and FAQ answer", () => {
  assert.ok(seoDescription(EUR).includes("50 EUR minimum payout"), seoDescription(EUR))
  assert.ok(!seoDescription(EUR).includes("$50"))
  assert.ok(seoDescription(NO_CURRENCY).includes("$50 minimum payout"))
  const paid = (p: Program) => buildFaq(p).find((f) => f.q.startsWith("When do"))?.a ?? ""
  assert.ok(paid(EUR).includes("once you reach the 50 EUR minimum"), paid(EUR))
  assert.ok(paid(USD).includes("once you reach the $50 minimum"), paid(USD))
  assert.ok(!paid(ZERO).includes("minimum"), paid(ZERO))
})

test("best-list and guide program blocks", () => {
  assert.equal(postPayout(EUR), "Net 30, 50 EUR minimum")
  assert.equal(postPayout(USD), "Monthly, $50 minimum")
  assert.equal(postPayout(ZERO), "Monthly, no minimum")
  assert.equal(postPayout(NO_CURRENCY), "Monthly, $50 minimum")
})

test("CLI info line", () => {
  assert.equal(cliPayout({ verified: true, payout: { minimum: 50, currency: "EUR", frequency: "net-30" } }), "50 EUR min / net-30")
  assert.equal(cliPayout({ verified: true, payout: { minimum: 50, currency: "USD", frequency: "monthly" } }), "$50 min / monthly")
  assert.equal(cliPayout({ verified: true, payout: { minimum: 0, currency: "USD" } }), "$0 min")
  assert.equal(cliPayout({ verified: true, payout: { minimum: 50 } }), "$50 min")
})

test("no verified program in another currency shows a dollar minimum", () => {
  const foreign = programs.filter((p) => termsConfirmed(p) && p.payout.minimum && p.payout.currency && p.payout.currency !== "USD")
  assert.ok(foreign.length >= 3, `expected verified non-USD minimums, found ${foreign.length}`)
  for (const p of foreign) {
    const want = `${p.payout.minimum!.toLocaleString("en-US")} ${p.payout.currency}`
    assert.ok(pagePayout(p)?.includes(want), `${p.slug}: ${pagePayout(p)}`)
    assert.ok(!pagePayout(p)?.includes("$"), `${p.slug}: ${pagePayout(p)}`)
    assert.ok(postPayout(p).includes(want), `${p.slug}: ${postPayout(p)}`)
  }
})
