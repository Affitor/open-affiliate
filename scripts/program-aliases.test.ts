/**
 * Program aliases are URLs. /programs/<alias> and /programs/<alias>.md are
 * 308s to the program's page and .md twin; the REST API and MCP get_program
 * answer an alias with the program itself; a real slug is never redirected.
 * Reads src/lib/registry.json, so run it after build-registry (CI runs it after
 * `npm run build`, whose prebuild does that).
 *
 * Run with `npx tsx --test --test-force-exit scripts/program-aliases.test.ts`:
 * mcp-handler keeps a module-level timer alive (see no-program.test.ts).
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { NextRequest } from "next/server"
import nextConfig from "../next.config"
import { GET as restGet } from "../src/app/api/programs/[slug]/route"
import { createMcpRoute } from "../src/lib/mcp-route"
import { programs } from "../src/lib/programs"
import registryData from "../src/lib/registry.json"
import { aliasRoutes } from "./program-rules"

const aliases = Object.entries((registryData as { aliases?: Record<string, string> }).aliases ?? {})
const slugs = new Set(programs.map((p) => p.slug))

/** Vercel's cap on redirects per deployment (Next's redirecting guide). */
const VERCEL_REDIRECT_LIMIT = 1024

async function rest(slug: string): Promise<Response> {
  return restGet(new NextRequest(`http://localhost/api/programs/${slug}`), { params: Promise.resolve({ slug }) })
}

async function mcpGetProgram(slug: string): Promise<string> {
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
  const message = JSON.parse(raw.trim().startsWith("{") ? raw : raw.split("\n").find((l) => l.startsWith("data: "))!.slice(6))
  return message.result.content[0].text
}

test("the rule: lowercased slug-shaped aliases route, a real slug wins, a shared alias clashes", () => {
  const { routes, shadowed, clashes } = aliasRoutes([
    { slug: "vidyo", aliases: ["quso", " Quso-AI ", "vidyo", "quso.ai", "eleven labs", "notion", "quso"] },
    { slug: "notion", aliases: [] },
    { slug: "other", aliases: ["quso"] },
  ])
  assert.deepEqual(routes, { quso: "vidyo", "quso-ai": "vidyo" })
  assert.equal(shadowed.length, 1)
  assert.match(shadowed[0], /"notion"/)
  assert.deepEqual(clashes, ['alias "quso" is claimed by both vidyo and other'])
})

test("registry.json carries the alias routes the rule gives for today's programs", () => {
  assert.ok(aliases.length > 0, "registry.json has no aliases; run build-registry first")
  assert.deepEqual(Object.fromEntries(aliases), aliasRoutes(registryData.programs).routes)
})

test("each alias and its .md are a 308 to the canonical page; no real slug is redirected", async () => {
  const redirects = await nextConfig.redirects!()
  assert.ok(redirects.length <= VERCEL_REDIRECT_LIMIT, `${redirects.length} redirects; Vercel takes ${VERCEL_REDIRECT_LIMIT}`)
  const bySource = new Map(redirects.map((r) => [r.source, r]))
  for (const [alias, slug] of aliases) {
    assert.ok(slugs.has(slug), `${alias} points at ${slug}, which is not a program`)
    for (const ext of ["", ".md"]) {
      const r = bySource.get(`/programs/${alias}${ext}`)
      assert.ok(r, `/programs/${alias}${ext} has no redirect`)
      assert.equal(r.destination, `/programs/${slug}${ext}`)
      assert.equal(r.permanent, true)
    }
  }
  for (const slug of slugs) {
    for (const ext of ["", ".md"]) {
      assert.equal(bySource.has(`/programs/${slug}${ext}`), false, `real slug /programs/${slug}${ext} is redirected`)
    }
  }
})

test("REST /api/programs/<alias> answers 200 with the canonical program's body", async () => {
  for (const [alias, slug] of aliases) {
    const viaAlias = await rest(alias)
    assert.equal(viaAlias.status, 200, `/api/programs/${alias}`)
    assert.deepEqual(await viaAlias.json(), await (await rest(slug)).json(), `/api/programs/${alias} differs from ${slug}`)
  }
  assert.equal((await rest("no-such-program-or-alias")).status, 404)
})

test("MCP get_program resolves an alias to the canonical program", async () => {
  for (const [alias, slug] of aliases.slice(0, 5)) {
    const text = await mcpGetProgram(alias)
    assert.equal(JSON.parse(text).slug, slug)
    assert.equal(text, await mcpGetProgram(slug))
  }
  assert.match(await mcpGetProgram("no-such-program-or-alias"), /not found/)
})
