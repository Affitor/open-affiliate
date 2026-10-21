/** npm run md:build first. Uses next start after CI builds; next dev locally. */
import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { spawn, type ChildProcess } from "node:child_process"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { createServer } from "node:net"
import { join } from "node:path"
import Ajv2020 from "ajv/dist/2020"
import { NextRequest } from "next/server"
import { GET as list } from "../src/app/api/programs/route"
import { GET as detail } from "../src/app/api/programs/[slug]/route"
import { GET as categories } from "../src/app/api/categories/route"
import { GET as specResponse } from "../src/app/openapi.json/route"
import { programs } from "../src/lib/programs"
import { openapi, operations } from "../src/lib/openapi"
import { negotiateMarkdown, wantsMarkdown } from "../src/lib/agentic-surface"
import paths from "../src/lib/agentic-paths.json"

const ajv = new Ajv2020({ strict: false, allErrors: true })
const validators = Object.fromEntries(Object.entries(openapi.components.schemas).map(([name, schema]) =>
  [name, ajv.compile({ ...schema, components: openapi.components })]
))
function validate(name: string, body: unknown) {
  assert.ok(validators[name](body), `${name}: ${JSON.stringify(validators[name].errors)}`)
}

let child: ChildProcess | undefined
let base = process.env.AGENTIC_TEST_URL ?? ""
let logs = ""
before(async () => {
  if (base) return
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  assert.ok(address && typeof address !== "string")
  const port = address.port
  await new Promise<void>((resolve) => server.close(() => resolve()))
  base = `http://127.0.0.1:${port}`
  const built = existsSync(".next/BUILD_ID")
  child = spawn(process.execPath, ["node_modules/next/dist/bin/next", built ? "start" : "dev", ...built ? [] : ["--webpack"], "--hostname", "127.0.0.1", "--port", String(port)], {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NEXT_PUBLIC_POSTHOG_KEY: "", NEXT_TELEMETRY_DISABLED: "1" },
  })
  child.stdout?.on("data", (data) => { logs = (logs + data.toString()).slice(-12000) })
  child.stderr?.on("data", (data) => { logs = (logs + data.toString()).slice(-12000) })
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next server exited: ${logs}`)
    try { if ((await fetch(`${base}/openapi.json`)).ok) return } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Next server did not start: ${logs}`)
})
after(() => {
  // Only terminate the process group this test spawned, including next dev's worker.
  if (child?.pid) { try { process.kill(-child.pid, "SIGTERM") } catch { /* already stopped */ } }
})
async function get(path: string, accept = "application/json") {
  return fetch(base + path, { headers: { Accept: accept }, signal: AbortSignal.timeout(90000) })
}

test("OpenAPI describes the three registry reads and the two submission operations", async () => {
  const spec = await specResponse().json()
  assert.equal(spec.openapi, "3.1.0")
  assert.deepEqual(Object.keys(spec.paths).sort(), ["/api/categories", "/api/programs", "/api/programs/{slug}", "/api/submissions", "/api/submissions/{id}"])
  const ids = new Set<string>()
  for (const { path, method, op } of operations()) {
    // POST /api/submissions is the one write.
    assert.equal(method, path === "/api/submissions" ? "post" : "get", path)
    assert.ok(op.summary && op.description)
    assert.ok(!ids.has(op.operationId))
    ids.add(op.operationId)
  }
  validate("CategoryList", await categories().json())
  const body = await list(new NextRequest("http://localhost/api/programs")).json()
  validate("ProgramSearch", body)
  assert.ok(body.programs.length > 100)
  for (const p of programs) {
    const response = await detail(new NextRequest(`http://localhost/api/programs/${p.slug}`), { params: Promise.resolve({ slug: p.slug }) })
    assert.equal(response.status, 200, p.slug)
    validate("Program", await response.json())
  }
  // Prove that schema validation catches a contract regression.
  assert.equal(validators.ProgramSearch({ ...body, total: "wrong type" }), false)
})

