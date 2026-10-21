import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import {
  cwv, distribution, hasPrice, hasTrial, loadProgram, p6Check, refreshP6, seoQuery, politeGet, PSI_GAP_MS, psiSlot, scanIsolated, searchVolumes, seoKeyword, pricingLink, readCache, readCapped, robotsAllows, runPsi, scanProgram,
  discover, discoverIsolated, discoveryCandidates, titleOf, recordingFetcher, replayFetcher, runOptions, withDiscovered, selfServe, termsLink, tier1Score, setFetcher, visibleText, type Result,
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

test("phase 2 cannot erase phase 1: a stalled discovery returns nothing and every reading stands", async () => {
  const phase1: Result = { slug: "x", network: "in-house", checkedAt: "", checks: {
    P1: { state: "met", evidence: "$9" }, P2: { state: "not_met" }, P3: { state: "unknown", evidence: "page longer than the read limit" },
    P5: { state: "unknown" }, P6: { state: "unknown" }, A1: { state: "met", evidence: "https://x.test/affiliates" }, A2: { state: "not_met" } } }
  const started = Date.now()
  // TEST-NET-1 never answers: the discovery child can only end by its own limit.
  const found = await discoverIsolated({ slug: "x", url: "https://192.0.2.1/" }, ["https://192.0.2.1/pricing"], ["P2", "P3"], 1500)
  assert.ok(Date.now() - started < 5000)
  assert.deepEqual(found, {})
  assert.deepEqual(withDiscovered(phase1, found), phase1)
  // A positive reading replaces not_met or unknown only; met stays as phase 1 read it.
  const merged = withDiscovered(phase1, { P1: { state: "met", evidence: "other" }, P2: { state: "met", evidence: "free plan (on /plans)" }, P3: { state: "not_met" } })
  assert.equal(merged.checks.P1.evidence, "$9")
  assert.equal(merged.checks.P2.state, "met")
  assert.deepEqual(merged.checks.P3, phase1.checks.P3)
  assert.deepEqual(merged.checks.A1, phase1.checks.A1)
})

test("discovery candidates: pricing kinds first, shorter path, A-Z, three at most, never a page already read or another site", () => {
  const home = { url: "https://brand.com/", html: [
    '<a href="/shop">Shop</a>', '<a href="/blog/pricing-guide">Guide</a>', '<a href="/plugin/kit/pricing/">Kit pricing</a>',
    '<a href="/free-trial?utm=x">Trial</a>', '<a href="/pricing">Pricing</a>', '<a href="/store/app">Store</a>', '<a href="/buy">Buy</a>',
    '<a href="https://other.com/pricing">Other</a>', '<a href="/download">Download</a>',
  ].join("") }
  const got = discoveryCandidates([home], ["https://brand.com", "https://brand.com/pricing"], new Set()).slice(0, 3)
  assert.deepEqual(got, ["https://brand.com/buy", "https://brand.com/store/app", "https://brand.com/plugin/kit/pricing"])
  assert.ok(!got.some((u) => u.includes("shop") || u.includes("other.com")))
})

test("discovery reads only the brand's pages, skips merchandise, and only adds readings", async () => {
  network({
    "https://brand.com/robots.txt": html(""),
    "https://brand.com/store/merch": html("<title>Merch store</title><p>Pro plan $29/mo</p>"),
    "https://brand.com/store/app": html("<p>Company merch T-shirt $29</p><p>Start your 14-day free trial</p>"),
    "https://brand.com/buy": redirect("https://reseller.example/buy"),
    "https://reseller.example/robots.txt": html(""),
    "https://reseller.example/buy": html("<p>Pro $19/mo</p>"),
  })
  const found = await discover({ slug: "b", url: "https://brand.com" }, ["https://brand.com/buy", "https://brand.com/store/app", "https://brand.com/store/merch"], ["P1", "P2", "P3"], new Set())
  assert.equal(found.P1, undefined, "the reseller's price, the merch page and the merch price all ignored")
  assert.match(found.P2!.evidence!, /14-day free trial \(on https:\/\/brand\.com\/store\/app\)/)
  assert.equal(found.P3, undefined)
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

test("--record saves every response and --replay serves the same bytes without the network", async () => {
  const dir = mkdtempSync(join(tmpdir(), "oas-record-"))
  const routes: Record<string, () => Response> = {
    "https://brand.test/robots.txt": html("User-agent: *\nAllow: /"),
    "https://brand.test/go": redirect("https://brand.test/pricing"),
    "https://brand.test/pricing": html("<p>Pro $29/mo</p>"),
  }
  const live = (async (input: string | URL | Request) => (routes[String(input)] ?? html("", 404))()) as typeof fetch
  setFetcher(recordingFetcher(dir, live))
  const recorded = await politeGet("https://brand.test/go")
  setFetcher(replayFetcher(dir))
  assert.deepEqual(await politeGet("https://brand.test/go"), recorded, "the redirect, robots.txt and page replay as recorded")
  assert.equal((recorded as { url: string }).url, "https://brand.test/pricing")
  assert.match(JSON.stringify(await politeGet("https://brand.test/other")), /fetch failed \(Error\)/, "a URL that was not recorded fails, never reaches the network")
  rmSync(dir, { recursive: true, force: true })
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

test("fixes from the blind sample (SAMPLE-40.md): each miss and false positive, as found", () => {
  // P1: currency after the number counts; statistics and savings do not.
  assert.ok(hasPrice("Basic ab 1,90 € User/Monat"), "seatti")
  assert.ok(hasPrice("Team 49 EUR per seat"))
  assert.equal(hasPrice("if a customer from churning saves you $50K, then it could be a great fit"), null, "june")
  assert.equal(hasPrice("Brands of Every Size $2B+ Annual Retail Ad Spend Managed $25B"), null, "quartile")
  assert.ok(hasPrice("Pro $12/mo, save $50K in churn"), "a real price next to a statistic still counts")
  // P2: "Try X free", "Install X Free", non-English trial phrases; a free demo is not a trial.
  assert.ok(hasTrial("Try Duplicator free on your site"), "duplicator")
  assert.ok(hasTrial("Install Duplicator Free"), "duplicator")
  assert.ok(hasTrial("Dùng thử miễn phí"), "vbee")
  assert.ok(hasTrial("Jetzt kostenlos testen"))
  assert.equal(hasTrial("Get your free demo today"), null)
  assert.equal(hasTrial("Miễn phí vận chuyển"), null, "free shipping is not a free plan")
  // P3: a brand sibling host, an app-store install, and a link wrapped in a large inline SVG.
  assert.equal(selfServe(`<a href="https://console.neon.tech/signup">Sign up</a>`, "https://neon.com", new Set(["neon", "brand"])), null, "neon is a dictionary word: across suffixes it does not prove the brand (a known miss)")
  assert.equal(selfServe(`<a href="https://other.tech/signup">Sign up</a>`, "https://neon.com"), null, "an unrelated host")
  assert.ok(selfServe(`<a href="https://apps.shopify.com/fast-bundle-product-bundles">Install Now</a>`, "https://fastbundle.co"), "fast-bundle")
  assert.ok(selfServe(`<a href="/signup"><svg>${"<path d='M0 0'/>".repeat(80)}</svg>Get started</a>`, "https://klap.app"), "klap")
  assert.ok(selfServe(`<a href="https://crayo.ai/signup">Make an account</a>`, "https://crayo.ai"), "crayo")
  // A2: terms published on the page without a "terms" heading.
  assert.ok(termsLink(`<h2>Become an affiliate</h2><p>20% recurring commissions for life.</p><p>Our tracking cookie lasts 30 days.</p>`, "https://replygain.com"), "replygain")
  assert.ok(termsLink(`<p>Earn 30% of every payment for 12 months.</p><p>Referrals are tracked with a 90 day cookie.</p>`, "https://pumpgtm.com"), "pumpgtm")
  assert.equal(termsLink(`<p>Earn 30% commission. Terms coming soon.</p>`, "https://brand.com"), null, "a figure with no concrete term")
  assert.equal(termsLink(`<p>Our tracking cookie lasts 30 days.</p>`, "https://brand.com"), null, "a term with no commission figure")
})

test("review of the fixes (PR #364 r1): false positives and long digit runs", () => {
  // Long digit runs: every reader stays linear (was quadratic: 1.2 s at 64k digits).
  for (const text of ["$" + "1".repeat(64_000) + "K", "1".repeat(64_000), "1.".repeat(32_000) + " USD", "commission " + "9".repeat(64_000) + "%"]) {
    const t0 = performance.now()
    hasPrice(text)
    termsLink(`<p>${text}</p>`, "https://brand.com")
    hasTrial(text)
    assert.ok(performance.now() - t0 < 150, `${text.slice(0, 12)}… took ${Math.round(performance.now() - t0)} ms`)
  }
  // P1: a reduction is not a price.
  assert.equal(hasPrice("Customer acquisition cost reduced by 49 € with our platform. Contact sales for pricing."), null)
  // P2: a free demo or free shipping after "try … free" is not a trial; CJK phrasings count.
  assert.equal(hasTrial("Try our free demo today"), null)
  assert.equal(hasTrial("Try our service for free shipping"), null)
  assert.equal(hasTrial("Try our free online demo today"), null)
  assert.equal(hasTrial("Try our service for free standard shipping"), null)
  assert.ok(hasTrial("Start for free with our team"), "words after free that are not a demo")
  assert.ok(hasTrial("無料トライアルを開始"))
  assert.ok(hasTrial("立即免费试用"))
  // P3: the public suffix list decides the name; app stores need the exact host, a listing and install wording.
  assert.equal(selfServe(`<a href="https://unrelated.co.uk/signup">Sign up</a>`, "https://brand.co.uk"), null)
  assert.equal(selfServe(`<a href="https://brand.io/signup">Sign up</a>`, "https://brand.co.uk", new Set(["neon", "brand"])), null)
  assert.ok(selfServe(`<a href="https://ads.snapchat.com/getstarted">Get Started</a>`, "https://forbusiness.snapchat.com"), "another subdomain of the same domain")
  assert.ok(selfServe(`<a href="https://app.n8n.cloud/register">Get started</a>`, "https://n8n.io", new Set(["neon", "brand"])), "a distinctive name under another suffix")
  assert.equal(selfServe(`<a href="https://app.n8n.cloud/register">Get started</a>`, "https://n8n.io", null), null, "without a dictionary, no name is distinctive (fails closed)")
  assert.equal(selfServe(`<a href="https://apps.shopify.com.evil.test/x">Install</a>`, "https://brand.com"), null)
  assert.equal(selfServe(`<a href="https://apps.shopify.com/">Browse apps</a>`, "https://brand.com"), null)
  assert.equal(selfServe(`<a href="https://apps.shopify.com/partners/brand-studio">Apps</a>`, "https://brand.com"), null, "a developer page")
  assert.equal(selfServe(`<a href="https://wordpress.org/plugins/gdpr-cookie-compliance/">Powered by GDPR Cookie Compliance</a>`, "https://ninjapromo.io"), null, "ninja-promo: a third-party plugin in the footer")
  assert.ok(selfServe(`<a href="https://wordpress.org/plugins/seo-by-rank-math/#reviews">WP.org</a>`, "https://rankmath.com"), "rank-math: the brand's own listing")
  assert.ok(selfServe(`<a href="https://chromewebstore.google.com/detail/mylens-ai-webpage/phglephbecffklifllmgaojdpaaaaaaa">Chrome Extension</a>`, "https://mylens.ai"), "mylens")
  assert.ok(selfServe(`<a href="https://apps.apple.com/app/suno-make-and-explore-music/id6480136315">iOS app</a>`, "https://suno.com"), "suno")
  assert.equal(selfServe(`<a href="https://apps.apple.com/app/inbox-zero/id1">iOS app</a>`, "https://box.com"), null, "a short name is a whole word, not a substring")
  assert.equal(selfServe(`<a href="https://apps.shopify.com/bread-recipes">Install</a>`, "https://read.com"), null, "a substring is not the name")
  assert.equal(selfServe(`<a href="https://wordpress.org/plugins/integration-for-rank-math/">Powered by Third Party</a>`, "https://rankmath.com"), null, "an integration by another developer")
  assert.equal(selfServe(`<a href="https://apps.shopify.com/unrelated/?ref=rankmath">Install</a>`, "https://rankmath.com"), null, "a tracking parameter is not the listing")
  assert.equal(selfServe(`<a href="https://apps.shopify.com/unrelated/?ref=box">Install</a>`, "https://box.com"), null)
  assert.ok(selfServe(`<a href="https://play.google.com/store/apps/details?id=com.datadog.app">Get it on Google Play</a>`, "https://www.datadog.com"), "the package id names the brand")
  // A2: billing copy is not program terms; an unannounced window is not a term; "coming soon" applies first.
  assert.equal(termsLink(`<p>$29 recurring subscription, paid monthly.</p>`, "https://brand.com"), null)
  assert.equal(termsLink(`<p>30% commission. Attribution window to be announced.</p>`, "https://brand.com"), null)
  assert.equal(termsLink(`<p>30% commission. Attribution window TBD.</p>`, "https://brand.com"), null)
  assert.equal(termsLink(`<p>Affiliate program terms are coming soon. 30% commission, 60-day cookie.</p>`, "https://brand.com"), null)
  assert.equal(termsLink(`<p>Affiliate program terms. Coming soon. Earn 30% commission, 60-day cookie.</p>`, "https://brand.com"), null)
  assert.equal(termsLink(`<p>Coming soon. 30% commission, 60-day cookie.</p>`, "https://brand.com"), null)
  assert.equal(termsLink(`<p>30% commission. Minimum payout to be announced.</p>`, "https://brand.com"), null)
  assert.equal(termsLink(`<p>30% commission. Payouts via TBD.</p>`, "https://brand.com"), null)
  assert.ok(termsLink(`<p>30% commission. Payouts via PayPal, minimum payout $50.</p>`, "https://brand.com"))
  assert.ok(termsLink(`<p>Earn 40% recurring commission. Payouts via crypto or PayPal.</p>`, "https://brand.com"))
  assert.ok(termsLink(`<p>Earn up to 40% commission. The minimum payout for affiliates is 50 USD.</p>`, "https://brand.com"))
  assert.ok(termsLink(`<p>Earn 30% on every sale. Our cookie life is 30 days.</p>${"<p>Lorem ipsum dolor sit amet.</p>".repeat(10)}<p>New partner program dashboard coming soon.</p>`, "https://brand.com"), "burstyai: an unrelated 'coming soon' far away")
  assert.ok(termsLink(`<p>30% commission on every sale. Attribution window of 60 days.</p>`, "https://brand.com"))
})

test("review of the fixes (PR #364 r3): store routes, valued terms, announcement distance, freebies", () => {
  // The store matcher stays linear on a long listing identity (was cubic: 3.7 s at 1,600 words).
  const t0 = performance.now()
  selfServe(`<a href="https://apps.shopify.com/${Array(1600).fill("x").join("-")}">Install</a>`, "https://acme.com")
  assert.ok(performance.now() - t0 < 50, `took ${Math.round(performance.now() - t0)} ms`)
  // Store routes must be complete listing routes.
  assert.equal(selfServe(`<a href="https://chromewebstore.google.com/detail/rank-math">Install</a>`, "https://rankmath.com"), null)
  assert.equal(selfServe(`<a href="https://addons.mozilla.org/invalid/addon/rank-math/garbage">Install</a>`, "https://rankmath.com"), null)
  assert.ok(selfServe(`<a href="https://chromewebstore.google.com/detail/rank-math-seo/${"a".repeat(32)}">Add to Chrome</a>`, "https://rankmath.com"))
  assert.ok(selfServe(`<a href="https://addons.mozilla.org/en-US/firefox/addon/rank-math/">Add to Firefox</a>`, "https://rankmath.com"))
  // A2 terms carry a value of the right kind.
  assert.equal(termsLink(`<p>30% commission. Cookie duration details are in section 2.</p>`, "https://brand.com"), null)
  assert.equal(termsLink(`<p>30% commission. Attribution window: see section 2.</p>`, "https://brand.com"), null)
  assert.equal(termsLink(`<p>30% commission. Payouts via checklist to be determined.</p>`, "https://brand.com"), null)
  assert.ok(termsLink(`<p>30% commission. Our cookie lasts 60 days.</p>`, "https://brand.com"))
  assert.ok(termsLink(`<p>30% commission. Cookie window: 30-day.</p>`, "https://brand.com"))
  assert.ok(selfServe(`<a href="https://chromewebstore.google.com/detail/rank-math-seo/${"b".repeat(32)}/reviews">4.8 on Google</a>`, "https://rankmath.com"), "a tab of the listing")
  assert.equal(termsLink(`<p>30% commission. Paid monthly. ${"x".repeat(126)} Coming soon.</p>`, "https://brand.com"), null, "a marker at the window's edge")
  // Page text joins buttons: "Start for free" followed by the next button's label is still a trial.
  // Known limit: an unlisted modifier ("free video demo") is read as a trial; text alone cannot tell it from two buttons.
  assert.ok(hasTrial("Start for Free Book a demo"))
  assert.ok(hasTrial("Try Brex for free Log in"))
  assert.ok(hasTrial("Try Duplicator free on your site"))
  assert.ok(hasTrial("Install Duplicator Free"))
  assert.ok(hasTrial("Start for free, no credit card"))
})

test("v2 readers follow the grader rubric, each with its boundary (spec 2026-10-20-OAS-V2-DISCOVERY §2)", () => {
  const terms = (body: string, head = "") => termsLink(`<html><head>${head}</head><body>${body}</body></html>`, "https://brand.com")
  // A2 approval ("concrete term: … approval"), only in a sentence about the program.
  assert.ok(terms(`<p>Earn 30% commission. Affiliate applications are reviewed within 48 hours.</p>`))
  assert.ok(terms(`<p>Earn 25% commission. Once approved, we'll set you up with a referral link.</p>`))
  assert.equal(terms(`<p>Earn 30% commission. Job applications are reviewed by our HR team.</p>`), null, "a job application is not program approval")
  // A2 payout ("payout"): schedule or method, in a sentence about the program; buyer payment does not count.
  assert.ok(terms(`<p>Recurring 20% commission. Receive monthly commissions.</p>`), "hello-bar")
  assert.ok(terms(`<p>25% commission on the first sale. Affiliates are paid the first of the month via PayPal.</p>`), "memberpress")
  assert.ok(terms(`<p>25% lifetime commission. Payments are made every two months.</p>`), "fast-bundle")
  assert.ok(terms(`<p>30% commission. Payouts twice a month through PayPal.</p>`), "se-ranking")
  assert.equal(terms(`<p>Plans from $29. You can pay via PayPal or card.</p>`), null, "buyer payment")
  assert.equal(terms(`<p>Earn 20% commission. Monthly commissions add up.</p>`), null, "accrual without a receive or paid verb")
  // A2 cookie ("cookie window"), up to two words between, never a consent or analytics cookie.
  assert.ok(terms(`<p>25% commission and a 60-day return cookie.</p>`), "memberpress")
  assert.ok(terms(`<p>30% commission. We store your referred users' cookies for 120 days.</p>`), "se-ranking")
  assert.equal(terms(`<p>30% commission. We set a 30-day analytics cookie.</p>`), null, "an analytics cookie")
  // A2 figure: the meta description is the page's own text; statistics are not rates.
  assert.ok(terms(`<p>Payouts via PayPal, payout minimum $100.</p>`, `<meta name="description" content="Join and earn up to 30% CPA!">`), "common-ninja")
  assert.equal(terms(`<p>$25,000+ earned in commission 100% of clients happy. You'll receive your payment every 3 months.</p>`), null, "aisdr: stat cards")
  assert.equal(terms(`<p>Earn recurring commissions. Read our partnership terms.</p>`), null, "wisestamp: a terms heading without a figure")
  // Registry phrasings found by the full-rescan audit (v2 A2 losses), and their boundaries.
  assert.ok(terms(`<p>You'll receive 20% of each sale you make. We offer a 30 day cookie.</p>`), "ai-detector-pro")
  assert.ok(terms(`<p>Earn 20% recurring commission. Commissions greater than $10 are paid out on the first day of each month to your PayPal account.</p>`), "linkhub")
  assert.ok(terms(`<p>Earn up to 75% commission. 120 days' cookie tracking.</p>`), "iobit")
  assert.ok(terms(`<p>Earn 20% recurring commission. 90-Days Cookie Duration.</p>`), "socialpilot")
  assert.ok(terms(`<p>Earn 40% on the initial purchase. The tracking cookies are set to a lengthy 60 days.</p>`), "themify")
  assert.ok(terms(`<p>30% of every payment your client makes. Cookie window 60 days. Payouts Monthly.</p>`), "rank-prompt")
  assert.ok(terms(`<p>Earn 10% on attributed sales. Applications are reviewed manually; there is no automatic approval.</p>`), "csv-safecheck")
  assert.ok(terms(`<p>Get 50% of all referred payments. Commission will be paid monthly.</p>`), "craft / bokun")
  assert.ok(terms(`<p>Up to 50% commission on every subscription you refer. Get paid monthly.</p>`), "kittl")
  assert.equal(terms(`<p>Earn 10% commission each month, for an entire year, on their monthly bill.</p>`), null, "a recurring rate is not a payout schedule")
  assert.equal(terms(`<p>Earn 20% commission for any referral that subscribes to a monthly plan.</p>`), null, "a monthly plan is not a schedule")
  assert.equal(terms(`<p>Earn up to $10,000. Your payout $348 monthly.</p>`), null, "an earnings calculator")
  assert.equal(terms(`<p>Earn up to 40% per sale. Partners get recurring payouts and monthly performance bonuses.</p>`), null, "picwish: monthly qualifies the bonuses")
  assert.ok(terms(`<p>Earn 25% recurring commission. Affiliate payouts and agency payouts both on the same monthly schedule.</p>`), "magicblocks")
  assert.ok(terms(`<p>Earn up to $70. Commissions are paid in USD on a monthly basis.</p>`), "carepatron")
  assert.ok(terms(`<p>Earn 10%. Commissions are available for cash-out via ACH.</p>`), "goflow: a cash-out method")
  assert.equal(terms(`<p>Get 25% off your first year. Payouts monthly.</p>`), null, "a discount is not a rate")
  assert.equal(terms(`<p>Customers get 99.9% uptime. Payouts monthly.</p>`), null, "a product claim is not a rate")
  assert.equal(terms(`<p>Earn 20% commission. We use cookies for analytics; accept cookies for 30 days.</p>`), null, "a consent banner")
  assert.equal(terms(`<p>Earn 20% commission. Your plan is paid monthly by card.</p>`), null, "buyer billing")
  // P2 ("free trial … or a free plan/tier"): "free to try", negated before or after.
  assert.ok(hasTrial("Boolvideo is free to try"))
  assert.equal(hasTrial("Our app is not free to try"), null)
  assert.equal(hasTrial("Free to try? No, plans start at $9."), null)
  assert.equal(hasTrial("The free plan is no longer available."), null)
  // P3 purchase and start ("start without booking a demo or contacting sales"), brand host only.
  assert.ok(selfServe(`<a href="https://www.literatureandlatte.com/store/scrivener">BUY NOW</a>`, "https://www.literatureandlatte.com"))
  assert.equal(selfServe(`<a href="https://readymode.chargifypay.com/subscribe/x">Buy now</a>`, "https://www.readymode.com"), null, "a third-party checkout")
  assert.equal(selfServe(`<a href="https://brand.com/merch/hoodie">Buy now</a>`, "https://brand.com"), null, "merchandise")
  assert.ok(selfServe(`<a href="https://www.freemockup.video/app/">Start creating free</a>`, "https://www.freemockup.video"))
  assert.equal(selfServe(`<a href="https://brand.com/blog/start-creating">Start creating now</a>`, "https://brand.com"), null, "a marketing page")
  // The sales veto: link text, and only sales-contact shapes in a path.
  assert.ok(selfServe(`<a href="https://sellercenter.io/sales-tracking">Start for Free</a>`, "https://sellercenter.io"))
  assert.equal(selfServe(`<a href="https://brand.com/contact-sales">Get started</a>`, "https://brand.com"), null)
  assert.equal(selfServe(`<a href="https://brand.com/start">Talk to sales</a>`, "https://brand.com"), null)
})

test("v2 readers stay linear on 2 MB inputs", () => {
  const big = 2_000_000
  for (const text of ["payments ".repeat(big / 9), "paid ".repeat(big / 5) + " via", "cookies ".repeat(big / 8), "payments " + "x".repeat(big), "commission " + "9% ".repeat(big / 3), "free to try ".repeat(big / 12)]) {
    const t0 = performance.now()
    termsLink(`<p>${text}</p>`, "https://brand.com")
    hasTrial(text)
    assert.ok(performance.now() - t0 < 1500, `${text.slice(0, 16)}… took ${Math.round(performance.now() - t0)} ms`)
  }
})

test("review of PR #365 r1: reader boundaries", () => {
  const terms = (body: string) => termsLink(`<p>${body}</p>`, "https://brand.com")
  assert.equal(terms("Customers get 99% satisfaction. Payouts monthly."), null, "a product claim is not a commission")
  assert.equal(terms("Earn 30% commission. Job applications require manual approval."), null, "a job approval")
  assert.equal(terms("Earn 20% commission. Payments are processed monthly for your plan."), null, "the buyer's bill")
  assert.equal(terms("Earn 30% commission. Your cookies expire after 30 days to remember your consent."), null, "a consent cookie, consent after the match")
  assert.ok(terms("Earn 30% commission. Cookie duration is 24 hours."), "a cookie window in hours")
  assert.ok(terms("Earn up to 50%. 45-Day Cookie Policy We save cookies for 45 days, so if a visitor buys you earn."), "wpmet: a cookie section heading")
  assert.ok(terms(`Products: collect cookie consent with a banner. ${"Features and tools for your site ".repeat(6)}Earn up to 40% commission with cookies to track customers who clicked affiliate links for 30 days.`), "iubenda: consent in the menu, far from the term")
  assert.ok(terms("30 % Revenue Share Lifetime Recurring Commission. No credit card Free signup · Approved within 24 hours"), "poweradspy: no credit card is not a credit approval")
  assert.ok(terms("Earn 30% commission. Payouts are sent on the 20th."), "a payout day of the month")
  assert.ok(terms("Earn $15 for every new subscriber. Payouts monthly via PayPal."), "a figure per referral")
  for (const text of ["Free to try is unavailable.", "Free to try: No.", "Free to try? Not anymore."]) assert.equal(hasTrial(text), null, text)
  assert.equal(selfServe(`<a href="/bl%6fg/how-to">Start creating free</a>`, "https://brand.com"), null, "an encoded marketing path")
})

test("review of PR #365 r1: discovery and recording", async () => {
  // Every URL phase 1 read is removed before the first three are taken.
  const home = { url: "https://brand.com/", html: '<a href="/buy">b</a><a href="/store">s</a><a href="/a/buy">ab</a><a href="/c/store">cs</a>' }
  const all = discoveryCandidates([home], ["https://brand.com"], new Set())
  assert.deepEqual(all.filter((u) => u !== "https://brand.com/buy").slice(0, 3), ["https://brand.com/a/buy", "https://brand.com/store", "https://brand.com/c/store"])
  // Titles by forward scan: whole title, linear on hostile input.
  assert.equal(titleOf(`<title id="t">${"x".repeat(300)} merch</title>`).endsWith("merch"), true)
  const t0 = performance.now()
  titleOf("<title ".repeat(300_000))
  assert.ok(performance.now() - t0 < 200)
  // A JSON-LD offer on a discovered page is not read (it cannot be checked against the merchandise guard).
  network({
    "https://brand.com/robots.txt": html(""),
    "https://brand.com/store": html('<p>Company merch T-shirt $29</p><script type="application/ld+json">{"offers":{"price":"29","priceCurrency":"USD"}}</script>'),
  })
  assert.equal((await discover({ slug: "b", url: "https://brand.com" }, ["https://brand.com/store"], ["P1"], new Set())).P1, undefined)
  // Recording keeps the raw bytes and only what the reader read: a body of invalid UTF-8 replays exactly as live.
  const dir = mkdtempSync(join(tmpdir(), "oas-bytes-"))
  const bytes = Buffer.concat([Buffer.alloc(600_000, 0xff), Buffer.from(" Pro $29/mo ")])
  const live = (async (input: string | URL | Request) => String(input).endsWith("robots.txt") ? new Response("") : new Response(bytes)) as typeof fetch
  setFetcher(recordingFetcher(dir, live))
  const recorded = await politeGet("https://bytes.test/p")
  setFetcher(replayFetcher(dir))
  assert.deepEqual(await politeGet("https://bytes.test/p"), recorded)
  assert.equal((recorded as { truncated?: boolean }).truncated, false)
  rmSync(dir, { recursive: true, force: true })
  // A replay refuses PageSpeed and DataForSEO, which run in the parent.
  assert.throws(() => runOptions(["--replay", "x", "--seo"]), /cannot run/)
  assert.throws(() => runOptions(["--replay", "x", "--psi"]), /cannot run/)
})

test("review of PR #365 r2: boundaries across sentences and subjects", async () => {
  const terms = (body: string) => termsLink(`<p>${body}</p>`, "https://brand.com")
  assert.equal(terms("Our service costs $29 per customer. Affiliate payouts monthly."), null, "a price per customer is not a commission")
  assert.equal(terms("Earn 30% commission. We use cookies to enhance your browsing experience. These cookies expire after 30 days."), null, "consent in the sentence before")
  assert.equal(terms("Earn 30% commission. Essential cookies last 30 days."), null, "an essential cookie")
  assert.equal(terms("Earn 30% commission. Job applications for open engineering and design positions across all our locations are first screened by a recruiter and then require manual approval."), null, "a far job subject")
  assert.equal(terms("Earn 30% commission. Employment applications require manual approval."), null)
  assert.equal(terms("Earn 20% commission. For your plan, the details about accessing our collection of premium downloadable resources and product features are available here, while payments are processed monthly."), null, "a far buyer subject")
  assert.equal(terms("Earn 20% commission. Customer payments are processed monthly."), null, "a buyer's payment")
  assert.equal(hasTrial("Free to try is currently unavailable."), null)
  // Real terms these guards must keep.
  assert.ok(terms("Partner with us: earn 10% on attributed sales. Applications are reviewed manually; there is no automatic approval."), "csv-safecheck")
  assert.ok(terms("Our affiliates earn 25% lifetime commission. Payments are made every two months."), "fast-bundle")
  assert.ok(terms("Earn up to $2,000. We use cookies to track your referrals. The cookies last for 90 days after someone clicks your link."), "easydmarc")
  assert.ok(terms("For a $30 subscription your commission is 100% which is $30. Commissions become available for payment monthly."), "startmail")
  assert.ok(terms("Earn up to 50%. 45-Day Cookie Policy We save cookies for 45 days, so if a visitor buys you earn."), "wpmet")
  // A title is read whole for the merchandise veto.
  network({ "https://brand.com/robots.txt": html(""), "https://brand.com/store": html(`<title>${"Brand ".repeat(350)} merch</title><p>$29</p>`) })
  assert.equal((await discover({ slug: "b", url: "https://brand.com" }, ["https://brand.com/store"], ["P1"], new Set())).P1, undefined)
})

test("review of PR #365 r2: a recorded stream failure replays as a failure; recording appends", async () => {
  const dir = mkdtempSync(join(tmpdir(), "oas-fail-"))
  const failing = (async (input: string | URL | Request) => {
    if (String(input).endsWith("robots.txt")) return new Response("")
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode("Pro $29/mo")); c.error(new Error("reset")) } })
    return new Response(body)
  }) as typeof fetch
  setFetcher(recordingFetcher(dir, failing))
  const live = await politeGet("https://fail.test/p")
  setFetcher(replayFetcher(dir))
  assert.deepEqual(await politeGet("https://fail.test/p"), live)
  assert.match(JSON.stringify(live), /read failed/)
  // 4 MB in 1 KiB chunks: appended, not rewritten (linear).
  const chunked = (async (input: string | URL | Request) => String(input).endsWith("robots.txt") ? new Response("") : new Response(new ReadableStream<Uint8Array>({
    start(c) { const k = new Uint8Array(1024).fill(97); for (let i = 0; i < 1400; i++) c.enqueue(k); c.close() } }))) as typeof fetch
  setFetcher(recordingFetcher(dir, chunked))
  const t0 = performance.now()
  await politeGet("https://big.test/p")
  assert.ok(performance.now() - t0 < 2000, `${Math.round(performance.now() - t0)} ms`)
  rmSync(dir, { recursive: true, force: true })
})

test("review of PR #365 r3: concurrent and unfinished recordings, risk-free", async () => {
  // A money-back guarantee is not a free trial.
  assert.equal(hasTrial("100% risk-free to try. All plans come with a 30-day money-back guarantee. Plans start at $29/month."), null)
  assert.ok(hasTrial("Boolvideo is free to try"))
  const dir = mkdtempSync(join(tmpdir(), "oas-conc-"))
  // Two responses for one URL at once: each recording is whole, never interleaved.
  const big = (async () => new Response(new ReadableStream<Uint8Array>({
    start(c) { const k = new Uint8Array(1024).fill(98); for (let i = 0; i < 977; i++) c.enqueue(k); c.close() } }))) as typeof fetch
  const rec = recordingFetcher(dir, big)
  const [x, y] = await Promise.all([rec("https://same.test/robots.txt"), rec("https://same.test/robots.txt")])
  await Promise.all([x.arrayBuffer(), y.arrayBuffer()])
  const replayed = await (await replayFetcher(dir)("https://same.test/robots.txt")).arrayBuffer()
  assert.equal(replayed.byteLength, 977 * 1024)
  // Two captures of one URL finishing in either order: the manifest and its body always belong together.
  const welcome = (async () => new Response("Welcome")) as typeof fetch
  let n = 0
  const priceThenFail = (async () => new Response(new ReadableStream<Uint8Array>({
    pull(c) { if (n++ === 0) c.enqueue(new TextEncoder().encode("Pro $29/mo")); else c.error(new TypeError("reset")) } }, { highWaterMark: 0 }))) as typeof fetch
  const ra = await recordingFetcher(dir, welcome)("https://pair.test/p")
  const rb = await recordingFetcher(dir, priceThenFail)("https://pair.test/p")
  const rbr = rb.body!.getReader()
  await rbr.read()
  await ra.text() // A finishes after B started: A's manifest wins, with A's body
  const pa = await replayFetcher(dir)("https://pair.test/p")
  assert.equal(await pa.text(), "Welcome")
  await assert.rejects(rbr.read()) // B fails: B's manifest wins, with B's body and failure
  const pb = (await replayFetcher(dir)("https://pair.test/p")).body!.getReader()
  assert.equal(new TextDecoder().decode((await pb.read()).value), "Pro $29/mo")
  await assert.rejects(pb.read())
  // An unfinished capture does not replay.
  const hanging = (async () => new Response(new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode("Pro $29/mo")) } }))) as typeof fetch
  const r = await recordingFetcher(dir, hanging)("https://hang.test/p")
  await r.body!.getReader().read()
  await assert.rejects(replayFetcher(dir)("https://hang.test/p"), /not recorded/)
  // A recorded failure replays its bytes first, then fails.
  let pulls = 0
  const failing = (async () => new Response(new ReadableStream<Uint8Array>({
    pull(c) { if (pulls++ === 0) c.enqueue(new TextEncoder().encode("Pro")); else c.error(new TypeError("reset")) } }, { highWaterMark: 0 }))) as typeof fetch
  const live = (await recordingFetcher(dir, failing)("https://f.test/p")).body!.getReader()
  assert.equal(new TextDecoder().decode((await live.read()).value), "Pro")
  await assert.rejects(live.read())
  const again = (await replayFetcher(dir)("https://f.test/p")).body!.getReader()
  assert.equal(new TextDecoder().decode((await again.read()).value), "Pro")
  await assert.rejects(again.read(), (e: Error) => e.name === "TypeError")
  rmSync(dir, { recursive: true, force: true })
})

