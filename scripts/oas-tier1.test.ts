import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import {
  cwv, distribution, hasPrice, hasTrial, loadProgram, p6Check, politeGet, PSI_GAP_MS, psiSlot, scanIsolated, searchVolumes, seoKeyword, pricingLink, readCache, readCapped, robotsAllows, runPsi, scanProgram,
  selfServe, termsLink, tier1Score, setFetcher, visibleText, type Result,
} from "./oas-tier1"

/** A stub network: answers by URL, records every request, and follows redirects itself unless asked not to, like fetch. */
function network(routes: Record<string, () => Response>) {
  const requested: string[] = []
  const stub = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    requested.push(url)
    const route = Object.entries(routes).find(([prefix]) => url === prefix || (prefix.endsWith("/") && url.startsWith(prefix) && prefix.includes("googleapis")))
    const res = route ? route[1]() : new Response("", { status: 404 })
    const location = res.headers.get("location")
    return [301, 302, 303, 307, 308].includes(res.status) && location && init?.redirect !== "manual" ? stub(new URL(location, url).href, init) : res
  }
  setFetcher(stub as typeof fetch)
  return requested
}
const html = (body: string, status = 200) => () => new Response(body, { status, headers: { "content-type": "text/html" } })
const redirect = (to: string) => () => new Response(null, { status: 301, headers: { location: to } })

test("robots.txt: RFC 9309 groups, precedence, wildcards and percent-encoding", () => {
  const robots = "User-agent: *\nDisallow: /\n\nUser-agent: OpenAffiliate\nDisallow: /private\nAllow: /private/pricing\nDisallow: /*.pdf$\nDisallow: /café\n"
  assert.equal(robotsAllows(robots, "/pricing"), true)
  assert.equal(robotsAllows(robots, "/private/x"), false)
  assert.equal(robotsAllows(robots, "/%70rivate/x"), false, "an encoded unreserved character is the same path")
  assert.equal(robotsAllows(robots, "/caf%C3%A9"), false, "a non-ASCII rule matches its UTF-8 encoding")
  assert.equal(robotsAllows(robots, "/caf%c3%a9"), false, "hex case does not matter")
  assert.equal(robotsAllows(robots, "/private/pricing"), true)
  assert.equal(robotsAllows(robots, "/a.pdf"), false)
  assert.equal(robotsAllows(robots, "/a.pdf?x"), true)
  assert.equal(robotsAllows(robots, "/pricing", "somebot"), false, "others fall back to *")
  assert.equal(robotsAllows("User-agent: Affiliate\nAllow: /\n\nUser-agent: *\nDisallow: /\n", "/x"), false, "a group for another token that is a substring does not apply")
  assert.equal(robotsAllows("User-agent: OpenAffiliate/1.0\nDisallow: /x\n", "/x"), false, "the product token ignores a version")
  assert.equal(robotsAllows("User-agent: *\rDisallow: /x\r", "/x"), false, "CR-only line endings")
  assert.equal(robotsAllows("User-agent: other\nSitemap: https://b.com/s.xml\nUser-agent: openaffiliate\nDisallow: /x\n", "/x"), false, "Sitemap does not split a group")
  assert.equal(robotsAllows("User-agent: *\nDisallow:\n", "/"), true, "empty Disallow allows")
  assert.equal(robotsAllows("", "/"), true)
  assert.equal(robotsAllows("User-agent: *\nDisallow: /a\nAllow: /a\n", "/a"), true, "Allow wins a tie")
  assert.equal(robotsAllows("User-agent: *\nDisallow: /*/edit$\n", "/docs/x/edit"), false)
  assert.equal(robotsAllows("User-agent: *\nDisallow: /*/edit$\n", "/docs/x/edit/more"), true)
  assert.equal(robotsAllows("User-agent: *\nDisallow: /*.php*q=\n", "/a/b.php?x=1&q=2"), false)
})

test("visible text drops script blocks in one pass, even when they never close", () => {
  assert.equal(visibleText(`a<script>var p = "$9"</script>b<STYLE>x{}</STYLE>c<svg><text>d</text></svg>e`).replace(/\s/g, ""), "abce")
  assert.equal(visibleText("a<script>never closed $9").trim(), "a")
  const started = performance.now()
  visibleText("<script".repeat(200_000))
  assert.ok(performance.now() - started < 500, `took ${Math.round(performance.now() - started)}ms`)
})

