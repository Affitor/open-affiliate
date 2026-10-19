/**
 * The hosted MCP route's metadata, tools, resource, CORS and flood guard,
 * plus stdio metadata parity. No external requests or local Next build.
 *
 * Run with `npx tsx --test --test-force-exit scripts/mcp-route.test.ts`: the
 * MCP route keeps a timer alive (see no-program.test.ts).
 *
 * The limiter's window is module state. Tests that call withinLimit freeze
 * Date.now at a time of their own, later than any earlier test's, so each one
 * starts a fresh window and none depends on the real clock.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { setFlagsFromString } from "node:v8"
import { runInNewContext } from "node:vm"
import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { z } from "zod"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import {
  CallToolResultSchema,
  InitializeResultSchema,
  ListResourcesResultSchema,
  ListToolsResultSchema,
  ReadResourceResultSchema,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js"
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv"
import { clientAddress, createMcpRoute, withinLimit } from "../src/lib/mcp-route"
import { categories, livePrograms, programs, termsConfirmed } from "../src/lib/programs"
import { apiProgram } from "../src/lib/no-program"

const PER_WINDOW = 1200
const WINDOW_MS = 60_000

let clock = Date.now()
/** Freeze Date.now at a fresh time, one hour past the previous test's. */
function freeze(t: { after: (fn: () => void) => void }): { now: number } {
  clock += 60 * WINDOW_MS
  const c = { now: clock }
  mock.method(Date, "now", () => c.now)
  t.after(() => mock.restoreAll())
  return c
}

function from(address: string): Request {
  return new Request("https://openaffiliate.dev/mcp", {
    method: "POST",
    headers: { "x-forwarded-for": address },
  })
}

test("preflight allows mcp-protocol-version, which the SDK sends after initialize", () => {
  for (const base of ["", "/api"]) {
    const res = createMcpRoute(base).OPTIONS()
    assert.equal(res.status, 204)
    const allowed = (res.headers.get("access-control-allow-headers") ?? "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
    for (const h of ["content-type", "authorization", "accept", "mcp-protocol-version"]) {
      assert.ok(allowed.includes(h), `${base}/mcp preflight is missing ${h}: ${allowed}`)
    }
    assert.equal(res.headers.get("access-control-expose-headers"), "Retry-After")
  }
})

test("client address keys are capped at 45 characters, the longest unscoped textual IPv6", () => {
  const longestIpv6 = "ffff:ffff:ffff:ffff:ffff:ffff:255.255.255.255"
  assert.equal(longestIpv6.length, 45)
  assert.equal(clientAddress(from(longestIpv6)), longestIpv6)
  assert.equal(clientAddress(from("203.0.113.7, 10.0.0.1")), "203.0.113.7")
  assert.equal(clientAddress(from("x".repeat(8192))).length, 45)
  const realIp = new Request("https://openaffiliate.dev/mcp", { headers: { "x-real-ip": "y".repeat(500) } })
  assert.equal(clientAddress(realIp), "y".repeat(45))
  assert.equal(clientAddress(new Request("https://openaffiliate.dev/mcp")), "unknown")
})

test("a capped key does not keep the long header it was cut from alive", () => {
  setFlagsFromString("--expose-gc")
  const gc = runInNewContext("gc") as () => void
  const heap = () => {
    gc()
    gc()
    return process.memoryUsage().heapUsed
  }
  const keys: string[] = []
  const before = heap()
  for (let i = 0; i < 10_000; i++) {
    keys.push(clientAddress(from(`retain-${i}-`.padEnd(45, "a") + "x".repeat(8192) + i)))
  }
  const retainedMiB = (heap() - before) / 1048576
  assert.equal(new Set(keys).size, 10_000)
  // 10,000 × 8 KB headers is ~80 MiB if each key is a view into its header;
  // copies of 45 characters are ~1 MiB.
  assert.ok(retainedMiB < 10, `10,000 capped keys retained ${retainedMiB.toFixed(1)} MiB`)
})

test("addresses that differ only after 45 characters share one bucket", (t) => {
  freeze(t)
  const prefix = "cap-test-".padEnd(45, "a")
  for (let i = 0; i < PER_WINDOW; i++) {
    assert.ok(withinLimit(from(prefix + "-" + i + "-".repeat(4000))), `request ${i + 1} was refused`)
  }
  assert.equal(withinLimit(from(prefix + "-another")), false)
})

test("the window is fixed: 1200 just before a boundary and 1200 just after all get through", (t) => {
  const c = freeze(t)
  // Another address opens the window at c.now.
  assert.ok(withinLimit(from("192.0.2.1")))

  const address = "198.51.100.23"
  c.now += WINDOW_MS - 1
  let allowed = 0
  for (let i = 0; i < PER_WINDOW + 50; i++) if (withinLimit(from(address))) allowed++
  assert.equal(allowed, PER_WINDOW, "the first window must stop at 1200")

  c.now += 1 // next window, 1 ms later
  for (let i = 0; i < PER_WINDOW + 50; i++) if (withinLimit(from(address))) allowed++
  assert.equal(allowed, 2 * PER_WINDOW, "2400 from one address within 1 ms across the boundary")
})

const HINTS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
}
const TITLES = {
  search_programs: "Search Programs",
  get_program: "Get Program",
  list_categories: "List Categories",
}