test("unknown query values are ignored (older clients keep working); unknown slugs have JSON errors", async () => {
  // Legacy values sent by published skills/CLIs: sort=top|trending|new|stars, verified=1.
  for (const query of ["limit=-1", "limit=1.5", "limit=1x", "limit=", "offset=NaN", "offset=-1", "verified=yes", "verified=1", "include_description=1", "sort=bad", "sort=top", "sort=trending", "sort=new", "sort=stars", "sort=constructor", "sort=__proto__", "sort=toString", "q=a&q=b"]) {
    const response = list(new NextRequest(`http://localhost/api/programs?${query}`))
    assert.equal(response.status, 200, query)
    validate("ProgramSearch", await response.json())
  }
  const legacyNew = await list(new NextRequest("http://localhost/api/programs?sort=new&limit=1")).json()
  assert.equal(legacyNew.filters.sort, "newest")
  for (const inherited of ["constructor", "__proto__", "toString"]) {
    const body = await list(new NextRequest(`http://localhost/api/programs?sort=${inherited}&limit=1`)).json()
    assert.equal(body.filters.sort, "relevance", inherited)
  }
  const missing = await detail(new NextRequest("http://localhost/api/programs/not-an-actual-program"), { params: Promise.resolve({ slug: "not-an-actual-program" }) })
  assert.equal(missing.status, 404)
  validate("Error", await missing.json())
  for (const query of ["limit=0&offset=0", "limit=501", "verified=false", "q=database&category=AI&type=recurring&include_description=true&sort=az&limit=2&offset=1", "utm_source=agent"]) {
    const response = list(new NextRequest(`http://localhost/api/programs?${query}`))
    assert.equal(response.status, 200, query)
    validate("ProgramSearch", await response.json())
  }
})

test("Accept negotiation honors q values and preserves normal browser headers", () => {
  for (const header of ["text/markdown", "TEXT/MARKDOWN", "text/markdown;q=1,text/html;q=0.5"]) assert.ok(wantsMarkdown(header), header)
  for (const header of ["", "*/*", "text/html", "text/markdown;q=0", "text/markdown;q=0.2,text/html;q=1", "text/html,text/markdown", "text/markdown;q=invalid"]) assert.equal(wantsMarkdown(header), false, header)
})

test("generated manifest covers all Markdown twins and current HTML routes", () => {
  function files(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)])
  }
  const markdown = files("public").filter((p) => p.endsWith(".md")).map((p) => p.slice("public".length)).sort()
  assert.equal(JSON.stringify(paths.markdown), JSON.stringify(markdown))
  assert.ok(paths.markdown.includes("/index.md"))
  const html = files("src/app").filter((p) => p.endsWith("/page.tsx")).map((p) => p.slice("src/app".length).replace(/\/page.tsx$/, "") || "/").sort()
  assert.deepEqual(paths.html, html)
  for (const twin of paths.markdown) {
    const path = twin === "/index.md" ? "/" : twin.slice(0, -3)
    const response = negotiateMarkdown(new NextRequest("http://localhost" + path, { headers: { Accept: "text/markdown" } }))
    assert.equal(new URL(response.headers.get("x-middleware-rewrite")!).pathname, twin)
    assert.match(response.headers.get("vary") ?? "", /Accept/i)
  }
})

test("live HTTP responses conform to published OpenAPI with either Accept header", async () => {
  const liveSpec = await (await get("/openapi.json")).json()
  assert.deepEqual(liveSpec, openapi)
  for (const accept of ["text/html", "text/markdown"]) {
    for (const [path, schema] of [["/api/programs?limit=2&sort=az", "ProgramSearch"], ["/api/programs/vercel", "Program"], ["/api/categories", "CategoryList"]]) {
      const response = await get(path, accept)
      assert.equal(response.status, 200)
      assert.match(response.headers.get("content-type") ?? "", /application\/json/)
      validate(schema, await response.json())
    }
    for (const [path, status] of [["/api/programs/not-an-actual-program", 404], ["/api/does-not-exist", 404], ["/api/programs/vercel/unknown", 404]]) {
      const response = await get(String(path), accept)
      assert.equal(response.status, status)
      assert.match(response.headers.get("content-type") ?? "", /application\/json/)
      validate("Error", await response.json())
    }
  }
})

