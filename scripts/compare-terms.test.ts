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
  // The payload text is exempt only as the visible text of the verified row the HTML serves.
  assert.ok(states(termsHtmlProblems(page, base + rowFlight(verifiedOther.slug, d), [verifiedOther]), d), "RSC row without its HTML row: checked")
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

test("outlined cells: a row whose cells React streamed as separate Flight rows (pombo on #353)", () => {
  const d = DURATION
  // The row holds lazy references; its cells are their own "id:[…]" lines.
  const outlined = (slug: string, cell = "3d") =>
    push(`7:["$","tr","${slug}",{"children":["$L3c","$L${cell}"]}]\n3c:["$","td",null,{"children":"30% recurring"}]\n3d:["$","td",null,{"children":"${d}"}]\n`)
  assert.ok(states(termsHtmlProblems(page, base + outlined(verifiedOther.slug)), d), "no compared list: flagged")
  assert.deepEqual(termsHtmlProblems(page, base + table(verifiedOther, d) + outlined(verifiedOther.slug), [verifiedOther]), [], "verified row with outlined cells")
  assert.ok(states(termsHtmlProblems(page, base + outlined(verifiedOther.slug), [verifiedOther]), d), "outlined cells without the HTML row: checked")
  assert.ok(states(termsHtmlProblems(page, base + outlined(unverifiedOther.slug), [unverifiedOther]), d), "unverified row with outlined cells: flagged")
  // A line the page's own content also references stays, and is checked.
  const shared = base + outlined(verifiedOther.slug) + push(`9:["$","p",null,{"children":"$3d"}]\n`)
  assert.ok(states(termsHtmlProblems(page, shared, [verifiedOther]), d), "outlined line also used by the page: flagged")
  // References are followed: a cell outlined inside an outlined cell goes too, when only the row reaches it.
  const nested = push(`7:["$","tr","${verifiedOther.slug}",{"children":["$L3e"]}]\n3e:["$","td",null,{"children":"$L3f"}]\n3f:["$","span",null,{"children":"${d}"}]\n`)
  assert.deepEqual(termsHtmlProblems(page, base + table(verifiedOther, d) + nested, [verifiedOther]), [], "nested outlined cells")
  // Every reference form keeps a line: a Map ($Q), a Set ($W) or a path ($3d:props) from the page's own content.
  for (const ref of ["$Q3d", "$W3d", "$3d:props:children", "$@3d"]) {
    const used = base + outlined(verifiedOther.slug) + push(`9:["$","p",null,{"children":"${ref}"}]\n`)
    assert.ok(states(termsHtmlProblems(page, used, [verifiedOther]), d), `outlined line also reached via ${ref}: flagged`)
  }
  // Order does not matter: cut row → [a, b], a → b, b holds the duration; both go, in either order.
  for (const order of [["$La1", "$Lb1"], ["$Lb1", "$La1"]]) {
    const chain = push(`7:["$","tr","${verifiedOther.slug}",{"children":${JSON.stringify(order)}}]\na1:["$","td",null,{"children":"$Lb1"}]\nb1:["$","td",null,{"children":"${d}"}]\n`)
    assert.deepEqual(termsHtmlProblems(page, base + table(verifiedOther, d) + chain, [verifiedOther]), [], `chain ${order.join(",")}`)
  }
  // An id whose tag is also a hex digit ("$ab") is read both ways, so line "ab" is kept when the page uses it.
  const hexTag = base + push(`7:["$","tr","${verifiedOther.slug}",{"children":["$Lab"]}]\nab:["$","td",null,{"children":"${d}"}]\n9:["$","p",null,{"children":"$ab"}]\n`)
  assert.ok(states(termsHtmlProblems(page, hexTag, [verifiedOther]), d), "plain $ab keeps line ab")
  // Ambiguity never widens removal: "$a0" (row a0, or tag a + row 0) must not take the page root with it.
  const root = base + push(`0:["$","div",null,{"children":[["$","p",null,{"children":"Cookie lasts 60 days."}],["$","tr","${verifiedOther.slug}",{"children":"$a0"}]]}]\na0:["$","td",null,{"children":"${d}"}]\n`)
  assert.ok(termsHtmlProblems(page, root, [verifiedOther]).some((x) => x.includes("Cookie lasts 60 days")), "the root's own paragraph is still checked")
  // A streamed row spans several lines with one id: a reference on any of them keeps its target.
  const stream = base + push(`0:["$","p",null,{"children":"$9"}]\n7:["$","tr","${verifiedOther.slug}",{"children":"$L3d"}]\n3d:["$","span",null,{"children":"Cookie lasts 60 days."}]\n9:R\n9:"$3d"\n9:C\n`)
  assert.ok(termsHtmlProblems(page, stream, [verifiedOther]).some((x) => x.includes("Cookie lasts 60 days")), "a reference on an earlier line of the same row keeps its target")
  // Pushes join exactly as the browser joins them: a reference split across two pushes keeps its target.
  const rows = `7:["$","tr","${verifiedOther.slug}",{"children":"$L3d"}]\n3d:["$","span",null,{"children":"Cookie lasts 60 days."}]\n0:["$","p",null,{"children":"$3d"}]\n`
  const at = rows.indexOf('"$3d"') + 2
  const split = base + push(rows.slice(0, at)) + push(rows.slice(at))
  assert.ok(termsHtmlProblems(page, split, [verifiedOther]).some((x) => x.includes("Cookie lasts 60 days")), "reference split across pushes")
  // A text row ("id:T<hex byte length>,…") is read by length, newlines included, and its text is checked.
  const text = "Hello\nCookie lasts 60 days."
  const textRow = base + push(`0:["$","p",null,{"children":"$3d"}]\n3d:T${Buffer.byteLength(text).toString(16)},${text}`)
  assert.ok(termsHtmlProblems(page, textRow, [verifiedOther]).some((x) => x.includes("Cookie lasts 60 days")), "text row content")
  // A verified row's outlined text cell goes with the row.
  const ownText = base + push(`7:["$","tr","${verifiedOther.slug}",{"children":"$L3d"}]\n3d:T${Buffer.byteLength(d).toString(16)},${d}0:["$","p",null,{"children":"ok"}]\n`)
  assert.deepEqual(termsHtmlProblems(page, ownText + table(verifiedOther, d), [verifiedOther]), [], "verified row's text cell removed; the next row right after it still parsed")
})

test("whatever the reference parsing misses, only the verified row's own visible text can be left out", () => {
  const d = DURATION
  const row = table(verifiedOther, d)
  const shared = (ref: string) => base + row + push(`7:["$","tr","${verifiedOther.slug}",{"children":"$L3d"}]\n3d:["$","span",null,{"children":"Cookie lasts 60 days."}]\n0:["$","p",null,{"children":${ref}}]\n`)
  for (const ref of ['"$03d"', '"$3D"', '"\\u00243d"', '"$\\u0033d"']) {
    assert.ok(termsHtmlProblems(page, shared(ref), [verifiedOther]).some((x) => x.includes("Cookie lasts 60 days")), `page text reached via ${ref}`)
  }
  // Parse failures make the check stricter: a cut-off text row or JSON row is checked whole.
  assert.ok(termsHtmlProblems(page, base + push("3d:Tff,Cookie lasts 60 days.")).some((x) => x.includes("Cookie lasts 60 days")), "truncated text row")
  assert.ok(termsHtmlProblems(page, base + push('3d:{"children":"Cookie lasts 60 days.')).some((x) => x.includes("Cookie lasts 60 days")), "truncated JSON row")
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
