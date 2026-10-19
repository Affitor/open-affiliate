/**
 * A brand with no affiliate program (status no_program, or discontinued) must
 * get the same answer, and no terms, from every machine surface: the REST API
 * and MCP get_program. The response keeps the shape installed clients read,
 * so the CLI already on npm does not crash on it. Reads src/lib/registry.json,
 * so run it after build-registry (CI runs it after `npm run build`, whose
 * prebuild does that).
 *
 * Run with `npx tsx --test --test-force-exit scripts/no-program.test.ts`:
 * mcp-handler starts a module-level setInterval it never unrefs
 * (node_modules/mcp-handler/dist/index.js, cleanupInterval), so the process
 * would otherwise stay alive after the last test.
 */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { parse } from "yaml"
import { apiProgram, hasNoProgram, noProgramAlternatives } from "../src/lib/no-program"
import { buildFaq } from "../src/lib/program-seo"
import { getProgram, isLive, programs } from "../src/lib/programs"
import { getRelatedPrograms } from "../src/components/related-programs"
import registry from "../src/lib/registry.json"
import { programMd } from "./generate-md"
import { buildSiftInsights, type ScoredRow } from "../src/lib/sift-stats"
import { noProgramProblems, nonCashAffiliate } from "./program-rules"
import { mcpGetProgram, publishedCliAddCommission, publishedCliInfo, restGetProgram } from "./surface-test-helpers"

/** Left out entirely. `commission` and `payout` stay, as neutral placeholders. */
const OMITTED = ["cookieDays", "signupUrl", "approval", "approvalTime", "restrictions", "commissionDuration", "commissionConditions"]
const PLACEHOLDER = { type: "none", rate: "No affiliate program", mode: "unknown", value: null, currency: "USD", duration: null, conditions: null }
const noProgram = programs.filter(hasNoProgram)

function expectedStart(p: { lastVerifiedAt?: string | null }): string {
  return p.lastVerifiedAt ? `No (checked ${p.lastVerifiedAt}).` : "No."
}

function assertAnswerWithoutTerms(body: Record<string, unknown>, slug: string): void {
  const p = getProgram(slug)!
  for (const key of OMITTED) assert.equal(key in body, false, `${slug}: ${key} must not be returned`)
  assert.deepEqual(body.commission, PLACEHOLDER, `${slug}: commission must be the placeholder`)
  assert.deepEqual(body.payout, {}, `${slug}: payout must be empty`)
  assert.equal(body.status, p.status)
  assert.ok(String(body.answer).startsWith(expectedStart(p)), `${slug}: answer is ${JSON.stringify(body.answer)}`)
  const alternatives = body.alternatives as { slug: string }[]
  assert.ok(Array.isArray(alternatives), `${slug}: alternatives missing`)
  for (const a of alternatives) {
    const alt = getProgram(a.slug)!
    assert.ok(alt.verified && isLive(alt) && alt.category === p.category, `${slug}: alternative ${a.slug}`)
  }
}

test("the registry has at least one no_program and one discontinued entry to check", () => {
  assert.ok(noProgram.some((p) => p.status === "no_program"))
  assert.ok(noProgram.some((p) => p.status === "discontinued"))
})

test("REST /api/programs/{slug} returns the answer and no terms", async () => {
  for (const p of noProgram) assertAnswerWithoutTerms(await restGetProgram(p.slug), p.slug)
})

test("MCP get_program returns the answer and no terms", async () => {
  for (const p of noProgram) {
    const body = await mcpGetProgram(p.slug)
    assertAnswerWithoutTerms(body, p.slug)
    assert.equal(body.markdownUrl, `https://openaffiliate.dev/programs/${p.slug}.md`)
  }
})

