/**
 * A brand with no affiliate program (status no_program, or discontinued) must
 * get the same answer, and no terms, from every machine surface: the REST API
 * and MCP get_program. Reads src/lib/registry.json, so run it after
 * build-registry (CI runs it after `npm run build`, whose prebuild does that).
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

const TERMS = ["commission", "cookieDays", "payout", "signupUrl", "approval", "approvalTime", "restrictions"]
const noProgram = programs.filter(hasNoProgram)

function expectedStart(p: { lastVerifiedAt?: string | null }): string {
  return p.lastVerifiedAt ? `No (checked ${p.lastVerifiedAt}).` : "No."
}

function assertAnswerWithoutTerms(body: Record<string, unknown>, slug: string): void {
  const p = getProgram(slug)!
  for (const key of TERMS) assert.equal(key in body, false, `${slug}: ${key} must not be returned`)
  assert.equal(body.status, p.status)
  assert.ok(String(body.answer).startsWith(expectedStart(p)), `${slug}: answer is ${JSON.stringify(body.answer)}`)
  const alternatives = body.alternatives as { slug: string }[]
  assert.ok(Array.isArray(alternatives), `${slug}: alternatives missing`)
  for (const a of alternatives) {
    const alt = getProgram(a.slug)!
    assert.ok(alt.verified && isLive(alt), `${slug}: alternative ${a.slug} must be verified and live`)
  }
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

test("the registry has at least one no_program entry to check", () => {
  assert.ok(noProgram.some((p) => p.status === "no_program"))
})

test("REST /api/programs/{slug} returns the answer and no terms", async () => {
  for (const p of noProgram) {
    const res = await restGet(new NextRequest(`http://localhost/api/programs/${p.slug}`), {
      params: Promise.resolve({ slug: p.slug }),
    })
    assert.equal(res.status, 200)
    assertAnswerWithoutTerms(await res.json(), p.slug)
  }
})

test("MCP get_program returns the answer and no terms", async () => {
  for (const p of noProgram) {
    const body = await mcpGetProgram(p.slug)
    assertAnswerWithoutTerms(body, p.slug)
    assert.equal(body.markdownUrl, `https://openaffiliate.dev/programs/${p.slug}.md`)
  }
})

test("a live program keeps its terms on both surfaces", async () => {
  const live = programs.find((p) => isLive(p) && p.verified)!
  assert.equal(apiProgram(live), live)
  const body = await mcpGetProgram(live.slug)
  assert.ok("commission" in body)
  assert.equal("answer" in body, false)
})

test("FAQ answers no with the check date, and alternatives pay in cash", () => {
  for (const p of noProgram) {
    const [first] = buildFaq(p)
    assert.equal(first.q, `Does ${p.name} have an affiliate program?`)
    assert.ok(first.a.startsWith(expectedStart(p)), `${p.slug}: ${first.a}`)
    for (const a of noProgramAlternatives(p)) {
      assert.ok(a.verified && isLive(a) && a.commission.value !== null && !/credit/i.test(String(a.commission.rate)), a.slug)
    }
  }
})
