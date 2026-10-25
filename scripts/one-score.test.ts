/**
 * One public score: the /programs directory row, the grid card, the homepage
 * and the badge show the OAS the program page shows, or "—" (OAS in progress),
 * never another number. Reads the registry and oas-scores.json that prebuild
 * regenerates, so CI runs it after `npm run build`:
 * `npx tsx --test --test-force-exit scripts/one-score.test.ts`.
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ProgramCardGrid, ProgramRowList } from "../src/components/program-card"
import { getOasScore, oasGrade, oasScores, oasValue, programOas } from "../src/lib/oas"
import { OAS_NONE, OAS_NONE_TITLE, shownOas } from "../src/lib/oas-shown"
import { byOas as clientByOas, getProgram as getClientProgram, programOas as clientOas, programs as clientPrograms, searchPrograms } from "../src/lib/client-programs"
import { byOas, getProgram, livePrograms, searchPrograms as serverSearch } from "../src/lib/programs"
import { GET as badge } from "../src/app/api/badge/[slug]/route"

/** What the program page shows: oasValue over its own score, or null. */
const pageOas = (slug: string) => {
  const s = getOasScore(slug)
  return s ? oasValue(s) : null
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")

/** The OAS cell's text in a rendered row or card: "80 B-" or "—". */
function cellText(html: string): string {
  const m = /title="(OAS|OAS in progress)">(.*?)<\/span>(?:<\/span>)?/.exec(html)
  assert.ok(m, "no OAS cell rendered")
  return text(m[2]).trim()
}

test("waalaxy: the directory row and the card show the program page's 80 B-", () => {
  assert.ok(oasScores.length > 0, "oas-scores.json is empty: run `npx tsx scripts/build-oas.ts` first")
  const p = getClientProgram("waalaxy")!
  assert.equal(pageOas("waalaxy"), 80)
  assert.equal(oasGrade(80), "B-")
  assert.equal(clientOas(p), 80)
  for (const view of [ProgramRowList, ProgramCardGrid]) {
    const html = renderToStaticMarkup(createElement(view, { program: p }))
    assert.equal(cellText(html), "80 B-", view.name)
  }
})

test("a program with no OAS shows — titled OAS in progress, never another number", () => {
  const none = clientPrograms.find((p) => pageOas(p.slug) == null)!
  assert.ok(none, "every program is scored: pick another fixture")
  assert.equal(clientOas(none), null)
  const html = renderToStaticMarkup(createElement(ProgramRowList, { program: none }))
  assert.match(html, new RegExp(`title="${OAS_NONE_TITLE}">${OAS_NONE}</span>`))
  assert.doesNotMatch(cellText(html), /\d/)
})

test("every listed program: the browser's OAS equals the program page's OAS", () => {
  let scored = 0
  for (const p of clientPrograms) {
    const want = pageOas(p.slug)
    assert.equal(clientOas(p), want, p.slug)
    assert.equal(programOas(getProgram(p.slug)!), want, p.slug)
    if (want != null) scored++
  }
  assert.ok(scored > 50, `only ${scored} scored programs: the comparison is near vacuous`)
  // Freshness is read at read time on both sides: past every score's 90 days, nothing shows.
  const later = new Date("2100-01-01T00:00:00Z")
  for (const p of clientPrograms) assert.equal(shownOas(p.oas, later), null, p.slug)
})

test("default order: OAS high to low, unscored after, browser and server agree", () => {
  const client = searchPrograms({}).map((p) => p.slug)
  const server = serverSearch({}).map((p) => p.slug)
  assert.deepEqual(client, server)
  const values = client.map(pageOas)
  const firstNull = values.indexOf(null)
  assert.ok(firstNull > 0, "no scored program comes first")
  assert.ok(values.slice(firstNull).every((v) => v == null), "a scored program after an unscored one")
  const scoredValues = values.slice(0, firstNull) as number[]
  assert.deepEqual(scoredValues, [...scoredValues].sort((a, b) => b - a))
  // The comparators are total orders: no pair is a tie.
  const [a, b] = [livePrograms[0], livePrograms[1]]
  assert.notEqual(byOas(a, b), 0)
  assert.notEqual(clientByOas(getClientProgram(a.slug)!, getClientProgram(b.slug)!), 0)
})

test("badge: OAS and grade, or OAS in progress", async () => {
  const get = async (slug: string, q = "") => {
    const res = await badge(new Request(`https://openaffiliate.dev/api/badge/${slug}${q}`), { params: Promise.resolve({ slug }) })
    return res.text()
  }
  const pill = await get("waalaxy")
  assert.match(pill, /<title>OAS: 80 · B- — openaffiliate\.dev<\/title>/)
  const card = await get("waalaxy", "?style=card")
  assert.match(card, /waalaxy|Waalaxy/)
  assert.match(card, /OAS 80 out of 100, grade B-\./)
  const none = clientPrograms.find((p) => pageOas(p.slug) == null && !p.status)!
  assert.match(await get(none.slug), /<title>OAS: in progress — openaffiliate\.dev<\/title>/)
  assert.match(await get(none.slug, "?style=card"), /OAS in progress\./)
})