test("robots.txt keeps Unicode in values and parses hostile lines in linear time", () => {
  assert.equal(robotsAllows("User-agent: *\nDisallow: /\u2028private\n", "/%E2%80%A8private"), false, "U+2028 in a rule")
  assert.equal(robotsAllows("User-agent: *\nDisallow:\t /x \t\n", "/x"), false, "SP and HTAB around a value")
  const started = performance.now()
  robotsAllows("User-agent: *\nDisallow:" + " ".repeat(400_000) + "x\u2028y\n", "/x")
  assert.ok(performance.now() - started < 500, `took ${Math.round(performance.now() - started)}ms`)
})

test("each program runs in its own process with a hard time limit", async () => {
  // 192.0.2.1 is TEST-NET-1 (RFC 5737): nothing answers, so the scan can only end by the limit.
  const started = Date.now()
  const { result } = await scanIsolated({ slug: "hang", url: "https://192.0.2.1/" }, { scan: true, psi: false }, 1500)
  assert.ok(Date.now() - started < 5000)
  assert.equal(result.slug, "hang")
  for (const check of Object.values(result.checks)) assert.match(check.evidence!, /timed out after 1\.5s/)
})

test("robots wildcards match in bounded time (no regex backtracking)", () => {
  const robots = "User-agent: *\nDisallow: /" + "*a".repeat(24) + "b\n"
  const started = performance.now()
  assert.equal(robotsAllows(robots, "/" + "a".repeat(60)), true)
  assert.equal(robotsAllows(robots, "/" + "a".repeat(60) + "b"), false)
  assert.ok(performance.now() - started < 50, `took ${Math.round(performance.now() - started)}ms`)
})

test("a robots.txt redirect to a blocked host is never requested; the site counts as unreachable", async () => {
  const requested = network({ "https://brand.test/robots.txt": redirect("https://partnerstack.com/robots.txt"), "https://brand.test/": html("<p>hi</p>") })
  assert.deepEqual(await politeGet("https://brand.test/"), { refused: "robots.txt unreachable" })
  assert.ok(!requested.some((u) => u.includes("partnerstack.com")), requested.join(", "))
  assert.ok(!requested.includes("https://brand.test/"), "the page itself is not requested either")
})

test("a page redirect to a blocked host stops before the request", async () => {
  const requested = network({ "https://brand.test/robots.txt": html(""), "https://brand.test/go": redirect("https://app.partnerstack.com/x") })
  assert.match(JSON.stringify(await politeGet("https://brand.test/go")), /blocked host \(partnerstack\.com\)/)
  assert.ok(!requested.some((u) => u.includes("partnerstack.com")))
})

test("bodies are read up to the cap, even when the server never stops sending", async () => {
  let sent = 0
  const endless = new ReadableStream<Uint8Array>({ pull(c) { sent += 65536; c.enqueue(new Uint8Array(65536).fill(97)) } })
  const { text, truncated } = await readCapped(new Response(endless), 200_000)
  assert.equal(text.length, 200_000)
  assert.equal(truncated, true)
  assert.ok(sent < 400_000, `stopped reading after ${sent} bytes`)
  assert.deepEqual(await readCapped(new Response("abc"), 3), { text: "abc", truncated: false }, "exactly the cap is not truncated")
})

test("a robots.txt past the parse limit fails closed, whatever its line endings", async () => {
  const head = "User-agent: *\nDisallow: /private\n"
  const cut = "Allow: /private"
  const bodies = [
    head + "#".repeat(512_000 - head.length - cut.length - 1) + "\n" + cut + "/public\n", // cut inside an Allow
    "User-agent: *\rDisallow: /\r#" + "x".repeat(512_000), // CR-only, cut inside a comment
  ]
  for (const body of bodies) {
    const requested = network({ "https://brand.test/robots.txt": html(body), "https://brand.test/private/secret": html("secret") })
    assert.deepEqual(await politeGet("https://brand.test/private/secret"), { refused: "robots.txt unreachable" })
    assert.ok(!requested.includes("https://brand.test/private/secret"))
  }
})

