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
import { test } from "node:test"
import { NextRequest } from "next/server"
import { GET as restGet } from "../src/app/api/programs/[slug]/route"
import { createMcpRoute } from "../src/lib/mcp-route"
import { apiProgram, hasNoProgram, noProgramAlternatives } from "../src/lib/no-program"
import { buildFaq } from "../src/lib/program-seo"
import { getProgram, isLive, programs } from "../src/lib/programs"

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

async function restGetProgram(slug: string): Promise<Record<string, unknown>> {
  const res = await restGet(new NextRequest(`http://localhost/api/programs/${slug}`), {
    params: Promise.resolve({ slug }),
  })
  assert.equal(res.status, 200)
  return res.json()
}

async function mcpGetProgram(slug: string): Promise<Record<string, unknown>> {
  const { POST } = createMcpRoute("")
  const res = await POST(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_program", arguments: { slug } } }),
    })
  )
  assert.equal(res.status, 200)
  const raw = await res.text()
  // Streamable HTTP may answer as one SSE event; the JSON-RPC message is its data line.
  const message = JSON.parse(raw.trim().startsWith("{") ? raw : raw.split("\n").find((l) => l.startsWith("data: "))!.slice(6))
  return JSON.parse(message.result.content[0].text)
}

/**
 * The `info` and `add` code of openaffiliate@0.0.2, npm's `latest` (0.2.0 is
 * the same code), copied verbatim from its dist/index.js. Installed copies
 * cannot be updated, so the API has to keep working for exactly this.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function publishedCliInfo(p: any): string {
  return `
  ${p.name}${p.verified ? " ✓" : ""}
  ${p.shortDescription}
  ${"─".repeat(50)}

  Commission:  ${p.commission.rate}% ${p.commission.type}${p.commissionDuration ? ` (${p.commissionDuration})` : ""}
  Cookie:      ${p.cookieDays} days
  Payout:      $${p.payout.minimum} min / ${p.payout.frequency}
  ${p.payoutMethods ? `Methods:     ${p.payoutMethods.join(", ")}` : ""}
  ${p.approval ? `Approval:    ${p.approval}${p.approvalTime ? ` (${p.approvalTime})` : ""}` : ""}
  ${p.network ? `Network:     ${p.network}` : ""}
  URL:         ${p.url}
  ${p.signupUrl ? `Signup:      ${p.signupUrl}` : ""}

  Tags: ${p.tags.join(", ")}
  ${p.restrictions?.length ? `
  Restrictions:
${p.restrictions.map((r: string) => `    • ${r}`).join("\n")}` : ""}

  AGENTS.md:
  ${p.agentPrompt}
  ${p.agentUseCases?.length ? `
  Use cases:
${p.agentUseCases.map((u: string) => `    • ${u}`).join("\n")}` : ""}
`
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function publishedCliAddCommission(p: any): string {
  return `${p.commission.rate} ${p.commission.type}`
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
  for (const slug of ["slab", "neon", "replit", "airtable"]) {
    const reward = getProgram(slug)
    assert.ok(reward, slug)
    // A probe in the same category with the same keywords: every candidate qualifies on category.
    const all = noProgramAlternatives({ ...reward, slug: `${slug}-probe` }, programs.length)
    assert.equal(all.some((a) => a.slug === slug), false, slug)
  }
})

test("a category with no qualifying program gets no alternatives", () => {
  const p = noProgram[0]
  assert.deepEqual(noProgramAlternatives({ ...p, category: "No Such Category" }), [])
})
