/**
 * OAS on the machine surfaces: REST /api/programs/{slug}, MCP get_program and the
 * program .md twin carry exactly the score the program page shows, and nothing
 * while OAS is unpublished or the program is unscored. Run after the build
 * (prebuild writes src/lib/oas-scores.json).
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { parse } from "yaml"
import { NextRequest } from "next/server"
import { GET as detail } from "../src/app/api/programs/[slug]/route"
import { apiProgram } from "../src/lib/no-program"
import { getProgram, programs } from "../src/lib/programs"
import { OAS_IN_PROGRESS_TEXT, OAS_STALE_TEXT, oasGrade, oasScores, oasSummary, oasSummaryOf, oasValue, verdictText } from "../src/lib/oas"
import { scoreProgram, type ProgramYaml } from "../src/lib/oas-v1"
import { programMd } from "./generate-md"

const TODAY = new Date("2026-10-20T00:00:00Z")
const MARKED = Object.fromEntries(["commission.duration", "cookie_days", "payout.minimum", "payout.methods", "payout.frequency", "approval", "restrictions"].map((f) => [f, "2026-10-14"]))
const yaml = (over: Partial<ProgramYaml> = {}): ProgramYaml => ({
  slug: "p", kind: "affiliate", verified: true, status: "active", last_verified_at: "2026-10-13", signup_url: "https://p.example/affiliates",
  commission: { type: "recurring", rate: "30%", duration: "12 months" }, cookie_days: 60,
  payout: { minimum: 50, currency: "USD", frequency: "monthly", methods: ["paypal"] }, approval: "auto", restrictions: ["No brand bidding"],
  not_published: MARKED, ...over,
})
const md = (slug: string) => programMd(parse(readFileSync(join("programs", `${slug}.yaml`), "utf8")))

test("summary: scored, stale and in progress read as the program page reads them", () => {
  const scored = oasSummaryOf(scoreProgram(yaml(), TODAY), TODAY)
  assert.equal(scored.status, "scored")
  assert.equal(scored.score, 100)
  assert.equal(scored.grade, oasGrade(100))
  assert.equal(scored.summary, verdictText(scoreProgram(yaml(), TODAY), TODAY))
  assert.equal(scored.reportUrl, "https://openaffiliate.dev/programs/p/oas")
  assert.equal(scored.checkedAt, "2026-10-13")

  const stale = oasSummaryOf(scoreProgram(yaml({ last_verified_at: "2026-06-01" }), TODAY), TODAY)
  assert.deepEqual([stale.status, stale.score, stale.grade, stale.summary], ["stale", null, null, OAS_STALE_TEXT])

  const checking = scoreProgram(yaml(), TODAY)
  checking.checks[0] = { ...checking.checks[0], state: "checking" }
  const progress = oasSummaryOf(checking, TODAY)
  assert.deepEqual([progress.status, progress.score, progress.grade, progress.summary], ["in_progress", null, null, OAS_IN_PROGRESS_TEXT])
})

test("an unscored program carries no OAS on any surface", async () => {
  const unscored = programs.find((p) => !oasScores.some((s) => s.slug === p.slug) && p.status !== "no_program" && p.status !== "discontinued")!
  assert.ok(unscored)
  assert.equal(oasSummary(unscored.slug), null)
  assert.ok(!("oas" in apiProgram(unscored)))
  const body = await (await detail(new NextRequest(`http://localhost/api/programs/${unscored.slug}`), { params: Promise.resolve({ slug: unscored.slug }) })).json()
  assert.ok(!("oas" in body))
  assert.doesNotMatch(md(unscored.slug), /^## OAS$/m)
})

test("a scored program carries the page's score on REST, MCP and its .md twin", async (t) => {
  const s = oasScores.find((x) => oasValue(x) != null)
  if (!s) return t.skip("OAS is not published in this build")
  const summary = oasSummary(s.slug)!
  assert.equal(summary.score, oasValue(s))
  const body = await (await detail(new NextRequest(`http://localhost/api/programs/${s.slug}`), { params: Promise.resolve({ slug: s.slug }) })).json()
  assert.deepEqual(body.oas, summary, "REST")
  // MCP get_program returns apiProgram plus markdownUrl (src/lib/mcp-route.ts).
  assert.deepEqual((apiProgram(getProgram(s.slug)!) as { oas?: unknown }).oas, summary, "MCP")
  const twin = md(s.slug)
  assert.match(twin, new RegExp(`^## OAS\\n\\nOAS ${summary.score}/100 \\(${summary.grade}\\): `, "m"))
  assert.ok(twin.includes(`Full report: ${summary.reportUrl}`))
  // A score that is not current shows its reason, never a number.
  const other = oasScores.find((x) => oasValue(x) == null)
  if (other) {
    const o = oasSummary(other.slug)!
    assert.equal(o.score, null)
    assert.ok(md(other.slug).includes(o.summary))
  }
})
