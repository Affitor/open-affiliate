import assert from "node:assert/strict"
import { test } from "node:test"
import { affiliateScore, getProgram, programs } from "../src/lib/programs"
import { affiliateScore as clientScore, getProgram as getClientProgram, programs as clientPrograms } from "../src/lib/client-programs"
import { averagePublishedCookie, cookieScore, cookieWindowDisplay, minimumPayoutDisplay, publishedText } from "../src/lib/program-fields"

test("missing published terms never become zero-day cookies or free payouts", () => {
  for (const value of [undefined, null, NaN, Infinity, -1]) {
    assert.equal(cookieWindowDisplay(value), "Not published")
    assert.equal(minimumPayoutDisplay(value), "Not published")
    assert.equal(cookieScore(value), 0)
  }
  assert.equal(publishedText(undefined), "Not published")
  assert.equal(publishedText(null), "Not published")
  assert.equal(publishedText("  "), "Not published")
})

test("explicit published zeros and positive terms stay distinguishable", () => {
  assert.equal(cookieWindowDisplay(0), "0 days")
  assert.equal(cookieWindowDisplay(30, "d cookie"), "30d cookie")
  assert.equal(minimumPayoutDisplay(0), "$0")
  assert.equal(minimumPayoutDisplay(50), "$50")
  assert.equal(publishedText("monthly"), "monthly")
  assert.equal(cookieScore(90), 15)
  assert.equal(cookieScore(180), 15)
})

test("cookie averages use only published windows, including published zero", () => {
  assert.equal(averagePublishedCookie([undefined, null, NaN, Infinity, -1]), undefined)
  assert.equal(averagePublishedCookie([undefined, 30, 90]), 60)
  assert.equal(averagePublishedCookie([0, 30, null]), 15)
})

test("Repostit remains a 20% program without inventing cookie or payout terms", () => {
  const program = getProgram("repostit")
  const client = getClientProgram("repostit")
  assert.ok(program)
  assert.ok(client)
  assert.equal(program.commission.value, 20)
  assert.equal(program.cookieDays, undefined)
  assert.equal(program.payout.minimum, undefined)
  assert.equal(program.payout.frequency, undefined)
  assert.equal(cookieWindowDisplay(program.cookieDays), "Not published")
  assert.equal(minimumPayoutDisplay(program.payout.minimum), "Not published")
  assert.equal(affiliateScore(program), 44)
  assert.equal(clientScore(client), 44)
  assert.equal(program.signupUrl, "https://partners.repostit.io/register")
})

test("every registered program has finite server/client scores and category averages", () => {
  for (const program of programs) assert.ok(Number.isFinite(affiliateScore(program)), program.slug)
  for (const program of clientPrograms) assert.ok(Number.isFinite(clientScore(program)), program.slug)
  for (const category of new Set(programs.map((program) => program.category))) {
    const categoryPrograms = programs.filter((program) => program.category === category)
    const average = categoryPrograms.reduce((sum, program) => sum + affiliateScore(program), 0) / categoryPrograms.length
    assert.ok(Number.isFinite(average), category)
  }
})