test("PageSpeed re-checks access first: a cached result never authorises a request", async () => {
  const psi = "https://www.googleapis.com/"
  const r = { slug: "x", network: "n", checkedAt: "", checks: { P1: { state: "met" as const }, P5: { state: "unknown" as const, evidence: "PageSpeed not run" } } }
  const blocked = network({ [psi]: () => Response.json({}) })
  await runPsi({ slug: "x", url: "https://partnerstack.com/brand" }, r)
  assert.equal(r.checks.P5.state, "unknown")
  assert.ok(!blocked.some((u) => u.includes("googleapis.com")), "no PageSpeed call for a blocked host")
  const disallowed = network({ "https://brand.test/robots.txt": html("User-agent: *\nDisallow: /\n"), [psi]: () => Response.json({}) })
  await runPsi({ slug: "y", url: "https://brand.test/" }, r)
  assert.ok(!disallowed.some((u) => u.includes("googleapis.com")), "no PageSpeed call for a robots-disallowed page")
  const allowed = network({ "https://brand.test/robots.txt": html(""), "https://brand.test/": html("ok"), [psi]: () => Response.json({}) })
  await runPsi({ slug: "z", url: "https://brand.test/" }, r)
  assert.ok(allowed.some((u) => u.startsWith(psi) && u.includes(encodeURIComponent("https://brand.test/"))), allowed.join(", "))
  // The API itself is never followed through a redirect.
  const bounced = network({ "https://brand.test/robots.txt": html(""), "https://brand.test/": html("ok"), [psi]: redirect("https://partnerstack.com/api-redirect") })
  await runPsi({ slug: "w", url: "https://brand.test/" }, r)
  assert.ok(!bounced.some((u) => u.includes("partnerstack.com")), bounced.join(", "))
  assert.match(r.checks.P5.evidence!, /PageSpeed redirected/)
})

test("PageSpeed waits for the run's pace before each call", async () => {
  const psi = "https://www.googleapis.com/"
  const r = { slug: "x", network: "n", checkedAt: "", checks: { P5: { state: "unknown" as const, evidence: "PageSpeed not run" } } }
  const requested = network({ "https://brand.test/robots.txt": html(""), "https://brand.test/": html("ok"), [psi]: () => Response.json({}) })
  let release!: () => void
  const held = runPsi({ slug: "x", url: "https://brand.test/" }, r, () => new Promise<void>((resolve) => { release = resolve }))
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.ok(!requested.some((u) => u.startsWith(psi)), "no PageSpeed call before the permit")
  release()
  await held
  assert.ok(requested.some((u) => u.startsWith(psi)), "the call follows the permit")
})

test("PageSpeed slots stay a full gap apart, even when the event loop stalls", async () => {
  const grants: number[] = []
  const slots = [0, 1, 2].map(() => psiSlot().then(() => grants.push(Date.now())))
  const stall = Date.now() + 2500
  while (Date.now() < stall) { /* block the event loop past every planned deadline */ }
  await Promise.all(slots)
  for (let i = 1; i < grants.length; i++) assert.ok(grants[i] - grants[i - 1] >= PSI_GAP_MS, JSON.stringify(grants))
})

test("an unreadable pricing page leaves its negative checks unknown; an absent one is a reading", async () => {
  const home = `<a href="/about">About</a>`
  network({ "https://brand.test/robots.txt": html("User-agent: *\nDisallow: /pricing\n"), "https://brand.test/": html(home) })
  const refused = await scanProgram({ slug: "b", url: "https://brand.test/" })
  for (const id of ["P1", "P2", "P3"]) assert.equal(refused.checks[id].state, "unknown", id)
  assert.match(refused.checks.P1.evidence!, /robots\.txt disallows/)
  network({ "https://brand.test/robots.txt": html(""), "https://brand.test/pricing": html("", 404), "https://brand.test/": html(home) })
  const absent = await scanProgram({ slug: "b", url: "https://brand.test/" })
  assert.equal(absent.checks.P1.state, "not_met")
  network({ "https://brand.test/robots.txt": html(""), "https://brand.test/pricing": html("", 503), "https://brand.test/": html(`<p>Pro $29/mo</p>`) })
  const homePrice = await scanProgram({ slug: "b", url: "https://brand.test/" })
  assert.equal(homePrice.checks.P1.state, "met", "a positive reading still counts")
  assert.equal(homePrice.checks.P2.state, "unknown")
})

