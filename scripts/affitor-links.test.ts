/**
 * Every OpenAffiliate link to affitor.com carries the openaffiliate UTM and
 * records oa_to_affitor_click (src/lib/affitor-link.ts), and /for-brands
 * states no pricing.
 *
 * The registry checks read src/lib/registry.json, so run this after
 * `npm run build` in CI. Run with `npx tsx --test scripts/affitor-links.test.ts`.
 */
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { test } from "node:test"
import { FOR_BRANDS, affitorUrl, isAffitorHref } from "../src/lib/affitor-link"
import { alsoOnAffitor, applyButton } from "../src/lib/apply-cta"
import { programs } from "../src/lib/programs"
import sitemap from "../src/app/sitemap"

const root = join(__dirname, "..")

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

function hasUtm(href: string, medium?: string): boolean {
  const params = new URL(href).searchParams
  return (
    params.get("utm_source") === "openaffiliate" &&
    Boolean(params.get("utm_campaign")) &&
    (medium ? params.get("utm_medium") === medium : Boolean(params.get("utm_medium")))
  )
}

test("affitorUrl adds the UTM; isAffitorHref matches affitor.com only", () => {
  assert.ok(hasUtm(affitorUrl("for_brands", "for_brands"), "for_brands"))
  assert.ok(isAffitorHref("https://affitor.com/marketplace"))
  assert.ok(isAffitorHref("https://app.affitor.com/x"))
  assert.equal(isAffitorHref("https://notaffitor.com/"), false)
  assert.equal(isAffitorHref("https://affitor.com.evil.example/"), false)
  assert.equal(isAffitorHref("/for-brands"), false)
})

test("every apply and Also-on-Affitor link to affitor.com carries the UTM", () => {
  const hrefs = programs.flatMap((p) => [applyButton(p).href, alsoOnAffitor(p)?.href]).filter(
    (h): h is string => typeof h === "string" && isAffitorHref(h),
  )
  assert.ok(hrefs.length > 0, "no program links to affitor.com: the check would be vacuous")
  for (const href of hrefs) assert.ok(hasUtm(href), `no UTM: ${href}`)
})

// The tracked components are the only way a page renders an Affitor href:
// an anchor built from affitorUrl(), applyCta or alsoOn must be AffitorLink
// (records the event itself) or TrackLink (records it for affitor.com hrefs).
test("every affitor.com anchor in the source is a tracked component", () => {
  const files = sourceFiles(join(root, "src")).filter((f) => !f.endsWith("src/lib/affitor-link.ts"))
  let tracked = 0
  for (const file of files) {
    const text = readFileSync(file, "utf8")
    const rel = relative(root, file)
    // A hard-coded affitor.com page link skips affitorUrl(); data (network-meta) and mailto: are not links.
    for (const m of text.matchAll(/https:\/\/(?:[\w-]+\.)?affitor\.com[^\s"'`]*/g)) {
      assert.ok(rel === "src/lib/network-meta.ts", `${rel}: hard-coded ${m[0]}; use affitorUrl() and AffitorLink`)
    }
    for (const m of text.matchAll(/<(\w+)\s[^>]*?href=\{(affitorUrl\(|applyCta\.href|alsoOn\.href)/g)) {
      assert.ok(m[1] === "AffitorLink" || m[1] === "TrackLink", `${rel}: <${m[1]}> links to Affitor without the event`)
      tracked++
    }
  }
  assert.ok(tracked >= 5, `found ${tracked} Affitor anchors; expected the 2 apply, also-on, brand, claim and for-brands links`)
  const trackLink = readFileSync(join(root, "src/app/programs/[slug]/track-view.tsx"), "utf8")
  assert.match(trackLink, /if \(isAffitorHref\(href\)\) track\(AFFITOR_CLICK, \{ slug, metadata: \{ source: "program_page", cta \} \}\)/)
  const affitorLink = readFileSync(join(root, "src/components/affitor-link.tsx"), "utf8")
  assert.match(affitorLink, /track\(AFFITOR_CLICK, \{ slug, metadata: \{ source, cta \} \}\)/)
})

test("/for-brands states no pricing and is in the sitemap", () => {
  for (const [key, text] of Object.entries(FOR_BRANDS)) {
    assert.doesNotMatch(text, /\$|%|\bfree\b|\bfees?\b|pric|\bcost|\bpaid\b|\bpay\b|subscription|guarantee/i, `FOR_BRANDS.${key}`)
  }
  assert.ok(sitemap().some((e) => e.url === "https://openaffiliate.dev/for-brands"))
})
