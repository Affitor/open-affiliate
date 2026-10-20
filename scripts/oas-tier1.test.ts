import assert from "node:assert/strict"
import { test } from "node:test"
import { cwv, distribution, hasPrice, hasTrial, pricingLink, robotsAllows, selfServe, termsLink, tier1Score, visibleText, type Result } from "./oas-tier1"

test("robots.txt: our group over *, longest match wins, Allow wins a tie, $ anchors", () => {
  const robots = "User-agent: *\nDisallow: /\n\nUser-agent: OpenAffiliate\nDisallow: /private\nAllow: /private/pricing\nDisallow: /*.pdf$\n"
  assert.equal(robotsAllows(robots, "/pricing"), true)
  assert.equal(robotsAllows(robots, "/private/x"), false)
  assert.equal(robotsAllows(robots, "/private/pricing"), true)
  assert.equal(robotsAllows(robots, "/a.pdf"), false)
  assert.equal(robotsAllows(robots, "/a.pdf?x"), true)
  assert.equal(robotsAllows(robots, "/pricing", "SomeBot"), false, "others fall back to *")
  assert.equal(robotsAllows("User-agent: *\nDisallow:\n", "/"), true, "empty Disallow allows")
  assert.equal(robotsAllows("", "/"), true)
  assert.equal(robotsAllows("User-agent: a\nUser-agent: *\nDisallow: /x\n", "/x"), false, "consecutive agents share a group")
  assert.equal(robotsAllows("User-agent: *\nDisallow: /a\nAllow: /a\n", "/a"), true)
})

test("brand-page readers", () => {
  const home = `<nav><a href="/pricing">Pricing</a><a href="https://other.com/pricing">x</a><a href="/signup">Start free</a></nav>
    <script>var x = "$99"</script><p>Try it free for 14 days</p>`
  assert.equal(pricingLink(home, "https://www.brand.com/"), "https://www.brand.com/pricing")
  assert.equal(pricingLink(`<a href="/plans/">Plans</a>`, "https://brand.com"), "https://brand.com/plans/")
  assert.equal(pricingLink(`<a href="https://other.com/pricing">Pricing</a>`, "https://brand.com"), null, "other sites do not count")
  assert.equal(hasPrice(visibleText(home)), null, "prices inside scripts do not count")
  assert.ok(hasPrice("Pro $29/mo billed yearly"))
  assert.ok(hasPrice("Team 49 EUR per seat"))
  assert.equal(hasPrice("Contact sales for a quote"), null)
  assert.ok(hasPrice("", `<script type="application/ld+json">{"offers":{"price":"29","priceCurrency":"USD"}}</script>`))
  assert.equal(hasPrice("", `<script type="application/ld+json">{"offers":{"price":"0","priceCurrency":"USD"}}</script>`), null, "a zero offer is not a published price")
  assert.equal(pricingLink(`<a href="/pricing/enterprise">Enterprise</a><a href="/pricing">Pricing</a>`, "https://brand.com"), "https://brand.com/pricing")
  assert.equal(hasTrial("Start your 14-day free trial"), "14-day free trial")
  assert.ok(hasTrial(visibleText(home)))
  assert.equal(hasTrial("Book a demo"), null)
  assert.ok(selfServe(home, "https://brand.com"))
  assert.equal(selfServe(`<a href="/demo">Book a demo</a><a href="/contact">Contact sales</a>`, "https://brand.com"), null)
})

test("program-page terms link: affiliate terms, not the site's own ToS", () => {
  assert.ok(termsLink(`<a href="/affiliate-terms">Read the terms</a>`, "https://brand.com"))
  assert.ok(termsLink(`<a href="/legal">Partner Program Agreement</a>`, "https://brand.com"))
  assert.ok(termsLink(`<h2>Affiliate program terms</h2><p>30% recurring</p>`, "https://brand.com"))
  assert.equal(termsLink(`<a href="/terms">Terms of Service</a><a href="/privacy">Privacy</a>`, "https://brand.com"), null)
  assert.equal(termsLink(`<a href="/%E0%A4%A">Broken</a>`, "https://brand.com"), null, "a malformed escape does not throw")
})

test("Core Web Vitals: field data first, lab thresholds otherwise", () => {
  const field = (lcp: string) => ({ loadingExperience: { metrics: { LARGEST_CONTENTFUL_PAINT_MS: { category: lcp }, INTERACTION_TO_NEXT_PAINT: { category: "FAST" }, CUMULATIVE_LAYOUT_SHIFT_SCORE: { category: "FAST" } } } })
  assert.equal(cwv(field("FAST")).state, "met")
  assert.equal(cwv(field("AVERAGE")).state, "not_met")
  const lab = (lcp: number) => ({ lighthouseResult: { audits: { "largest-contentful-paint": { numericValue: lcp }, "cumulative-layout-shift": { numericValue: 0.05 }, "total-blocking-time": { numericValue: 150 } } } })
  assert.equal(cwv(lab(2400)).state, "met")
  assert.equal(cwv(lab(4000)).state, "not_met")
  assert.equal(cwv({}).state, "unknown")
})

test("dry-run score ignores unknown checks and needs four determined ones", () => {
  const r = (states: string[]): Result => ({ slug: "x", network: "n", checkedAt: "", checks: Object.fromEntries(states.map((s, i) => [`C${i}`, { state: s as "met" }])) })
  assert.equal(tier1Score(r(["met", "met", "not_met", "met", "unknown"])), 75)
  assert.equal(tier1Score(r(["met", "met", "unknown", "unknown"])), null)
  assert.match(distribution([r(["met", "met", "met", "met"])]), /\| n \| 1 \| 1 \| 100\.0 \|/)
})