test("a page longer than the read limit: what was read counts, a miss is unknown", async () => {
  const pad = "<p>" + "x".repeat(1_500_100) + "</p>"
  network({
    "https://brand.test/robots.txt": html(""), "https://brand.test/pricing": html("", 404),
    "https://brand.test/": html(`<p>Pro $29/mo</p>${pad}<p>14-day free trial</p><a href="/signup">Sign up</a>`),
    "https://brand.test/affiliates": html(`${pad}<a href="/affiliate-terms">Affiliate terms</a>`),
  })
  const { checks } = await scanProgram({ slug: "b", url: "https://brand.test/", signup_url: "https://brand.test/affiliates" })
  assert.equal(checks.P1.state, "met", "found before the cut")
  for (const id of ["P2", "P3", "A2"]) assert.equal(checks[id].state, "unknown", id)
  assert.match(checks.P2.evidence!, /longer than the read limit/)
})

test("program page: live, gone, bot-protected, soft 404, or bounced to the homepage", async () => {
  const run = async (routes: Record<string, () => Response>) => {
    network({ "https://brand.test/robots.txt": html(""), ...routes })
    return (await scanProgram({ slug: "b", signup_url: "https://brand.test/affiliates" })).checks
  }
  assert.equal((await run({ "https://brand.test/affiliates": html(`<a href="/affiliate-terms">Terms</a>`) })).A2.state, "met")
  assert.equal((await run({ "https://brand.test/affiliates": html("", 404) })).A1.state, "not_met")
  assert.equal((await run({ "https://brand.test/affiliates": html("", 403) })).A1.state, "unknown")
  assert.equal((await run({ "https://brand.test/affiliates": html("<title>Page not found</title>") })).A1.state, "not_met")
  const bounced = await run({ "https://brand.test/affiliates": redirect("https://brand.test/"), "https://brand.test/": html("home") })
  assert.equal(bounced.A1.state, "unknown")
})

test("brand-page readers", () => {
  const home = `<nav><a href="/pricing">Pricing</a><a href="https://other.com/pricing">x</a><a href="/signup">Start free</a></nav>
    <script>var x = "$99"</script><p>Try it free for 14 days</p>`
  assert.equal(pricingLink(home, "https://www.brand.com/"), "https://www.brand.com/pricing")
  assert.equal(pricingLink(`<a href="/plans/">Plans</a>`, "https://brand.com"), "https://brand.com/plans/")
  assert.equal(pricingLink(`<a href="https://other.com/pricing">Pricing</a>`, "https://brand.com"), null, "other sites do not count")
  assert.equal(pricingLink(`<a href="/pricing/enterprise">Enterprise</a><a href="/pricing">Pricing</a>`, "https://brand.com"), "https://brand.com/pricing")
  assert.equal(hasPrice(visibleText(home)), null, "prices inside scripts do not count")
  assert.ok(hasPrice("Pro $29/mo billed yearly"))
  assert.ok(hasPrice("Team 49 EUR per seat"))
  assert.equal(hasPrice("Contact sales for a quote"), null)
  assert.equal(hasPrice("Save over $100 a year with annual billing"), null, "a saving is not a price")
  assert.equal(hasPrice("Free $0 forever"), null, "only a non-zero amount is a published price")
  assert.ok(hasPrice("Save 20%. Pro $12/mo"), "the real price after a saving still counts")
  assert.ok(hasPrice("", `<script type="application/ld+json">{"offers":{"price":"29","priceCurrency":"USD"}}</script>`))
  assert.equal(hasPrice("", `<script type="application/ld+json">{"offers":{"price":"0","priceCurrency":"USD"}}</script>`), null)
  assert.equal(hasTrial("Start your 14-day free trial"), "14-day free trial")
  assert.ok(hasTrial(visibleText(home)))
  assert.equal(hasTrial("Book a demo"), null)
  assert.equal(hasTrial("There is no free trial."), null, "negated")
  assert.ok(hasTrial("Hobby Free $0 /month"), "a $0 plan is a free plan")
  assert.ok(selfServe(home, "https://brand.com"))
  assert.equal(selfServe(`<a href="/demo">Book a demo</a><a href="/contact">Contact sales</a>`, "https://brand.com"), null)
  assert.equal(selfServe(`<a href="/demo">Get started</a>`, "https://brand.com"), null, "a demo link is not self-serve")
  assert.equal(selfServe(`<a href="https://zoom.us/webinar/register/1">Register</a>`, "https://brand.com"), null, "event registration")
  assert.equal(selfServe(`<a href="/newsletter">Sign up for our newsletter</a>`, "https://brand.com"), null)
  assert.ok(selfServe(`<a href="https://app.brand.com/register">Create account</a>`, "https://brand.com"), "the app subdomain counts")
})

