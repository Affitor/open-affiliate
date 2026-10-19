/** Run after npm run build (or md:build): the ARD test reads the generated public/.well-known/ard.json. */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
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

test("every /api response carries the API-Version the OpenAPI document declares", async () => {
  const version = openapi.components.headers.APIVersion.schema.const
  assert.equal(version, "1")
  // One config rule, so 405s, OPTIONS, badges and error bodies get it too, not only the routes that remember to.
  const rules = (await nextConfig.headers!()).filter((r) => r.headers.some((h) => h.key === "API-Version"))
  assert.equal(rules.length, 1)
  assert.deepEqual(rules[0], { source: "/api/:path*", headers: [{ key: "API-Version", value: version }] })
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
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      assert.equal(init?.method, "GET", "tools are read-only")
      requests.push(url)
      return Response.json({ ok: true })
    }) as typeof fetch
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

    // Every failure resolves with the API's { error } shape; execute never throws or rejects.
    const tools = [[searchTool, { q: "x" }], [getTool, { slug: "vercel" }], [listTool, {}]] as const
    const code = async (run: () => Promise<unknown>) => ((await run()) as { error: { code: string } }).error.code
    globalThis.fetch = (async () => { throw new TypeError("Failed to fetch") }) as typeof fetch
    for (const [tool, input] of tools) assert.equal(await code(() => tool.execute(input)), "NETWORK_ERROR", tool.name)
    globalThis.fetch = (async () => new Response("<html>Bad gateway</html>", { status: 502 })) as typeof fetch
    for (const [tool, input] of tools) assert.equal(await code(() => tool.execute(input)), "INVALID_RESPONSE", tool.name)
    assert.equal(await code(() => getTool.execute({ slug: "\uD800" })), "INVALID_INPUT")
    assert.equal(await code(() => searchTool.execute(null as unknown as Record<string, unknown>)), "INVALID_INPUT")
    globalThis.fetch = ((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
    })) as typeof fetch
    const cancel = new AbortController()
    const pending = listTool.execute({}, { signal: cancel.signal })
    cancel.abort()
    assert.equal(await code(() => pending), "ABORTED")
    // A 404 keeps the API's own error body.
    globalThis.fetch = (async () => Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 })) as typeof fetch
    assert.equal(await code(() => getTool.execute({ slug: "not-a-program" })), "NOT_FOUND")

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

test("aborting the signal unregisters every tool", () => {
  const savedNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator")
  try {
    // Spec behaviour: a tool registered with { signal } is removed when that signal aborts.
    const live = new Map<string, WebMcpTool>()
    stubBrowser({
      modelContext: {
        registerTool(tool: WebMcpTool, { signal }: { signal: AbortSignal }) {
          live.set(tool.name, tool)
          signal.addEventListener("abort", () => live.delete(tool.name))
        },
      },
    }, {})
    const controller = new AbortController()
    registerWebMcpTools(controller.signal)
    assert.equal(live.size, 3)
    controller.abort()
    assert.equal(live.size, 0)
    // The component aborts its controller on unmount.
    assert.match(readFileSync("src/components/webmcp-tools.tsx", "utf8"), /registerWebMcpTools\(controller\.signal\)\s+return \(\) => controller\.abort\(\)/)
  } finally {
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
