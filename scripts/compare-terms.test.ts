/** The page terms check and the comparison table: another verified program's term is not this page stating one. */
import assert from "node:assert/strict"
import { test } from "node:test"
import { programs, type Program } from "../src/lib/programs"
import { termsConfirmed, UNCONFIRMED_NOTE } from "../src/lib/confirmed-terms"
import { lastsCell } from "../src/components/related-programs"
import { termsHtmlProblems } from "./unconfirmed-checks"

const base = `<p>${UNCONFIRMED_NOTE}</p>`
const table = (other: Program, cell: string) =>
  `<table data-compare><tbody><tr><th><a href="/programs/${other.slug}">${other.name}</a></th><td>30% recurring</td><td>${cell}</td></tr></tbody></table>`
const flight = (cell: string) => `<script>self.__next_f.push([1,${JSON.stringify(JSON.stringify(["td", null, { children: cell }]))}])</script>`
const states = (problems: string[], text: string) => problems.some((x) => x.includes(text))

// Fixtures from one registry program, so the test needs no particular registry data:
// an unverified page with no duration of its own, and two recurring programs (one verified,
// one not) whose duration names a term, like EmailOctopus's on hoppy-copy (PR #353).
const DURATION = "365 days from paid conversion"
const template = programs[0]
const page: Program = { ...template, slug: "page-under-test", name: "Page", verified: false, commission: { ...template.commission, type: "one-time", duration: null } }
const other = (slug: string, verified: boolean): Program =>
  ({ ...template, slug, name: slug, verified, commission: { ...template.commission, type: "recurring", duration: DURATION } })
const verifiedOther = other("verified-other", true)
const unverifiedOther = other("unverified-other", false)

test("fixtures: the duration names a term, and the page is unverified", () => {
  assert.ok(!termsConfirmed(page) && termsConfirmed(verifiedOther) && !termsConfirmed(unverifiedOther))
  assert.ok(states(termsHtmlProblems(page, base + table(verifiedOther, DURATION)), DURATION), "the check flags this duration when nothing exempts it")
})

test("an unverified page may show a verified program's duration in its comparison table", () => {
  const d = verifiedOther.commission.duration!
  assert.deepEqual(termsHtmlProblems(page, base, [verifiedOther]), [], "baseline")
  assert.deepEqual(termsHtmlProblems(page, base + table(verifiedOther, d), [verifiedOther]), [], "prose")
  assert.deepEqual(termsHtmlProblems(page, base + flight(d), [verifiedOther]), [], "RSC payload")
})

test("the exemption is narrow: no compared list, an unverified program, or the page's own duration still fail", () => {
  const d = verifiedOther.commission.duration!
  // Without the compared programs the check stays conservative (the hoppy-copy failure).
  assert.ok(states(termsHtmlProblems(page, base + table(verifiedOther, d)), d), "no compared list: prose still flagged")
  assert.ok(states(termsHtmlProblems(page, base + flight(d)), d), "no compared list: RSC payload still flagged")
  // An unverified program's duration is never exempt.
  const u = unverifiedOther.commission.duration!
  assert.ok(states(termsHtmlProblems(page, base + table(unverifiedOther, u), [unverifiedOther]), u), "unverified other: prose flagged")
  assert.ok(states(termsHtmlProblems(page, base + flight(u), [unverifiedOther]), u), "unverified other: RSC payload flagged")
  // The page's own duration is never exempt, even when a verified program shows the same words.
  const own: Program = { ...page, commission: { ...page.commission, type: "recurring", duration: d } }
  assert.ok(states(termsHtmlProblems(own, base + table(verifiedOther, d), [verifiedOther]), d), "own duration: prose flagged")
  assert.ok(states(termsHtmlProblems(own, base + flight(d), [verifiedOther]), d), "own duration: RSC payload flagged")
})

test("the exemption does not hide the page's other terms", () => {
  const d = verifiedOther.commission.duration!
  const leak = `<p>Cookie lasts 60 days and payouts are monthly.</p>`
  assert.ok(termsHtmlProblems(page, base + table(verifiedOther, d) + leak, [verifiedOther]).length > 0)
})

test("the comparison table shows a duration only for a verified program", () => {
  assert.equal(lastsCell(unverifiedOther), "—")
  assert.equal(lastsCell(verifiedOther), verifiedOther.commission.duration)
})