test("the CLI already on npm reads a no-program response without crashing or printing a term", async () => {
  for (const p of noProgram) {
    const body = await restGetProgram(p.slug)
    const out = publishedCliInfo(body)
    const line = (label: string) => out.split("\n").find((l) => l.trim().startsWith(label)) ?? ""
    assert.ok(line("Commission:").includes("No affiliate program"), `${p.slug}: ${line("Commission:")}`)
    for (const label of ["Commission:", "Cookie:", "Payout:"]) {
      assert.equal(/\d/.test(line(label)), false, `${p.slug}: ${line(label)}`)
    }
    assert.equal(out.includes("Signup:"), false)
    assert.equal(publishedCliAddCommission(body), "No affiliate program none")
  }
})

test("a live program keeps its terms on both surfaces", async () => {
  const live = programs.find((p) => isLive(p) && p.verified)!
  assert.equal(apiProgram(live), live)
  const body = await mcpGetProgram(live.slug)
  assert.deepEqual(body.commission, JSON.parse(JSON.stringify(live.commission)))
  assert.equal("answer" in body, false)
})

test("FAQ answers no with the check date; alternatives are same-category, verified and cash by structure", () => {
  for (const p of noProgram) {
    const [first] = buildFaq(p)
    assert.equal(first.q, `Does ${p.name} have an affiliate program?`)
    assert.ok(first.a.startsWith(expectedStart(p)), `${p.slug}: ${first.a}`)
    for (const a of noProgramAlternatives(p)) {
      assert.equal(a.category, p.category, a.slug)
      assert.ok(a.verified && isLive(a), a.slug)
      assert.equal(a.kind, "affiliate", a.slug)
      assert.ok(a.commission.mode === "flat" || a.commission.mode === "percentage", a.slug)
      assert.equal(typeof a.commission.value, "number", a.slug)
    }
  }
})

test("a gift card or credit reward is never an alternative", () => {
  // Slab pays Amazon gift cards and Neon pays credits; both are kind: referral.
  // Attio pays a $200 gift card and was filed kind: affiliate, mode flat, value 200 until this PR.
  for (const slug of ["slab", "neon", "replit", "airtable", "attio"]) {
    const reward = getProgram(slug)
    assert.ok(reward, slug)
    // A probe in the same category with the same keywords: every candidate qualifies on category.
    const all = noProgramAlternatives({ ...reward, slug: `${slug}-probe` }, programs.length)
    assert.equal(all.some((a) => a.slug === slug), false, slug)
  }
})

test("Kyma API is suggested like any program: no same-team exclusion or line (Sơn 19/10)", () => {
  const kyma = getProgram("kyma-api")
  assert.ok(kyma && kyma.verified && isLive(kyma), "the probe below proves nothing unless Kyma would qualify")
  // A probe in Kyma's category with its keywords: Kyma is now a candidate like any other.
  assert.ok(noProgramAlternatives({ ...kyma, slug: "kyma-api-probe" }, programs.length).some((a) => a.slug === "kyma-api"))
  assert.ok(programs.filter(isLive).some((p) => getRelatedPrograms(p, programs.length).some((r) => r.slug === "kyma-api")))
  type Entry = Parameters<typeof programMd>[0]
  const entry = (registry.programs as Entry[]).find((p) => p.slug === "kyma-api")!
  assert.doesNotMatch(programMd(entry), /same team/i)
})

test("no source file marks a program as same team", () => {
  // git grep exits 1 when nothing matches, 0 with matches: both are answers, anything else is not.
  const grep = spawnSync("git", ["grep", "-n", "-i", "-E", "same[ -]?team|isSameTeam", "--", "src", "scripts", ":!scripts/no-program.test.ts"], { encoding: "utf8", cwd: join(__dirname, "..") })
  assert.ok(grep.status === 0 || grep.status === 1, grep.stderr)
  assert.equal(grep.stdout.trim(), "")
})

test("a category with no qualifying program gets no alternatives", () => {
  const p = noProgram[0]
  assert.deepEqual(noProgramAlternatives({ ...p, category: "No Such Category" }), [])
})

function yamlOf(slug: string): Record<string, unknown> {
  return parse(readFileSync(join(process.cwd(), "programs", `${slug}.yaml`), "utf8"))
}

