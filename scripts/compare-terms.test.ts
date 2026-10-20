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
const push = (chunk: string) => `<script>self.__next_f.push([1,${JSON.stringify(chunk)}])</script>`
/** The RSC form of a comparison row: ProgramCompare keys each row by slug. */
const rowFlight = (slug: string, cell: string) => push(`7:${JSON.stringify(["$", "tr", slug, { children: [["$", "td", null, { children: "30% recurring" }], ["$", "td", null, { children: cell }]] }])}\n`)
const flight = (cell: string) => push(JSON.stringify(["td", null, { children: cell }]))
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
  assert.deepEqual(termsHtmlProblems(page, base + rowFlight(verifiedOther.slug, d), [verifiedOther]), [], "RSC payload row")
  assert.deepEqual(termsHtmlProblems(page, base + table(verifiedOther, d) + rowFlight(verifiedOther.slug, d), [verifiedOther]), [], "both, as served")
})

test("the exemption is narrow: no compared list, an unverified program, or the page's own duration still fail", () => {
  const d = verifiedOther.commission.duration!
  // Without the compared programs the check stays conservative (the hoppy-copy failure).
  assert.ok(states(termsHtmlProblems(page, base + table(verifiedOther, d)), d), "no compared list: prose still flagged")
  assert.ok(states(termsHtmlProblems(page, base + flight(d)), d), "no compared list: RSC payload still flagged")
  // An unverified program's duration is never exempt.
  const u = unverifiedOther.commission.duration!
  assert.ok(states(termsHtmlProblems(page, base + table(unverifiedOther, u), [unverifiedOther]), u), "unverified other: prose flagged")
  assert.ok(states(termsHtmlProblems(page, base + rowFlight(unverifiedOther.slug, u), [unverifiedOther]), u), "unverified other: RSC payload flagged")
  // A page whose own duration has the same words: the verified program's row stays exempt (it is that
  // program's term), but the page stating the words itself, in prose or its RSC payload, still fails.
  const own: Program = { ...page, commission: { ...page.commission, type: "recurring", duration: d } }
  const legit = base + table(verifiedOther, d) + rowFlight(verifiedOther.slug, d)
  assert.deepEqual(termsHtmlProblems(own, legit, [verifiedOther]), [], "own duration: the other program's row alone")
  assert.ok(states(termsHtmlProblems(own, legit + `<p>Commission lasts ${d}.</p>`, [verifiedOther]), d), "own duration: own prose flagged")
  assert.ok(states(termsHtmlProblems(own, legit + flight(d), [verifiedOther]), d), "own duration: own RSC payload flagged")
})

test("only the verified rows are exempt: the same words anywhere else on the page still fail", () => {
  const d = DURATION
  const legit = base + table(verifiedOther, d) + rowFlight(verifiedOther.slug, d)
  const withCompared = (extra: string) => termsHtmlProblems(page, legit + extra, [verifiedOther])
  assert.ok(states(withCompared(`<h2>Page</h2><p>${d}</p>`), d), "own prose outside the table")
  assert.ok(states(withCompared(push(`8:${JSON.stringify({ description: d })}\n`)), d), "own RSC props")
  assert.ok(states(withCompared(flight(d)), d), "an RSC cell not inside a verified program's row")
  assert.ok(states(withCompared(rowFlight("someone-else", d)), d), "a row keyed by a program not in the compared list")
  // A row cut off mid-payload is not removed, so the check stays strict.
  assert.ok(states(termsHtmlProblems(page, base + push(`7:["$","tr","${verifiedOther.slug}",{"children":"${d}"`), [verifiedOther]), d), "unterminated row")
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
