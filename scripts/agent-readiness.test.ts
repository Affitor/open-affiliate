/** Run after npm run build (or md:build): the ARD test reads the generated public/.well-known/ard.json. */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { NextRequest } from "next/server"
import { GET as list } from "../src/app/api/programs/route"
import { GET as detail } from "../src/app/api/programs/[slug]/route"
import { GET as categories } from "../src/app/api/categories/route"
import { GET as missing } from "../src/app/api/[...path]/route"
import { openapi } from "../src/lib/openapi"
import { registerWebMcpTools, WEBMCP_TOOLS, type WebMcpTool } from "../src/lib/webmcp"
import { nextConfig } from "../next.config"
import { ardCatalog } from "./generate-ard"
import { llmsTxt } from "./generate-md"

const BASE = "https://openaffiliate.dev"

test("ARD catalog lists only served surfaces, in the v0.91 entry shape", () => {
  const served = JSON.parse(readFileSync("public/.well-known/ard.json", "utf8"))
  assert.deepEqual(served, ardCatalog(process.cwd()), "public/.well-known/ard.json is stale: run npm run md:build")
  assert.deepEqual(Object.keys(served), ["entries"])
  const ids = new Set<string>()
  for (const entry of served.entries) {
    assert.match(entry.identifier, /^urn:air:openaffiliate\.dev:[a-z0-9-]+:[a-z0-9-]+$/)
    assert.ok(!ids.has(entry.identifier), entry.identifier)
    ids.add(entry.identifier)
    assert.ok(entry.displayName && entry.description, entry.identifier)
    assert.match(entry.type, /^[a-z]+\/[a-z0-9.+-]+(;[a-z]+=[\w.]+)?$/, entry.identifier)
    assert.equal(("url" in entry) !== ("data" in entry), true, `${entry.identifier}: exactly one of url or data`)
    if (entry.url) assert.ok(entry.url.startsWith(`${BASE}/`), entry.url)
    assert.ok(entry.representativeQueries.length >= 2 && entry.representativeQueries.length <= 5, entry.identifier)
  }
  type Entry = { type: string; url?: string; data?: unknown }
  const byType: Record<string, Entry> = Object.fromEntries(served.entries.map((e: Entry) => [e.type, e]))
  // MCP: the registry's own server.json, whose remote is the hosted endpoint.
  const server = JSON.parse(readFileSync("packages/mcp/server.json", "utf8"))
  assert.deepEqual(byType["application/mcp-server+json"].data, server)
  assert.ok(server.remotes.some((r: { url: string }) => r.url === `${BASE}/mcp`))
  assert.equal(byType["application/vnd.oai.openapi+json;version=3.1"].url, `${BASE}/openapi.json`)
  const skills = JSON.parse(readFileSync("public/.well-known/agent-skills/index.json", "utf8")).skills
  assert.equal(byType["application/agent-skills+md"].url, skills[0].url)
  assert.equal(byType["text/plain"].url, `${BASE}/llms.txt`)
  assert.ok(llmsTxt().includes(`${BASE}/.well-known/ard.json`))
  assert.match(readFileSync("src/app/layout.tsx", "utf8"), /rel="ard" href="\/\.well-known\/ard\.json"/)
})

test("discovery files are served with CORS", async () => {
  const rules = await nextConfig.headers!()
  const rule = rules.find((r) => r.source === "/.well-known/:path*")
  assert.deepEqual(rule?.headers, [{ key: "Access-Control-Allow-Origin", value: "*" }])
})

test("every REST response carries the API-Version the OpenAPI document declares", async () => {
  const version = openapi.components.headers.APIVersion.schema.const
  assert.equal(version, "1")
  const responses = [
    list(new NextRequest("http://localhost/api/programs?limit=1")),
    await detail(new NextRequest("http://localhost/api/programs/vercel"), { params: Promise.resolve({ slug: "vercel" }) }),
    await detail(new NextRequest("http://localhost/api/programs/not-a-program"), { params: Promise.resolve({ slug: "not-a-program" }) }),
    categories(),
    missing(),
  ]
  for (const response of responses) assert.equal(response.headers.get("API-Version"), version, response.url)
  for (const path of Object.values(openapi.paths)) {
    for (const response of Object.values(path.get.responses)) {
      assert.deepEqual(response.headers, { "API-Version": { $ref: "#/components/headers/APIVersion" } })
    }
  }
  for (const text of ["API-Version", "Deprecation header (RFC 9745)", "Sunset header (RFC 8594)", "at least 90 days"]) {
    assert.ok(openapi.info.description.includes(text), text)
  }
  assert.match(readFileSync("src/app/docs/api/page.tsx", "utf8"), /id="versioning"[\s\S]*Deprecation[\s\S]*Sunset/)
})