test("a no_program commission is exactly the placeholder: extra keys and other values are refused", () => {
  const openrouter = yamlOf("openrouter")
  assert.deepEqual(noProgramProblems(openrouter), [])
  const commission = openrouter.commission as Record<string, unknown>
  // Both inputs from the Codex r2 review.
  const bonus = { ...openrouter, commission: { ...commission, bonus: { amount: 500, currency: "USD" } } }
  assert.ok(noProgramProblems(bonus).some((p) => p.includes("commission.bonus")), JSON.stringify(noProgramProblems(bonus)))
  const typed = { ...openrouter, commission: { ...commission, type: "30% recurring" } }
  assert.ok(noProgramProblems(typed).some((p) => p.includes("commission.type")), JSON.stringify(noProgramProblems(typed)))
  const conditions = { ...openrouter, commission: { ...commission, conditions: "20% on sales" } }
  assert.ok(noProgramProblems(conditions).length > 0)
  const missing = { ...openrouter, commission: { mode: "unknown", value: null } }
  assert.ok(noProgramProblems(missing).some((p) => p.includes("missing")))
})

test("the non-cash guard flags kind: affiliate gift cards that rank, and nothing it should not", () => {
  const attio = yamlOf("attio")
  assert.equal(attio.kind, "referral")
  assert.equal(nonCashAffiliate(attio), false)
  // Attio as it was filed before this PR.
  const before = { ...attio, kind: "affiliate", commission: { ...(attio.commission as object), mode: "flat", value: 200 } }
  assert.equal(nonCashAffiliate(before), true)
  // kind left out reads as the schema default, affiliate.
  const { kind: _kind, ...noKind } = before
  assert.equal(nonCashAffiliate(noKind), true, String(_kind))
  assert.equal(nonCashAffiliate(yamlOf("netlify")), false)
  // Cash programs whose conditions mention a customer credit or credit purchases.
  for (const slug of ["fathom-analytics", "flowith", "ticket-tailor", "catalister", "picturesque-ai"]) {
    assert.equal(nonCashAffiliate(yamlOf(slug)), false, slug)
  }
  // Import placeholders ("usage-based referral credits") cannot rank: mode unknown.
  assert.equal(nonCashAffiliate(yamlOf("fal")), false)
  // A credit named in the rate is the reward itself.
  const creditRate = { kind: "affiliate", commission: { mode: "flat", value: 20, rate: "$20 in account credit" } }
  assert.equal(nonCashAffiliate(creditRate), true)
})

test("Content Insights never recommends or counts a program that is not live", () => {
  const openrouter = getProgram("openrouter")!
  const live = programs.find((p) => isLive(p) && p.category === openrouter.category)!
  // Codex r2's probe: five rows for openrouter at sift_score 8, plus rows for a live AI program and an unknown slug.
  const rows: ScoredRow[] = [
    ...Array.from({ length: 5 }, () => ({ sift_score: 8, sift_tag: "tutorial", platform: "youtube", program_slug: "openrouter" })),
    ...Array.from({ length: 5 }, () => ({ sift_score: 6, sift_tag: "review", platform: "reddit", program_slug: live.slug })),
    ...Array.from({ length: 5 }, () => ({ sift_score: 9, sift_tag: "review", platform: "x", program_slug: "no-such-program" })),
  ]
  const insights = buildSiftInsights(rows, rows.length)
  const listed = [...insights.risingPrograms, ...insights.opportunities, ...insights.highValueVerified].map((p) => p.slug)
  assert.equal(listed.includes("openrouter"), false)
  assert.equal(listed.includes("no-such-program"), false)
  const ai = insights.categoryInsights.find((c) => c.category === openrouter.category)!
  assert.equal(ai.topProgram.slug, live.slug)
  assert.equal(ai.programCount, 1)
  assert.equal(insights.programsWithContent, 1)
  assert.equal(insights.categoryInsights.some((c) => c.category === "Other"), false)
})