/** Exercise the real handler and decode either JSON or Streamable HTTP SSE. */
function rpcClient(base: string) {
  const route = createMcpRoute(base)
  let id = 0
  return async <T>(method: string, params: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> => {
    const res = await route.POST(new Request(`https://openaffiliate.dev${base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    }))
    assert.equal(res.status, 200, `${base}/mcp ${method}`)
    assert.equal(res.headers.get("access-control-allow-origin"), "*")
    const raw = await res.text()
    const json = raw.trim().startsWith("{") ? raw : raw.split("\n").find((line) => line.startsWith("data: "))?.slice(6)
    assert.ok(json, `Missing JSON-RPC response for ${method}: ${raw}`)
    const envelope = JSON.parse(json)
    assert.equal(envelope.id, id)
    assert.equal(envelope.error, undefined, JSON.stringify(envelope.error))
    return schema.parse(envelope.result)
  }
}

function textContent(result: CallToolResult): unknown {
  assert.equal(result.content.length, 1)
  const block = result.content[0]
  assert.equal(block.type, "text")
  return JSON.parse(block.text)
}

const validator = new AjvJsonSchemaValidator()
function validates(tool: Tool, result: CallToolResult) {
  assert.notEqual(result.isError, true, JSON.stringify(result.content))
  assert.ok(tool.outputSchema, `${tool.name} needs an output schema`)
  assert.ok(result.structuredContent, `${tool.name} needs structured content`)
  const validate = validator.getValidator(tool.outputSchema)
  const checked = validate(result.structuredContent)
  assert.equal(checked.valid, true, checked.errorMessage)
  // A negative control proves this is checking the advertised schema rather
  // than accepting any object. All three successful outputs have required keys.
  assert.equal(validate({}).valid, false)
}

for (const base of ["", "/api"]) {
  test(`${base}/mcp initializes with metadata and instructions, advertises schemas and one readable resource`, async () => {
    const rpc = rpcClient(base)
    const initialized = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "mcp-route-test", version: "1.0.0" },
    }, InitializeResultSchema)
    assert.equal(initialized.protocolVersion, "2025-06-18")
    assert.equal(initialized.serverInfo.name, "openaffiliate")
    assert.equal(initialized.serverInfo.version, "0.1.1")
    assert.equal(initialized.serverInfo.title, "OpenAffiliate")
    assert.equal(initialized.serverInfo.websiteUrl, "https://openaffiliate.dev")
    assert.match(initialized.serverInfo.description ?? "", /public, read-only registry/)
    assert.deepEqual(initialized.serverInfo.icons, [{
      src: "https://openaffiliate.dev/favicon.svg", mimeType: "image/svg+xml", sizes: ["any"],
    }])
    assert.ok(existsSync(resolve("public/favicon.svg")))
    for (const phrase of ["read-only", "no API key", "commission.mode", "commission.value", "commission.rate", "cookieDays", "get_program", "paused", "no_program", "markdownUrl"]) {
      assert.ok(initialized.instructions?.includes(phrase), `Instructions missing ${phrase}`)
    }
    assert.ok(initialized.capabilities.tools)
    assert.ok(initialized.capabilities.resources)
    assert.equal(initialized.capabilities.prompts, undefined)

    const { tools } = await rpc("tools/list", {}, ListToolsResultSchema)
    assert.deepEqual(tools.map((tool) => tool.name).sort(), Object.keys(TITLES).sort())
    for (const tool of tools) {
      assert.equal(tool.title, TITLES[tool.name as keyof typeof TITLES])
      assert.deepEqual(tool.annotations, HINTS)
      assert.ok(tool.outputSchema)
      assert.equal(tool.outputSchema.type, "object")
    }
    const tool = (name: string) => tools.find((entry) => entry.name === name)!
    const call = (name: string, args: Record<string, unknown> = {}) => rpc("tools/call", { name, arguments: args }, CallToolResultSchema)

    const search = await call("search_programs")
    validates(tool("search_programs"), search)
    assert.deepEqual(search.structuredContent!.programs, textContent(search))
    const summaries = search.structuredContent!.programs as Record<string, unknown>[]
    assert.equal(summaries.length, livePrograms.length)
    for (const summary of summaries) {
      const program = livePrograms.find((p) => p.slug === summary.slug)!
      assert.ok(program, `Search exposed an inactive entry: ${summary.slug}`)
      assert.equal(summary.cookieDays, termsConfirmed(program) ? program.cookieDays : undefined)
    }
    const empty = await call("search_programs", { query: "__no_matching_program_726a419__" })
    validates(tool("search_programs"), empty)
    assert.deepEqual(empty.structuredContent, { programs: [] })
    assert.deepEqual(textContent(empty), [])

    // The stored YAML permits shapes that Program's static type does not yet
    // reflect (hybrid commission types and null currencies). Check every
    // existing detail projection before enforcing this schema at runtime.
    const validateDetail = validator.getValidator(tool("get_program").outputSchema!)
    const projectionProblems: string[] = []
    for (const program of programs) {
      const projected = JSON.parse(JSON.stringify({ ...apiProgram(program), markdownUrl: `https://openaffiliate.dev/programs/${program.slug}.md` }))
      const checked = validateDetail(projected)
      if (!checked.valid) projectionProblems.push(`${program.slug}: ${checked.errorMessage}`)
    }
    assert.deepEqual(projectionProblems, [])

    // Cover each commission mode, verified/unverified terms, and all statuses.
    const samples = new Set([
      ...["percentage", "flat", "tiered", "hybrid", "unknown"].map((mode) => programs.find((p) => p.commission.mode === mode)),
      ...["active", "paused", "discontinued", "no_program"].map((status) => programs.find((p) => p.status === status)),
      programs.find((p) => p.verified),
      programs.find((p) => !p.verified),
      programs.find((p) => p.alsoOn?.affitor?.commission),
      programs.find((p) => p.aliases?.length),
      programs.find((p) => p.commission.currency === null),
      programs.find((p) => p.verified && p.approvalTime === null),
    ].filter((p) => p !== undefined))
    for (const status of ["active", "paused", "discontinued", "no_program"]) {
      assert.ok([...samples].some((p) => p.status === status), `Registry fixture missing ${status}`)
    }
    for (const program of samples) {
      const detail = await call("get_program", { slug: program.slug })
      validates(tool("get_program"), detail)
      const expected = JSON.parse(JSON.stringify({ ...apiProgram(program), markdownUrl: `https://openaffiliate.dev/programs/${program.slug}.md` }))
      assert.deepEqual(detail.structuredContent, expected)
      assert.deepEqual(textContent(detail), expected)
    }
    const aliased = programs.find((p) => p.aliases?.length)!
    assert.ok(aliased, "Registry fixture missing an alias")
    const aliasResult = await call("get_program", { slug: aliased.aliases![0] })
    validates(tool("get_program"), aliasResult)
    assert.equal(aliasResult.structuredContent!.slug, aliased.slug)

    const missing = await call("get_program", { slug: "__no_such_program_726a419__" })
    assert.equal(missing.isError, true)
    assert.equal(missing.structuredContent, undefined)
    assert.equal(missing.content[0].type, "text")
    assert.match(missing.content[0].text, /not found.*search_programs/)

    const listed = await call("list_categories")
    validates(tool("list_categories"), listed)
    const expectedCategories = categories.map((name) => ({ name, count: livePrograms.filter((p) => p.category === name).length }))
    assert.deepEqual(textContent(listed), expectedCategories)
    assert.deepEqual(listed.structuredContent, { categories: expectedCategories })

    const resources = await rpc("resources/list", {}, ListResourcesResultSchema)
    assert.deepEqual(resources.resources, [{
      name: "categories",
      title: "OpenAffiliate Categories",
      uri: "openaffiliate://categories",
      description: "All registry category names and active program counts, identical to list_categories. Use a name with search_programs to discover programs.",
      mimeType: "application/json",
    }])
    const resource = await rpc("resources/read", { uri: "openaffiliate://categories" }, ReadResourceResultSchema)
    assert.equal(resource.contents.length, 1)
    const contents = resource.contents[0]
    assert.equal(contents.uri, "openaffiliate://categories")
    assert.equal(contents.mimeType, "application/json")
    assert.ok("text" in contents)
    assert.deepEqual(JSON.parse(contents.text), expectedCategories)
    assert.deepEqual(JSON.parse(contents.text), textContent(listed))
  })
}

test("stdio mirrors server/tool titles and all four hints, with aligned patch versions", { timeout: 15_000 }, async (t) => {
  const manifest = JSON.parse(readFileSync("packages/mcp/package.json", "utf8"))
  const registry = JSON.parse(readFileSync("packages/mcp/server.json", "utf8"))
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"))
  assert.equal(manifest.version, "0.0.4")
  assert.equal(registry.version, manifest.version)
  assert.equal(registry.packages[0].version, manifest.version)
  assert.equal(lock.packages["packages/mcp"].version, manifest.version)

  const client = new Client({ name: "stdio-metadata-test", version: "1.0.0" })
  t.after(() => client.close())
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", resolve("packages/mcp/src/index.ts")],
    stderr: "pipe",
  }))
  assert.equal(client.getServerVersion()?.title, "OpenAffiliate")
  assert.equal(client.getServerVersion()?.version, manifest.version)
  const { tools } = await client.listTools()
  assert.deepEqual(tools.map((tool) => tool.name).sort(), Object.keys(TITLES).sort())
  for (const tool of tools) {
    assert.equal(tool.title, TITLES[tool.name as keyof typeof TITLES])
    assert.deepEqual(tool.annotations, HINTS)
  }
})
