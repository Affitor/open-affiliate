import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { newPrograms, newProgramsRss } from "../src/lib/new-programs"
import { programs, type Program } from "../src/lib/programs"

const now = new Date("2026-10-18T12:00:00Z")
const fixture = (i: number, extra: Partial<Program> = {}): Program => ({ ...programs[0], slug: `fixture-${i}`, name: `Tool ${i} & <more>`, createdAt: "2026-10-18", status: "active", verified: true, ...extra })

test("RSS caps at 50; every guid is its program URL, XML escaped", () => {
  const input = Array.from({ length: 70 }, (_, i) => fixture(i))
  const rss = newProgramsRss(input, now)
  assert.equal((rss.match(/<item>/g) ?? []).length, 50)
  const guids = [...rss.matchAll(/<guid isPermaLink="true">([^<]+)<\/guid>/g)].map((m) => m[1])
  assert.deepEqual(guids, newPrograms(input, now).slice(0, 50).map((p) => `https://openaffiliate.dev/programs/${p.slug}`))
  assert.match(rss, /&amp; &lt;more&gt;/)
  assert.match(rss, /atom:link href="https:\/\/openaffiliate.dev\/new.xml"/)
})
test("30-day UTC boundary, no future/old/inactive, confirmed prose only", () => {
  const rows = [fixture(0, { createdAt: "2026-09-19" }), fixture(1, { createdAt: "2026-09-18" }), fixture(2, { createdAt: "2026-10-19" }), ...(["paused", "discontinued", "no_program"] as const).map((status, i) => fixture(i + 3, { status })), fixture(6, { verified: false, shortDescription: "A tool. Cookie lasts 90 days. Payout minimum is $50." })]
  assert.deepEqual(newPrograms(rows, now).map((p) => p.slug), ["fixture-6", "fixture-0"])
  assert.doesNotMatch(newProgramsRss(rows, now), /90 days|\$50/)
  assert.equal((newProgramsRss([], now).match(/<item>/g) ?? []).length, 0)
})
test("static RSS, alternate feed, saved noindex and sitemap entry are wired", () => {
  assert.match(readFileSync("src/app/new.xml/route.ts", "utf8"), /dynamic = "force-static"/)
  assert.match(readFileSync("src/app/new/page.tsx", "utf8"), /"application\/rss\+xml": "\/new.xml"/)
  assert.match(readFileSync("src/app/saved/page.tsx", "utf8"), /index: false/)
  assert.match(readFileSync("src/app/sitemap.ts", "utf8"), /BASE_URL\}\/new`/)
})