test("HTTP Markdown negotiation matches generated twins; HTML remains HTML", async () => {
  const samples = ["/", "/programs/vercel", "/categories/ai", "/networks/impact", "/programs", "/rankings", "/changelog", "/docs", "/best"]
  for (const path of samples) {
    const markdown = await get(path, "text/markdown")
    assert.equal(markdown.status, 200, path)
    assert.match(markdown.headers.get("content-type") ?? "", /^text\/markdown/)
    assert.match(markdown.headers.get("vary") ?? "", /\bAccept\b/i)
    const twin = path === "/" ? "/index.md" : path + ".md"
    assert.equal(await markdown.text(), readFileSync("public" + twin, "utf8"), path)
    const html = await get(path, "text/html")
    assert.equal(html.status, 200, path)
    assert.match(html.headers.get("content-type") ?? "", /^text\/html/)
    assert.match(await html.text(), /<!DOCTYPE html>/i)
  }
  // The brief requires Vary: Accept on Markdown and unchanged HTML. Vercel
  // prerendered HTML retains its RSC Vary keys; Accept is already a CDN key:
  // https://vercel.com/docs/caching/cdn-cache#use-cases
  for (const accept of ["text/html", "text/markdown", "text/html", "text/markdown"]) {
    const response = await get("/", accept)
    assert.equal(response.status, 200)
    assert.ok(response.headers.get("content-type")?.startsWith(accept))
    const body = await response.text()
    if (accept === "text/markdown") {
      assert.match(response.headers.get("vary") ?? "", /\bAccept\b/i)
      assert.equal(body, readFileSync("public/index.md", "utf8"))
    } else {
      assert.match(body, /<!DOCTYPE html>/i)
    }
  }
  const index = await get("/index.md", "text/html")
  assert.equal(index.status, 200)
  assert.match(index.headers.get("content-type") ?? "", /^text\/markdown/)
  assert.equal(await index.text(), readFileSync("public/index.md", "utf8"))
  const about = await get("/about", "text/markdown")
  assert.equal(about.status, 200)
  assert.match(about.headers.get("content-type") ?? "", /^text\/html/)
  const head = await fetch(base + "/", { method: "HEAD", headers: { Accept: "text/markdown" } })
  assert.equal(head.status, 200)
  assert.match(head.headers.get("content-type") ?? "", /^text\/markdown/)
  assert.equal(await head.text(), "")
  const htmlPreferred = await get("/", "text/html,text/markdown;q=0.5")
  assert.match(htmlPreferred.headers.get("content-type") ?? "", /^text\/html/)
})

test("HTTP missing pages return Markdown 404s with discovery links", async () => {
  for (const path of ["/__agentic-missing", "/__agentic-missing.json", "/programs/not-an-actual-program", "/categories/not-an-actual-category", "/networks/not-an-actual-network", "/programs/not-an-actual-program.md", "/unknown/nested/path"]) {
    const response = await get(path, "text/markdown")
    assert.equal(response.status, 404, path)
    assert.match(response.headers.get("content-type") ?? "", /^text\/markdown/)
    assert.match(response.headers.get("vary") ?? "", /\bAccept\b/i)
    const body = await response.text()
    assert.ok(body.length >= 20)
    assert.match(body, /\]\(\/llms.txt\)/)
    assert.match(body, /\]\(\/sitemap.xml\)/)
  }
  const response = await get("/__agentic-missing", "text/html")
  assert.equal(response.status, 404)
  assert.match(response.headers.get("content-type") ?? "", /^text\/html/)
})

test("llms.txt names concrete jobs and links OpenAPI, MCP, REST and Markdown", async () => {
  const response = await get("/llms.txt")
  assert.equal(response.status, 200)
  const body = await response.text()
  for (const text of ["## When to use OpenAffiliate", "compare commission, cookie and payout", "agentPrompt", "Cite its program page", "/mcp", "/api/programs", "/api/categories", "/openapi.json", "/index.md"]) assert.ok(body.includes(text), text)
  assert.match(readFileSync("src/app/docs/api/page.tsx", "utf8"), /href="\/openapi.json"/)
})