test("--rescan-html makes no PageSpeed or DataForSEO call, whatever else is on the line", () => {
  assert.deepEqual(runOptions(["--rescan-html", "--psi", "--seo"]), { rescanHtml: true, psi: false, seo: false })
  assert.deepEqual(runOptions(["--psi", "--seo"]), { rescanHtml: false, psi: true, seo: true })
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
  assert.equal(seoKeyword("Aircall Inc."), "aircall", "legal suffix dropped")
  assert.equal(seoKeyword("Acme Software GmbH"), "acme software")
  assert.equal(seoKeyword("Co"), "co", "a one-word name is kept whole")
  assert.equal(seoKeyword("The Browser Company"), "the browser company", "Company can be part of the brand")
  assert.equal(seoKeyword("Brit + Co"), "brit co", "Co can be part of the brand")
  assert.equal(seoKeyword("Acme Corp."), "acme")
  assert.equal(seoKeyword("🚀 ✨"), null)
  assert.equal(seoKeyword(null), null)
  assert.equal(seoKeyword(Array(15).fill("word").join(" "))!.split(" ").length, 10)
  assert.ok(seoKeyword("x".repeat(200))!.length <= 80)
  assert.equal(p6Check("vercel", 90500).state, "met")
  assert.equal(p6Check("tiny", 0).state, "not_met")
  assert.equal(p6Check("small", 500).state, "not_met", "under 1,000 a month")
  assert.equal(p6Check("enough", 1000).state, "met")
  // A one-word brand that is an ordinary word is asked for by its domain.
  const words = new Set(["pitch", "finally", "notion"])
  assert.equal(seoQuery({ name: "Pitch", url: "https://www.pitch.com/" }, words), "pitch.com")
  assert.equal(seoQuery({ name: "Canva", url: "https://www.canva.com" }, words), "canva")
  assert.equal(seoQuery({ name: "Pitch Deck AI", url: "https://pitchdeck.ai" }, words), "pitch deck ai", "several words are specific enough")
  assert.equal(seoQuery({ name: "Pitch", url: null }, words), "pitch", "no URL: the name")
  assert.equal(seoQuery({ name: "Pitch", url: "https://pitch.com" }, null), "pitch", "no word list: the name")
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

test("P6 refresh: a cached answer from an older rule is asked again under today's rule", async () => {
  const asked: string[] = []
  setFetcher((async (_url: string, init?: RequestInit) => {
    const keywords = (JSON.parse(String(init?.body)) as { keywords: string[] }[])[0].keywords
    asked.push(...keywords)
    return Response.json({ status_code: 20000, cost: 0.09, tasks: [{ cost: 0.09, status_code: 20000, result: keywords.map((k) => ({ keyword: k, search_volume: k === "pitch.com" ? 4400 : 500 })) }] })
  }) as typeof fetch)
  const old = { slug: "pitch", network: "n", checkedAt: "", checks: Object.fromEntries(["P1", "P2", "P3", "P5", "P6", "A1", "A2"].map((id) => [id, { state: "unknown" as const }])) } as Result
  old.checks.P6 = { state: "met", evidence: '"pitch": 500/mo worldwide' } // passed under the old ≥ 10 rule
  const small = { ...old, slug: "small", checks: { ...old.checks, P6: { state: "met" as const, evidence: '"small": 500/mo worldwide' } } }
  await refreshP6([old, small], new Map([["pitch", "pitch.com"], ["small", "small"]]), "eA==")
  assert.deepEqual(asked.sort(), ["pitch.com", "small"])
  assert.deepEqual(old.checks.P6, { state: "met", evidence: '"pitch.com": 4400/mo worldwide' })
  assert.equal(small.checks.P6.state, "not_met", "500 a month is under today's threshold")
})

test("dry-run score ignores unknown checks and needs four determined ones", () => {
  const r = (states: string[]): Result => ({ slug: "x", network: "n", checkedAt: "", checks: Object.fromEntries(states.map((s, i) => [`C${i}`, { state: s as "met" }])) })
  assert.equal(tier1Score(r(["met", "met", "not_met", "met", "unknown"])), 75)
  assert.equal(tier1Score(r(["met", "met", "unknown", "unknown"])), null)
  assert.match(distribution([r(["met", "met", "met", "met"])]), /\| n \| 1 \| 1 \| 100\.0 \|/)
})
