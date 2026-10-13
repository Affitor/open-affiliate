/**
 * The homepage freshness line ("815 programs · 221 verified · last checked
 * 2026-10-13"), also in index.md and llms.txt, states the registry: its
 * numbers are recomputed here from programs/*.yaml, not from the helper.
 *
 * Reads public/index.md and public/llms.txt, so run it after `npm run build`
 * (prebuild writes them). Run with `npx tsx --test scripts/freshness.test.ts`.
 */
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { parse } from "yaml"
import { freshnessLine } from "../src/lib/best-lists"
import { programs } from "../src/lib/programs"
import registry from "../src/lib/registry.json"
import { programMd } from "./generate-md"

const root = join(__dirname, "..")

function fromYaml() {
  const dir = join(root, "programs")
  const rows = readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => parse(readFileSync(join(dir, f), "utf8")) as { status?: string; verified?: boolean; last_verified_at?: unknown })
  const live = rows.filter((r) => (r.status ?? "active") === "active")
  const verified = live.filter((r) => r.verified === true)
  const dates = verified
    .map((r) => r.last_verified_at)
    .filter((d) => d != null && d !== "")
    .map((d) => (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10))
    .sort()
  return { live: live.length, verified: verified.length, checked: dates.at(-1) }
}

test("the line's numbers equal the registry's", () => {
  const y = fromYaml()
  assert.ok(y.live > 0 && y.verified > 0 && y.checked)
  assert.equal(freshnessLine(programs), `${y.live} programs · ${y.verified} verified · last checked ${y.checked}`)
})

test("index.md and llms.txt carry the same line", () => {
  const line = freshnessLine(programs)
  for (const file of ["index.md", "llms.txt"]) {
    assert.ok(readFileSync(join(root, "public", file), "utf8").includes(`${line}.`), `${file} lacks "${line}."`)
  }
})

// Non-vacuity: a later date on an unverified row or a retired verified row
// must not move "last checked", and neither row counts.
test("only live verified rows count, and only their dates", () => {
  const rows: Parameters<typeof freshnessLine>[0] = [
    { status: "active", verified: true, lastVerifiedAt: "2026-10-01" },
    { status: undefined, verified: false, lastVerifiedAt: "2026-10-12" },
    { status: "discontinued", verified: true, lastVerifiedAt: "2026-10-13" },
    { status: "active", verified: false, lastVerifiedAt: null },
  ]
  assert.equal(freshnessLine(rows), "3 programs · 1 verified · last checked 2026-10-01")
  assert.equal(freshnessLine(rows.slice(1)), "2 programs · 0 verified")
})

type Entry = Parameters<typeof programMd>[0]

// An unverified entry can carry last_verified_at (a check that confirmed
// nothing); no surface may print that date as a verification date.
test("an unverified program's .md shows no verification date", () => {
  const base = (registry.programs as Entry[]).find((p) => !p.verified && (p.status ?? "active") === "active")
  assert.ok(base, "no unverified live program to build the fixture from")
  const md = programMd({ ...base, last_verified_at: "2026-10-12" })
  assert.match(md, /Status: unverified/)
  assert.doesNotMatch(md, /Last verified/)
  assert.ok(!md.includes("2026-10-12"), "the unverified entry's date leaks into its .md")
  const verified = programMd({ ...base, verified: true, last_verified_at: "2026-10-12" })
  assert.match(verified, /Last verified: 2026-10-12/)
})

test("no generated unverified file or llms-full entry says Last verified", () => {
  const dir = join(root, "public", "programs")
  const files = readdirSync(dir).filter((f) => f.endsWith(".md"))
  assert.ok(files.length > 0)
  const unverified = files.map((f) => readFileSync(join(dir, f), "utf8")).filter((t) => t.includes("Status: unverified"))
  assert.ok(unverified.length > 0)
  for (const text of unverified) assert.doesNotMatch(text, /Last verified/)
  for (const entry of readFileSync(join(root, "public", "llms-full.txt"), "utf8").split("\n---\n")) {
    if (entry.includes("Status: unverified")) assert.doesNotMatch(entry, /Last verified/)
  }
})