test("program-page terms: a qualifying link or published terms, not a mention", () => {
  assert.ok(termsLink(`<a href="/affiliate-terms">Read the terms</a>`, "https://brand.com"))
  assert.ok(termsLink(`<a href="/legal">Partner Program Agreement</a>`, "https://brand.com"))
  assert.ok(termsLink(`<h2>Affiliate program terms</h2><p>Earn 30% commission, 60-day cookie.</p>`, "https://brand.com"))
  assert.equal(termsLink(`<p>Affiliate program terms are coming soon. 30% commission.</p>`, "https://brand.com"), null, "an announcement is not terms")
  assert.equal(termsLink(`<h2>Affiliate program terms</h2><p>Join today!</p>`, "https://brand.com"), null, "a heading without terms")
  assert.equal(termsLink(`<a href="/terms">Terms of Service</a><a href="/privacy">Privacy</a>`, "https://brand.com"), null)
  assert.equal(termsLink(`<a href="/%E0%A4%A">Broken</a>`, "https://brand.com"), null, "a malformed escape does not throw")
})

test("Core Web Vitals: field failures decide, complete good field data passes, otherwise lab", () => {
  const field = (metrics: Record<string, string>) => ({ loadingExperience: { metrics: Object.fromEntries(Object.entries(metrics).map(([k, v]) => [k, { category: v }])) } })
  const all = (lcp: string) => field({ LARGEST_CONTENTFUL_PAINT_MS: lcp, INTERACTION_TO_NEXT_PAINT: "FAST", CUMULATIVE_LAYOUT_SHIFT_SCORE: "FAST" })
  const lab = (lcp: number) => ({ lighthouseResult: { audits: { "largest-contentful-paint": { numericValue: lcp }, "cumulative-layout-shift": { numericValue: 0.05 }, "total-blocking-time": { numericValue: 150 } } } })
  assert.equal(cwv(all("FAST")).state, "met")
  assert.equal(cwv(all("AVERAGE")).state, "not_met")
  assert.equal(cwv({ ...field({ LARGEST_CONTENTFUL_PAINT_MS: "SLOW" }), ...lab(1000) }).state, "not_met", "a partial field failure is not overridden by good lab")
  assert.equal(cwv({ ...field({ LARGEST_CONTENTFUL_PAINT_MS: "FAST" }), ...lab(4000) }).state, "not_met", "partial good field falls back to lab")
  assert.equal(cwv(lab(2400)).state, "met")
  assert.equal(cwv({}).state, "unknown")
})