type Registration = { tool: WebMcpTool; options: { signal: AbortSignal } }
function stubBrowser(document: object, navigator: object) {
  Object.defineProperty(globalThis, "document", { value: document, configurable: true, writable: true })
  Object.defineProperty(globalThis, "navigator", { value: navigator, configurable: true, writable: true })
}
function context(registered: Registration[], register?: () => unknown) {
  return { registerTool: (tool: WebMcpTool, options: { signal: AbortSignal }) => { registered.push({ tool, options }); return register?.() } }
}

test("WebMCP registers exactly the three read-only tools, preferring document.modelContext", async () => {
  const savedNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator")
  const savedFetch = globalThis.fetch
  try {
    const onDocument: Registration[] = []
    const onNavigator: Registration[] = []
    stubBrowser({ modelContext: context(onDocument) }, { modelContext: context(onNavigator) })
    const signal = new AbortController().signal
    registerWebMcpTools(signal)
    assert.deepEqual(onDocument.map((r) => r.tool.name), ["search_programs", "get_program", "list_categories"])
    assert.equal(onNavigator.length, 0, "navigator.modelContext is only a fallback")
    for (const { tool, options } of onDocument) {
      assert.equal(options.signal, signal)
      assert.deepEqual(tool.annotations, { readOnlyHint: true, untrustedContentHint: true })
      assert.equal((tool.inputSchema as { type: string }).type, "object")
    }
    // Inputs use the REST API's canonical parameter names and values.
    const search = onDocument[0].tool.inputSchema as { properties: Record<string, { enum?: string[] }> }
    const restParams = new Map(openapi.paths["/api/programs"].get.parameters.map((p) => [p.name, p.schema as { enum?: string[] }]))
    for (const [name, schema] of Object.entries(search.properties)) {
      assert.ok(restParams.has(name), name)
      if (schema.enum) assert.deepEqual(schema.enum, restParams.get(name)!.enum)
    }

    const requests: string[] = []
    globalThis.fetch = (async (url: string) => { requests.push(url); return Response.json({ ok: true }) }) as typeof fetch
    const [searchTool, getTool, listTool] = onDocument.map((r) => r.tool)
    assert.deepEqual(await searchTool.execute({ q: "email", type: "recurring", verified: true, category: "" }), { ok: true })
    await searchTool.execute({ limit: 0 })
    await getTool.execute({ slug: "a/b" })
    await listTool.execute({})
    assert.deepEqual(requests, [
      "/api/programs?q=email&type=recurring&verified=true&limit=20",
      "/api/programs?limit=20",
      "/api/programs/a%2Fb",
      "/api/categories",
    ])

    // Fallback: no document.modelContext.
    stubBrowser({}, { modelContext: context(onNavigator) })
    registerWebMcpTools(signal)
    assert.equal(onNavigator.length, 3)
  } finally {
    globalThis.fetch = savedFetch
    delete (globalThis as { document?: unknown }).document
    if (savedNavigator) Object.defineProperty(globalThis, "navigator", savedNavigator)
  }
})

test("WebMCP is a silent no-op when unsupported or refused", async () => {
  const savedNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator")
  const rejections: unknown[] = []
  const onRejection = (reason: unknown) => rejections.push(reason)
  process.on("unhandledRejection", onRejection)
  try {
    const signal = new AbortController().signal
    delete (globalThis as { document?: unknown }).document
    registerWebMcpTools(signal) // no document at all
    stubBrowser({}, {})
    registerWebMcpTools(signal)
    stubBrowser({ modelContext: {} }, {})
    registerWebMcpTools(signal)
    const thrown: Registration[] = []
    stubBrowser({ modelContext: context(thrown, () => { throw new Error("duplicate") }) }, {})
    registerWebMcpTools(signal)
    assert.equal(thrown.length, 3, "one failure does not stop the others")
    stubBrowser({ modelContext: context([], () => Promise.reject(new DOMException("blocked", "NotAllowedError"))) }, {})
    registerWebMcpTools(signal)
    await new Promise((resolve) => setTimeout(resolve, 10))
    assert.deepEqual(rejections, [])
    assert.equal(WEBMCP_TOOLS.length, 3)
  } finally {
    process.off("unhandledRejection", onRejection)
    delete (globalThis as { document?: unknown }).document
    if (savedNavigator) Object.defineProperty(globalThis, "navigator", savedNavigator)
  }
})
