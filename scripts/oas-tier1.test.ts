import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import {
  cwv, distribution, hasPrice, hasTrial, politeGet, pricingLink, readCache, readCapped, robotsAllows, runPsi, scanProgram,
  selfServe, termsLink, tier1Score, setFetcher, visibleText, type Result,
} from "./oas-tier1"

/** A stub network: answers by URL and records every request it receives. */
function network(routes: Record<string, () => Response>) {
  const requested: string[] = []
  setFetcher((async (input: string | URL | Request) => {
    const url = String(input)
    requested.push(url)
    const route = Object.entries(routes).find(([prefix]) => url === prefix || (prefix.endsWith("/") && url.startsWith(prefix) && prefix.includes("googleapis")))
    return route ? route[1]() : new Response("", { status: 404 })
  }) as typeof fetch)
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
  const text = await readCapped(new Response(endless), 200_000)
  assert.equal(text.length, 200_000)
  assert.ok(sent < 400_000, `stopped reading after ${sent} bytes`)
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
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("dry-run score ignores unknown checks and needs four determined ones", () => {
  const r = (states: string[]): Result => ({ slug: "x", network: "n", checkedAt: "", checks: Object.fromEntries(states.map((s, i) => [`C${i}`, { state: s as "met" }])) })
  assert.equal(tier1Score(r(["met", "met", "not_met", "met", "unknown"])), 75)
  assert.equal(tier1Score(r(["met", "met", "unknown", "unknown"])), null)
  assert.match(distribution([r(["met", "met", "met", "met"])]), /\| n \| 1 \| 1 \| 100\.0 \|/)
})