test("a corrupt or foreign cache file is rescanned, not trusted", () => {
  const dir = mkdtempSync(join(tmpdir(), "tier1-"))
  try {
    const file = join(dir, "x.json")
    writeFileSync(file, "{")
    assert.equal(readCache(file, "x"), null)
    writeFileSync(file, JSON.stringify({ slug: "other", checks: {} }))
    assert.equal(readCache(file, "x"), null)
    const ok = { slug: "x", network: "n", checkedAt: "", checks: Object.fromEntries(["P1", "P2", "P3", "P5", "P6", "A1", "A2"].map((id) => [id, { state: "unknown" }])) }
    writeFileSync(file, JSON.stringify(ok))
    assert.deepEqual(readCache(file, "x"), ok)
    // Extra or malformed entries never reach the report.
    writeFileSync(file, JSON.stringify({ ...ok, network: 7, checks: { ...ok.checks, extra: null, P1: { state: "met", evidence: { x: 1 } } } }))
    const cached = readCache(file, "x")!
    assert.deepEqual(Object.keys(cached.checks), ["P1", "P2", "P3", "P5", "P6", "A1", "A2"])
    assert.deepEqual(cached.checks.P1, { state: "met" })
    assert.equal(cached.network, "unknown")
    assert.doesNotThrow(() => distribution([cached]))
    // A broken program file is reported, not fatal.
    writeFileSync(join(dir, "bad.yaml"), "slug: [unclosed")
    assert.match(JSON.stringify(loadProgram(join(dir, "bad.yaml"))), /"slug":"bad","error":"program file unreadable/)
    writeFileSync(join(dir, "good.yaml"), "slug: good\nurl: https://good.test\ncommission: {rate: 30%}\n")
    assert.deepEqual(loadProgram(join(dir, "good.yaml")), { slug: "good", name: null, url: "https://good.test", signup_url: null, network: null })
    // A cyclic or odd shape never leaves loadProgram: only the four text fields do.
    writeFileSync(join(dir, "cyclic.yaml"), "slug: cyclic\nnetwork: &n {nested: *n}\nurl: [1, 2]\n")
    const cyclic = loadProgram(join(dir, "cyclic.yaml"))
    assert.deepEqual(cyclic, { slug: "cyclic", name: null, url: null, signup_url: null, network: null })
    assert.doesNotThrow(() => JSON.stringify(cyclic))
    writeFileSync(join(dir, "mismatch.yaml"), "slug: other\n")
    assert.match(JSON.stringify(loadProgram(join(dir, "mismatch.yaml"))), /does not match/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("P6: brand names become valid Google Ads keywords", () => {
  assert.equal(seoKeyword("Vercel (v0)"), "vercel")
  assert.equal(seoKeyword("Café Société!"), "cafe societe")
  assert.equal(seoKeyword("Monday.com"), "monday.com")
  assert.equal(seoKeyword("🚀 ✨"), null)
  assert.equal(seoKeyword(null), null)
  assert.equal(seoKeyword(Array(15).fill("word").join(" "))!.split(" ").length, 10)
  assert.ok(seoKeyword("x".repeat(200))!.length <= 80)
  assert.equal(p6Check("vercel", 90500).state, "met")
  assert.equal(p6Check("tiny", 0).state, "not_met")
  assert.equal(p6Check("none", null).state, "not_met")
})

test("P6: batches of 1,000, real cost logged, and the cap counts every request at least at the reservation", async () => {
  const bodies: { keywords: string[] }[][] = []
  let reply: (keywords: string[]) => Response = () => new Response("", { status: 500 })
  setFetcher((async (_url: string, init?: RequestInit) => {
    assert.equal(init?.method, "POST")
    assert.equal(init?.redirect, "manual")
    assert.match(String((init?.headers as Record<string, string>).Authorization), /^Basic /)
    const body = JSON.parse(String(init?.body)) as { keywords: string[] }[]
    bodies.push(body)
    return reply(body[0].keywords)
  }) as typeof fetch)
  const ok = (cost: unknown, rows: (k: string, i: number) => object) => (keywords: string[]) =>
    Response.json({ status_code: 20000, cost, tasks: [{ cost, status_code: 20000, result: keywords.map(rows) }] })
  const keywords = Array.from({ length: 1500 }, (_, i) => `brand ${i}`)

  reply = ok(0.09, (k, i) => ({ keyword: k.toUpperCase(), search_volume: i % 2 ? 50 : null }))
  const all = await searchVolumes([...keywords, "brand 1"], "eA==", 1)
  assert.deepEqual(bodies.map((b) => b[0].keywords.length), [1000, 500], "duplicates sent once, 1,000 per request")
  assert.equal(all.stopped, null)
  assert.deepEqual(all.costs.map((c) => c.costUsd), [0.09, 0.09], "the real reported cost is logged")
  assert.equal(all.volumes.get("brand 1"), 50)
  assert.equal(all.volumes.get("brand 0"), null, "an explicit null is a reading")

  // At most floor(cap / reservation) requests, whatever each one reports.
  for (const cost of [0.15, 0.09, 0]) {
    bodies.length = 0
    reply = ok(cost, (k) => ({ keyword: k, search_volume: 10 }))
    const many = await searchVolumes(Array.from({ length: 10_000 }, (_, i) => `k${i}`), "eA==", 1)
    assert.equal(bodies.length, 6, `6 × $0.15 = $0.90; a 7th could pass $1 (reported $${cost})`)
    assert.match(many.stopped!, /cap/)
  }

  // Failed requests and invalid costs (at either level) still count the full reservation.
  const failedWithCost = (cost: unknown) => () => Response.json({ status_code: 40000, cost, tasks: [{ cost, status_code: 40000 }] })
  for (const bad of [
    () => new Response("oops", { status: 500 }), ok("free", () => ({})), ok(undefined, () => ({})), ok(-5, () => ({})),
    ok(false, () => ({})), ok("", () => ({})), ok(null, () => ({})), failedWithCost(0), () => Response.json({ status_code: 20000, cost: 0, tasks: [{ cost: 0, status_code: 20000 }] }, { status: 503 }),
    (ks: string[]) => Response.json({ status_code: 20000, cost: "2", tasks: [{ cost: 0, status_code: 20000, result: ks.map((k) => ({ keyword: k, search_volume: 1 })) }] }),
    (ks: string[]) => Response.json({ status_code: 20000, cost: 0, tasks: [{ cost: "2", status_code: 20000, result: ks.map((k) => ({ keyword: k, search_volume: 1 })) }] }),
  ]) {
    bodies.length = 0
    reply = bad
    await searchVolumes(Array.from({ length: 10_000 }, (_, i) => `k${i}`), "eA==", 1)
    assert.equal(bodies.length, 6, "counted at the reservation")
  }
  reply = ok("free", () => ({}))
  assert.ok((await searchVolumes(["a"], "eA==", 1)).costs.every((c) => c.costUsd === null), "an invalid cost is logged as null, not $0")

  // A cost above the reservation means the price changed: stop there.
  bodies.length = 0
  reply = ok(2, (k) => ({ keyword: k, search_volume: 10 }))
  const pricey = await searchVolumes(keywords, "eA==", 1)
  assert.equal(bodies.length, 1)
  assert.match(pricey.stopped!, /price changed/)
  // A price above the reservation is not hidden by a garbled or null figure at the other level.
  for (const [top, inner] of [[2, "free"], ["free", 2], [2, null], [null, 2]]) {
    bodies.length = 0
    reply = (ks) => Response.json({ status_code: 20000, cost: top, tasks: [{ cost: inner, status_code: 20000, result: ks.map((k) => ({ keyword: k, search_volume: 1 })) }] })
    const mixed = await searchVolumes(Array.from({ length: 10_000 }, (_, i) => `k${i}`), "eA==", 1)
    assert.equal(bodies.length, 1, `stops after the first request (${top}, ${inner})`)
    assert.match(mixed.stopped!, /price changed: \$2/)
  }
  // A request-level price above the reservation is not hidden by a task-level 0.
  bodies.length = 0
  reply = (ks) => Response.json({ status_code: 20000, cost: 2, tasks: [{ cost: 0, status_code: 20000, result: ks.map((k) => ({ keyword: k, search_volume: 10 })) }] })
  const hidden = await searchVolumes(keywords, "eA==", 1)
  assert.equal(bodies.length, 1)
  assert.match(hidden.stopped!, /price changed/)
  bodies.length = 0
  assert.equal((await searchVolumes(keywords, "eA==", 0.1)).costs.length, 0, "no request when one could exceed the cap")
})

test("P6: only an explicit null or a finite non-negative volume from a successful response counts", async () => {
  const run = async (status: number, top: number, task: number, rows: object[]) => {
    setFetcher((async () => Response.json({ status_code: top, cost: 0.09, tasks: [{ cost: 0.09, status_code: task, result: rows }] }, { status })) as typeof fetch)
    return (await searchVolumes(["a", "b", "c", "d", "e"], "eA==", 1)).volumes
  }
  const rows = [{ keyword: "a", search_volume: 20 }, { keyword: "b", search_volume: null }, { keyword: "c" }, { keyword: "d", search_volume: "invalid" }, { keyword: "e", search_volume: -1 }]
  const v = await run(200, 20000, 20000, rows)
  assert.deepEqual([...v.entries()], [["a", 20], ["b", null]], "missing, non-numeric and negative volumes stay unknown")
  assert.equal((await run(500, 20000, 20000, rows)).size, 0, "HTTP failure")
  assert.equal((await run(200, 40000, 20000, rows)).size, 0, "request-level error")
  assert.equal((await run(200, 20000, 40501, rows)).size, 0, "task-level error")
})

test("dry-run score ignores unknown checks and needs four determined ones", () => {
  const r = (states: string[]): Result => ({ slug: "x", network: "n", checkedAt: "", checks: Object.fromEntries(states.map((s, i) => [`C${i}`, { state: s as "met" }])) })
  assert.equal(tier1Score(r(["met", "met", "not_met", "met", "unknown"])), 75)
  assert.equal(tier1Score(r(["met", "met", "unknown", "unknown"])), null)
  assert.match(distribution([r(["met", "met", "met", "met"])]), /\| n \| 1 \| 1 \| 100\.0 \|/)
})
