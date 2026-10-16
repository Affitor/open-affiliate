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
import { affitorAnchorProblems } from "./affitor-checks"

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

// Source guard, next to the served-HTML check in verify-machine-surfaces: a
// plain <a> with a computed href is allowed only for the expressions below,
// each reviewed as never pointing at affitor.com. Any other computed href
// (applyButton(p).href, p.applyHref, a new one) must use AffitorLink or
// TrackLink, which record oa_to_affitor_click when the href is on affitor.com.
const PLAIN_ANCHORS = new Set([
  "src/app/layout.tsx | href", // footer list: internal paths and GitHub
  "src/app/privacy/page.tsx | `mailto:${CONTACT}`",
  "src/app/explore/page.tsx | `/explore?${sp.toString()}`",
  "src/app/programs/[slug]/page.tsx | program.url", // the brand's own site; checked against the registry below
  "src/app/programs/[slug]/page.tsx | `https://github.com/Affitor/open-affiliate/blob/main/programs/${program.slug}.yaml`",
  "src/components/explore-table.tsx | item.url", // social posts
  "src/components/social-listen.tsx | item.url", // social posts
  "src/components/docs-toc.tsx | `#${h.id}`",
  "src/app/page.tsx | `/programs/${p.slug}`", // homepage top-verified row, internal (N-2)
  "src/app/programs/page.tsx | `/programs/${p.slug}`", // A–Z directory, internal (N-2)
  "src/app/programs/page.tsx | `#letter-${g.letter === \"#\" ? \"other\" : g.letter}`", // directory jump links
  "src/components/affitor-link.tsx | href",
  "src/app/programs/[slug]/track-view.tsx | href",
])

test("every computed anchor href is tracked or reviewed as not Affitor", () => {
  const files = sourceFiles(join(root, "src")).filter((f) => !f.endsWith("src/lib/affitor-link.ts"))
  let tracked = 0
  for (const file of files) {
    const text = readFileSync(file, "utf8")
    const rel = relative(root, file)
    // A hard-coded affitor.com page link skips affitorUrl(); data (network-meta) and mailto: are not links.
    for (const m of text.matchAll(/https:\/\/(?:[\w-]+\.)?affitor\.com[^\s"'`]*/g)) {
      assert.ok(rel === "src/lib/network-meta.ts", `${rel}: hard-coded ${m[0]}; use affitorUrl() and AffitorLink`)
    }
    for (const m of text.matchAll(/<a\s[^>]*?href=\{((?:[^{}]|\{[^{}]*\})*)\}/g)) {
      const key = `${rel} | ${m[1].trim()}`
      assert.ok(PLAIN_ANCHORS.has(key), `${key}: a plain <a> with a computed href; use AffitorLink/TrackLink or review it into PLAIN_ANCHORS`)
    }
    tracked += [...text.matchAll(/<(?:AffitorLink|TrackLink)\b/g)].length
  }
  // 2 apply + also-on (TrackLink), brand box, claim, /for-brands, compare Join, list Sign up.
  assert.ok(tracked >= 8, `found ${tracked} tracked anchors`)
  for (const p of programs) assert.equal(isAffitorHref(p.url), false, `${p.slug}: program.url is on affitor.com but rendered as a plain link`)
  const trackLink = readFileSync(join(root, "src/app/programs/[slug]/track-view.tsx"), "utf8")
  assert.match(trackLink, /if \(isAffitorHref\(href\)\) track\(AFFITOR_CLICK, \{ slug, metadata: \{ source: "program_page", cta \} \}\)/)
  const affitorLink = readFileSync(join(root, "src/components/affitor-link.tsx"), "utf8")
  assert.match(affitorLink, /if \(affitor\) track\(AFFITOR_CLICK, \{ slug, metadata: \{ source, cta \} \}\)/)
})

test("served-HTML check: an untracked Affitor link or one without the UTM fails", () => {
  const ok = `<a href="https://affitor.com/?utm_source=openaffiliate&amp;utm_medium=x&amp;utm_campaign=y" data-oa-affitor="list">`
  assert.deepEqual(affitorAnchorProblems(ok), { problems: [], tracked: 1 })
  assert.equal(affitorAnchorProblems(ok.replace(' data-oa-affitor="list"', "")).problems.length, 1)
  assert.equal(affitorAnchorProblems(ok.replace("utm_source=openaffiliate", "utm_source=x")).problems.length, 1)
  assert.equal(affitorAnchorProblems(`<a href="https://example.com/">`).tracked, 0)
})

// cos-oa 13/10: no pricing in the copy this PR adds; copy already live keeps its wording.
test("/for-brands and the new program-page link state no pricing; /for-brands is in the sitemap", () => {
  for (const [key, text] of Object.entries(FOR_BRANDS)) {
    assert.doesNotMatch(text, /\$|%|\bfree\b|\bfees?\b|pric|\bcost|\bpaid\b|\bpay\b|subscription|guarantee/i, `FOR_BRANDS.${key}`)
  }
  assert.ok(sitemap().some((e) => e.url === "https://openaffiliate.dev/for-brands"))
})
