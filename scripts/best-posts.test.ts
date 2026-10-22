import assert from "node:assert/strict"
import { test } from "node:test"
import { BEST_LISTS, HUB_MIN_INDEXED, bestPath, buildBestList, categoryList, getBestList, indexable, otherLists } from "../src/lib/best-lists"
import { commissionUnknown, livePrograms } from "../src/lib/programs"
import sitemap from "../src/app/sitemap"
import { blogApplyHref } from "../src/lib/apply-cta"
import { isAffitorHref } from "../src/lib/affitor-link"
import { getProgram, isLive } from "../src/lib/programs"
import { DISCLOSURE_SOURCE, GUIDES, guideCopyStrings, guidePath, guideSelection, guideTitle, registryFacts } from "../src/lib/guides"
import { GuideView } from "../src/components/guide-view"
import { blogEntries } from "../src/lib/blog"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { hasNoProgram } from "../src/lib/no-program"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { parse as parseYaml } from "yaml"
import { join } from "node:path"
import { BestPostStandard } from "../src/components/best-post-standard"
import { AFFITOR_ATTR, AFFITOR_MARKETPLACE, affitorUrl } from "../src/lib/affitor-link"

const blogAffitorHref = (slug: string) => affitorUrl("blog", slug, AFFITOR_MARKETPLACE)
import { requires, AFFITOR_LINE, guideReadMoreLinks, NOT_RECORDED, NOT_STATED, PROS_CONS_MAX, READ_MORE_COUNT, STATED_TWO_WAYS, picksSentence, readMoreLinks, requirementsText, twoValueText, programDetails, prosCons, splitLink, standardFaq, tableRow, typeSplit } from "../src/lib/best-standard"
import { CAPTURES, CAPTURE_SKIPPED, NETWORK_CAPTURES, NETWORK_CAPTURE_SKIPPED } from "../src/lib/best-captures"
import { NETWORKS_POST, NETWORKS_POST_PATH, networkEntries, networkReadMoreLinks, networksFaq } from "../src/lib/networks-post"
import { BestNetworksPost, networkHref } from "../src/components/best-networks-post"
import { parseNotes, termNotes } from "../src/lib/term-notes"
import { NETWORK_META } from "../src/lib/network-meta"
import { programs as allPrograms } from "../src/lib/programs"
import { blockedReason } from "./blocked-hosts"
import {
  MIN_POST_PROGRAMS,
  POSTS,
  copyStrings,
  earnText,
  postFaq,
  postList,
  postSelection,
  postTitle,
} from "../src/lib/best-posts"

/**
 * The posts the wave-1 plan marks for the one Affitor marketplace sentence
 * (10 of 17). A post outside this set may not carry it; add a slug here only
 * when the plan changes.
 */
const AFFITOR_ALLOWED = new Set([
  "affiliate-programs",
  "recurring-affiliate-programs",
  "affiliate-programs-for-beginners",
  "free-affiliate-programs",
  "ai-affiliate-programs",
  "saas-affiliate-programs",
  "sales-affiliate-programs",
  "partnerstack-affiliate-programs",
  "impact-affiliate-programs",
  "affiliate-networks-for-saas",
])

const listSlugs = new Set(BEST_LISTS.map((l) => l.slug))

test("every post sits on a list and names only programs the registry has", () => {
  assert.ok(POSTS.length > 0)
  assert.equal(new Set(POSTS.map((p) => p.slug)).size, POSTS.length, "two posts share a slug")
  for (const post of POSTS) {
    assert.ok(postList(post), `${post.slug}: no BestList with this slug`)
    const slugs = post.programs.map((p) => p.slug)
    assert.equal(new Set(slugs).size, slugs.length, `${post.slug}: a program appears twice`)
    for (const slug of slugs) assert.ok(getProgram(slug), `${post.slug}: ${slug} is not in the registry`)
    for (const pick of post.picks) assert.ok(slugs.includes(pick.slug), `${post.slug}: pick ${pick.slug} has no program block`)
    for (const r of post.related) assert.ok(listSlugs.has(r) && r !== post.slug, `${post.slug}: related ${r} is not another list`)
    assert.match(post.checked, /^\d{4}-\d{2}-\d{2}$/)
  }
})

test("copy carries no figures: every number on a post comes from the registry", () => {
  for (const post of POSTS) {
    // "B2B" and "B2C" are words, not figures; any other digit, or a number
    // spelled out, fails ("one" and "once" are ordinary words, so they pass).
    const NUMBER_WORDS = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|half|dozen)\b/i
    for (const text of copyStrings(post)) {
      assert.doesNotMatch(text.replace(/\bB2[BC]\b/g, ""), /\d/, `${post.slug}: a digit in copy: ${JSON.stringify(text)}`)
      assert.doesNotMatch(text, NUMBER_WORDS, `${post.slug}: a spelled-out number in copy: ${JSON.stringify(text)}`)
    }
    assert.ok(post.description.length >= 120 && post.description.length <= 155, `${post.slug}: description is ${post.description.length} characters`)
  }
})

test("as of its check date, each post shows enough fresh verified programs, and the title counts them", () => {
  for (const post of POSTS) {
    const asOf = new Date(post.checked)
    const selection = postSelection(post, asOf)
    assert.ok(selection.shown.length >= MIN_POST_PROGRAMS, `${post.slug}: ${selection.shown.length} programs shown, dropped ${JSON.stringify(selection.dropped)}`)
    const list = postList(post)!
    for (const { program } of selection.shown) {
      assert.ok(program.verified && isLive(program) && !hasNoProgram(program), `${post.slug}: ${program.slug} is not a live verified program`)
      assert.ok(list.qualifies(program), `${post.slug}: ${program.slug} does not qualify for ${list.slug}`)
      assert.ok(Date.parse(program.lastVerifiedAt!) >= asOf.getTime() - 90 * 86_400_000, `${post.slug}: ${program.slug} terms are stale`)
      assert.doesNotMatch(earnText(program), /undefined|NaN|null/)
    }
    const title = postTitle(post, selection, asOf)
    assert.ok(title.includes(String(selection.shown.length)), `${post.slug}: "${title}" does not carry the ${selection.shown.length} programs shown`)
    assert.ok(title.includes(String(asOf.getUTCFullYear())), `${post.slug}: "${title}" has no year`)
    // " | OpenAffiliate" brings the tag to 60 at most.
    assert.ok(title.length <= 44, `${post.slug}: title is ${title.length} characters`)
    for (const f of postFaq(post, selection)) assert.doesNotMatch(f.a, /undefined|NaN/)
  }
})

test("a program left stale, unverified or off the list is dropped, never shown", () => {
  const post = POSTS[0]
  const late = new Date(Date.parse(post.checked) + 400 * 86_400_000)
  const selection = postSelection(post, late)
  assert.equal(selection.shown.length, 0, "terms over a year old must not be shown")
  assert.ok(selection.dropped.every((d) => /over \d+ days|not verified|status|qualify|commission/.test(d.reason)))
  const fake = { ...post, programs: [{ slug: "no-such-program", bestFor: "x", why: "x" }] }
  assert.deepEqual(postSelection(fake, new Date(post.checked)).dropped, [{ slug: "no-such-program", reason: "not in the registry" }])
})

test("the Affitor sentence appears only on the posts the plan marks", () => {
  for (const post of POSTS) if (post.affitor) assert.ok(AFFITOR_ALLOWED.has(post.slug), `${post.slug}: not marked for an Affitor link`)
})

test("every Apply link on a post carries the blog UTM for that post and program", () => {
  for (const post of POSTS) {
    for (const { program } of postSelection(post, new Date(post.checked)).shown) {
      const params = new URL(blogApplyHref(program, post.slug)).searchParams
      assert.equal(params.get("utm_source"), "openaffiliate", program.slug)
      assert.equal(params.get("utm_medium"), "blog", program.slug)
      assert.equal(params.get("utm_campaign"), post.slug, program.slug)
      assert.equal(params.get("utm_content"), program.slug, program.slug)
    }
  }
  // A live Affitor program keeps its Affitor link.
  const kyma = getProgram("kyma-api")
  if (kyma && kyma.network === "affitor" && isLive(kyma)) assert.ok(isAffitorHref(blogApplyHref(kyma, "x")))
})

test("You earn reads naturally for the rate shapes the registry has", () => {
  const p = (commission: Record<string, unknown>) => ({ commission: { currency: "USD", ...commission }, kind: "affiliate" }) as never
  const cases: [Record<string, unknown>, string][] = [
    // Plain rates get their type and length.
    [{ type: "recurring", mode: "percentage", value: 20, rate: "20%", duration: "lifetime" }, "20% recurring for life"],
    [{ type: "recurring", mode: "percentage", value: 22, rate: "22%", duration: "12 months" }, "22% recurring for 12 months"],
    [{ type: "one-time", mode: "percentage", value: 30, rate: "30%" }, "30% one-time"],
    [{ type: "tiered", mode: "tiered", value: 40, rate: "30%-40%", duration: "lifetime" }, "30%-40% tiered, for life"],
    // A recurring commission with no length on record points to the full terms.
    [{ type: "recurring", mode: "percentage", value: 25, rate: "25%" }, "25% recurring, length: see full terms"],
    // A trailing "+" ("or more") is not a two-part deal.
    [{ type: "tiered", mode: "tiered", value: 100, rate: "$50 to $100+" }, "$50 to $100+, tiered"],
    // A rate that says more than its figure is shown as published; the type follows a comma.
    [{ type: "recurring", mode: "percentage", value: 50, rate: "Up to 50%", duration: "lifetime" }, "Up to 50%, recurring for life"],
    [{ type: "recurring", mode: "percentage", value: 25, rate: "25% of net revenue", duration: "12 months" }, "25% of net revenue, recurring for 12 months"],
    [{ type: "recurring", mode: "percentage", value: 25, rate: "25% then 15%", duration: "24 months" }, "25% then 15%, recurring for 24 months"],
    // A rate that already says "for …" gains no length; one that says how it pays gains no type word.
    [{ type: "recurring", mode: "percentage", value: 20, rate: "20% for one year", duration: "12 months" }, "20% for one year, recurring"],
    [{ type: "one-time", mode: "flat", value: 15, rate: "$15 per new subscriber" }, "$15 per new subscriber"],
    [{ type: "recurring", mode: "hybrid", value: null, rate: "40% recurring + $1/signup", duration: "12 months" }, "40% recurring + $1/signup, for 12 months"],
    [{ type: "hybrid", mode: "percentage", value: 30, rate: "30%" }, "30%"],
  ]
  for (const [commission, want] of cases) assert.equal(earnText(p(commission)), want, JSON.stringify(commission))
})

// ---------- Hub lists (P3) ----------------------------------------------------

const TERMS_HUBS = ["no-minimum-payout-affiliate-programs", "paypal-affiliate-programs", "bank-transfer-affiliate-programs", "long-cookie-affiliate-programs"]

test("a hub that filters on payout or cookie lists verified programs only", () => {
  // Unverified programs show no payout or cookie (confirmed-terms.ts), so a hub cannot claim one.
  for (const slug of TERMS_HUBS) {
    const list = getBestList(slug)
    assert.ok(list?.hub, slug)
    const { rows } = buildBestList(list)
    assert.ok(rows.length > 0, slug)
    assert.ok(rows.every((p) => p.verified), slug)
  }
})

test("the bank hub never counts a program paid only by Wise, PayPal or other methods", () => {
  const { rows } = buildBestList(getBestList("bank-transfer-affiliate-programs")!)
  for (const p of rows) assert.ok((p.payoutMethods ?? []).some((m) => ["bank", "wire", "ach", "sepa"].includes(m.toLowerCase())), p.slug)
})

test("a hub below the threshold is noindex and out of the sitemap; every other list is in it", () => {
  const sample = livePrograms.filter((p) => p.verified && !commissionUnknown(p.commission)).slice(0, HUB_MIN_INDEXED)
  assert.equal(sample.length, HUB_MIN_INDEXED)
  const base = BEST_LISTS.find((list) => list.hub)!
  const fixtures = [HUB_MIN_INDEXED - 1, HUB_MIN_INDEXED].map((count) => {
    const slugs = new Set(sample.slice(0, count).map((p) => p.slug))
    return { ...base, slug: `test-hub-threshold-${count}`, qualifies: (p: (typeof sample)[number]) => slugs.has(p.slug) }
  })
  assert.ok(fixtures.every((fixture) => !BEST_LISTS.some((list) => list.slug === fixture.slug)))
  const originalLength = BEST_LISTS.length
  try {
    BEST_LISTS.push(...fixtures)
    const urls = new Set(sitemap().map((e) => e.url))
    for (const list of BEST_LISTS) {
      const url = `https://openaffiliate.dev${bestPath(list)}`
      const small = Boolean(list.hub) && buildBestList(list).verified.length < HUB_MIN_INDEXED
      assert.equal(indexable(list), !small, list.slug)
      assert.equal(urls.has(url), !small, url)
    }
    assert.equal(buildBestList(fixtures[0]).verified.length, HUB_MIN_INDEXED - 1)
    assert.equal(indexable(fixtures[0]), false)
    assert.equal(buildBestList(fixtures[1]).verified.length, HUB_MIN_INDEXED)
    assert.equal(indexable(fixtures[1]), true)
  } finally {
    BEST_LISTS.length = originalLength
  }
})

test("every category and commission type with enough verified programs gets a list, and no other does", () => {
  const scoped = BEST_LISTS.filter((l) => l.scope)
  const want = new Set<string>()
  for (const category of new Set(livePrograms.map((p) => p.category))) {
    for (const type of ["recurring", "one-time"]) {
      const n = livePrograms.filter((p) => p.verified && !commissionUnknown(p.commission) && p.category === category && p.commission.type === type).length
      if (n >= HUB_MIN_INDEXED) want.add(`${category}|${type}`)
    }
  }
  assert.ok(want.size > 0)
  assert.equal(scoped.length, want.size)
  for (const list of scoped) {
    assert.ok(list.hub && indexable(list), list.slug)
    const { rows } = buildBestList(list)
    const type = rows[0].commission.type
    assert.ok(want.has(`${list.scope}|${type}`), list.slug)
    assert.ok(rows.every((p) => p.category === list.scope && p.commission.type === type), list.slug)
  }
})

test("a per-category list is linked from its own category only", () => {
  const scoped = BEST_LISTS.find((l) => l.scope)!
  const unscoped = getBestList("recurring-affiliate-programs")!
  assert.equal(otherLists(unscoped).includes(scoped), false)
  assert.ok(otherLists(categoryList(scoped.scope!)).includes(scoped))
  assert.ok(otherLists(scoped).every((l) => !l.scope || l.scope === scoped.scope))
  assert.ok(otherLists(scoped).includes(unscoped))
})


// ---------- guides (/blog/<slug>) -------------------------------------------

test("every guide names only programs the registry has, links only lists that exist, and carries no figures", () => {
  assert.ok(GUIDES.length > 0)
  assert.equal(new Set(GUIDES.map((g) => g.slug)).size, GUIDES.length, "two guides share a slug")
  const NUMBER_WORDS = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|half|dozen)\b/i
  for (const g of GUIDES) {
    assert.match(g.checked, /^\d{4}-\d{2}-\d{2}$/)
    const slugs = g.programs.map((p) => p.slug)
    assert.equal(new Set(slugs).size, slugs.length, `${g.slug}: a program appears twice`)
    for (const slug of [...slugs, ...g.rules.map((r) => r.slug)]) assert.ok(getProgram(slug), `${g.slug}: ${slug} is not in the registry`)
    for (const r of g.related) assert.ok(listSlugs.has(r), `${g.slug}: related ${r} is not a list`)
    for (const st of g.sections.flatMap((s) => s.steps ?? [])) if (st.link) assert.match(st.link.href, /^\/(best\/[a-z0-9-]+|programs\?[a-z0-9=&]+)$/, `${g.slug}: step link ${st.link.href}`)
    for (const text of guideCopyStrings(g)) {
      assert.doesNotMatch(text.replace(/\bB2[BC]\b/g, ""), /\d/, `${g.slug}: a digit in copy: ${JSON.stringify(text)}`)
      assert.doesNotMatch(text, NUMBER_WORDS, `${g.slug}: a spelled-out number in copy: ${JSON.stringify(text)}`)
    }
    assert.ok(g.description.length >= 120 && g.description.length <= 155, `${g.slug}: description is ${g.description.length} characters`)
    const title = guideTitle(g, new Date(g.checked))
    assert.ok(title.includes(String(new Date(g.checked).getUTCFullYear())) && title.length <= 44, `${g.slug}: title "${title}"`)
  }
})

test("as of its check date, a guide shows every program it names, live, verified and fresh", () => {
  for (const g of GUIDES) {
    const asOf = new Date(g.checked)
    const selection = guideSelection(g, asOf)
    assert.deepEqual(selection.dropped, [], `${g.slug}: dropped ${JSON.stringify(selection.dropped)}`)
    assert.ok(selection.shown.length >= 3, `${g.slug}: ${selection.shown.length} programs`)
    for (const { program } of selection.shown) {
      assert.ok(program.verified && isLive(program) && !hasNoProgram(program), `${g.slug}: ${program.slug}`)
      assert.ok(Date.parse(program.lastVerifiedAt!) >= asOf.getTime() - 90 * 86_400_000, `${g.slug}: ${program.slug} terms are stale`)
    }
  }
})

test("a guide page: takeaways at the top, compact programs with one tracked link each, the Affitor line, Read more and the FAQ at the end", () => {
  for (const g of GUIDES) {
    const selection = guideSelection(g, new Date(g.checked))
    const html = renderToStaticMarkup(createElement(GuideView, { guide: g, selection, path: guidePath(g) }))
    assert.ok(g.takeaways.length >= 3 && g.takeaways.length <= 5, `${g.slug}: ${g.takeaways.length} takeaways`)
    assert.ok(g.mistakes.length >= 3 && g.mistakes.length <= 5, `${g.slug}: ${g.mistakes.length} common mistakes`)
    for (const { program, copy } of selection.shown) {
      const href = blogApplyHref(program, g.slug)
      assert.equal(new URL(href).searchParams.get("utm_campaign"), g.slug)
      assert.ok(splitLink(copy.why), `${g.slug}: ${program.slug} has no {link} in its why`)
      // The tracked Apply link sits inside the program's paragraph, exactly once; no button.
      assert.equal(html.split(`href="${href.replaceAll("&", "&amp;")}"`).length - 1, 1, `${g.slug}: ${program.slug} needs one inline Apply link`)
    }
    // One Affitor link: the marketplace line, blog medium, the guide's slug as campaign, tracked.
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replaceAll("&amp;", "&"))
    const affitor = blogAffitorHref(g.slug)
    assert.equal(new URL(affitor).searchParams.get("utm_medium"), "blog")
    assert.equal(new URL(affitor).searchParams.get("utm_campaign"), g.slug)
    const programHrefs = new Set(selection.shown.map(({ program }) => blogApplyHref(program, g.slug)))
    assert.deepEqual(hrefs.filter((h) => isAffitorHref(h) && !programHrefs.has(h)), [affitor], `${g.slug}: Affitor links`)
    const tag = [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]).find((t) => t.includes(`href="${affitor.replaceAll("&", "&amp;")}"`))
    assert.ok(tag && tag.includes(`${AFFITOR_ATTR}="blog"`), `${g.slug}: the marketplace link is not tracked`)
    assert.ok(hrefs.includes(DISCLOSURE_SOURCE.href), `${g.slug}: the disclosure does not cite its source`)
    assert.ok(html.includes("data-post-disclosure") && html.includes("data-registry-facts") && html.includes("data-takeaways") && html.includes("data-mistakes"))
    // Read more: one box, five links (related lists, then other guides).
    const links = guideReadMoreLinks(g)
    assert.equal(links.length, READ_MORE_COUNT, `${g.slug}: Read more lists ${links.length}`)
    assert.equal((html.match(/data-read-more/g) ?? []).length, 1)
    const box = html.match(/<aside[^>]*data-read-more[\s\S]*?<\/aside>/)![0]
    assert.deepEqual([...box.matchAll(/href="([^"]+)"/g)].map((m) => m[1]), links.map((l) => l.href))
    // Order: takeaways first; at the end the Affitor line, Read more, FAQ.
    const at = ["data-takeaways", "data-post-program", "data-mistakes", "data-affitor-line", "data-read-more", "data-faq"].map((k) => html.indexOf(k))
    assert.ok(at.every((x, i) => x > 0 && (i === 0 || at[i - 1] < x)), `${g.slug}: blocks out of order ${JSON.stringify(at)}`)
    // The Shopify-style frame: no buttons, no "Keep reading" rail, no team note.
    assert.doesNotMatch(html, /Keep reading|data-quick-picks|data-toc|rounded-lg border border-line-strong/)
    assert.doesNotMatch(html, TEAM_NOTE)
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)![1])
    const faqLd = ld["@graph"].find((n: { "@type": string }) => n["@type"] === "FAQPage")
    assert.deepEqual(faqLd.mainEntity.map((q: { name: string }) => q.name), g.faq.map((f) => f.q))
    const shownQs = [...html.match(/<aside[^>]*data-faq[\s\S]*?<\/aside>/)![0].matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)].map((m) => m[1].replaceAll("&#x27;", "'"))
    assert.deepEqual(shownQs, g.faq.map((f) => f.q))
    for (const p of [...html.matchAll(/<p[^>]*>([^<]*)<\/p>/g)].map((m) => m[1])) assert.doesNotMatch(p, /undefined|NaN|null/)
  }
})

test("registry facts add up and come from verified programs only", () => {
  const f = registryFacts()
  const verified = livePrograms.filter((p) => p.verified).length
  assert.equal(f.verified, verified)
  assert.equal(f.byType.reduce((a, t) => a + t.count, 0), verified)
  assert.equal(f.approval.auto + f.approval.manual + f.approval.unknown, verified)
  assert.ok(f.lifetime <= (f.byType.find((t) => t.type === "recurring")?.count ?? 0))
  assert.ok(f.cookie && f.cookie.p25 <= f.cookie.median && f.cookie.median <= f.cookie.p75)
  assert.match(f.asOf, /^\d{4}-\d{2}-\d{2}$/)
})

test("guides are on /blog, in the sitemap, and never under /best", () => {
  const { posts } = blogEntries()
  const urls = new Set(sitemap().map((e) => e.url))
  for (const g of GUIDES) {
    assert.ok(posts.some((e) => e.href === guidePath(g)), `${g.slug}: not on /blog`)
    assert.ok(urls.has(`https://openaffiliate.dev${guidePath(g)}`), `${g.slug}: not in the sitemap`)
    assert.ok(!listSlugs.has(g.slug), `${g.slug}: also a /best list slug`)
  }
})

// ---------- conflicts[].values: the set comes from the raw YAML, not from term-notes ----

/** Every (slug, field) whose YAML records a conflict with no `values`, read straight from programs/*.yaml. */
function conflictsWithoutValues(): { slug: string; field: string }[] {
  const dir = join(process.cwd(), "programs")
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .flatMap((f) => {
      const doc = parseYaml(readFileSync(join(dir, f), "utf8")) as { slug?: string; conflicts?: { field?: string; values?: unknown }[] }
      return (doc?.conflicts ?? []).filter((c) => c.field && c.values === undefined).map((c) => ({ slug: String(doc.slug ?? f.replace(/\.yaml$/, "")), field: String(c.field) }))
    })
}

/**
 * Where a renderer shows a figure for a term whose conflict has no recorded
 * values (only for programs whose registry field is empty, so the page must
 * fall back to words). `render` is injectable so the check itself is tested.
 */
function figureLeaks(render: { cookie: (p: (typeof allPrograms)[number]) => string; details: (p: (typeof allPrograms)[number]) => [string, string][] }) {
  const bySlug = new Map(allPrograms.map((p) => [p.slug, p]))
  const leaks: string[] = []
  let checked = 0
  for (const { slug, field } of conflictsWithoutValues()) {
    const p = bySlug.get(slug)
    if (!p) continue
    if (field === "cookie_days" && p.cookieDays == null) {
      checked++
      const shown = [render.cookie(p), render.details(p).find(([k]) => k === "Cookie duration")?.[1] ?? ""]
      if (shown.some((t) => /\d/.test(t))) leaks.push(`${slug} cookie: ${shown.join(" | ")}`)
    }
    if (field === "payout.minimum" && p.payout.minimum == null && !p.payout.frequency) {
      checked++
      const paid = render.details(p).find(([k]) => k === "Getting paid")?.[1] ?? ""
      if (/\d/.test(paid)) leaks.push(`${slug} payout: ${paid}`)
    }
  }
  return { leaks, checked }
}

test("no program records a payout, cookie or approval term it also lists as stated two ways", () => {
  // A conflict means the brand states two values, so the field stays blank (with `values` when they compare);
  // a recorded value next to a conflict would show one of the two as the term. (commission.rate is required
  // by the schema, so its conflicts keep a placeholder such as "varies"; restrictions are a list, not a term.)
  const TERMS = new Set(["cookie_days", "payout.minimum", "payout.frequency", "payout.methods", "approval"])
  const dir = join(process.cwd(), "programs")
  const at = (doc: unknown, path: string) => path.split(".").reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), doc)
  const both = readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .flatMap((f) => {
      const doc = parseYaml(readFileSync(join(dir, f), "utf8")) as { conflicts?: { field?: string }[] }
      return (doc?.conflicts ?? [])
        .filter((c) => TERMS.has(String(c.field)))
        .filter((c) => {
          const v = at(doc, String(c.field))
          return v != null && v !== "" && !(Array.isArray(v) && v.length === 0)
        })
        .map((c) => `${f}: ${c.field} = ${JSON.stringify(at(doc, String(c.field)))}`)
    })
  assert.deepEqual(both, [], "blank these fields, or fix the value and drop the conflict")
})

test("the no-figure check catches a renderer that reads figures out of quote text", () => {
  // An injected parser: pull the first figures out of the conflict quote, as the removed one did.
  const quoteOf = (slug: string, field: string) => {
    const doc = parseYaml(readFileSync(join(process.cwd(), "programs", `${slug}.yaml`), "utf8")) as { conflicts?: { field: string; quote: string }[] }
    return doc.conflicts?.find((c) => c.field === field)?.quote ?? ""
  }
  const figures = (t: string) => (t.match(/[$€£]?\d+(?:\s?-?days?)?/g) ?? []).slice(0, 2).join(" or ")
  const injected = figureLeaks({
    cookie: (p) => figures(quoteOf(p.slug, "cookie_days")) || tableRow(p).cookie,
    details: (p) => programDetails(p).map(([k, v]) => [k, k === "Getting paid" ? figures(quoteOf(p.slug, "payout.minimum")) || v : v] as [string, string]),
  })
  assert.ok(injected.leaks.length > 0, "the check did not catch figures parsed from quotes")
})

test("every public/logos/*.png is a PNG file", () => {
  const dir = join(process.cwd(), "public", "logos")
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const bad = readdirSync(dir)
    .filter((f) => f.endsWith(".png"))
    .filter((f) => !readFileSync(join(dir, f)).subarray(0, 8).equals(PNG))
  assert.deepEqual(bad, [], "these .png files are not PNG images (an HTML page saved as a logo shows as a broken image)")
})

test("standard sections: no team note on any program or post; requirements are a detail, not a con; no software network stands in for payout terms", () => {
  assert.ok(SOFTWARE_NETWORKS.includes("Rewardful") && SOFTWARE_NETWORKS.includes("FirstPromoter") && !SOFTWARE_NETWORKS.includes("Lemon Squeezy"), "network-meta kinds changed")
  const byslug = (slug: string) => allPrograms.find((x) => x.slug === slug)!
  // Classification on fixtures.
  const fixture = { ...byslug("cloudtalk"), restrictions: ["No bidding on brand keywords.", "Use at least one website with real traffic.", "Affiliates must disclose the link.", "Open only to paying customers"] }
  assert.deepEqual(prosCons(fixture).cons, ["No bidding on brand keywords", ...(fixture.commission.type === "one-time" ? ["Pays once per referral, with no recurring share"] : fixture.commission.type === "tiered" ? ["The top figure needs volume or a higher tier"] : []), "Open only to paying customers"].slice(0, PROS_CONS_MAX))
  assert.equal(requirementsText(fixture), "Use at least one website with real traffic; Affiliates must disclose the link")
  assert.equal(requirementsText({ ...fixture, restrictions: ["No spam"] }), null)
  // Disclosure rules are conditions of taking part, not drawbacks (#394 r1 P3-3: Runway, Pineapple Builder, Podia).
  const disclosure = ["Affiliate program, not a paid sponsorship", "Always disclose your affiliate relationship", "Affiliates should promote the product regularly to stay active"]
  const withDisclosure = { ...fixture, restrictions: ["No spam.", ...disclosure] }
  for (const d of disclosure) assert.ok(!prosCons(withDisclosure).cons.includes(d), `a disclosure rule listed as a con: ${d}`)
  assert.equal(requirementsText(withDisclosure), disclosure.join("; "))
  for (const post of STANDARD) {
    const { html, selection } = renderStandard(post)
    for (const { program: p } of selection.shown) {
      const section = html.slice(html.indexOf(`data-post-program="${p.slug}"`)).split("data-post-program=")[1] ?? ""
      // Programs on Affitor are listed like every other: no section carries a team note (Sơn, 2026-10-18 and 2026-10-21).
      assert.doesNotMatch(section, TEAM_NOTE, `${post.slug}: ${p.slug} carries a team note`)
      const { cons } = prosCons(p)
      for (const r of p.restrictions ?? []) {
        if (requires(r))
          assert.ok(!cons.includes(r.trim().replace(/\.$/, "")), `${p.slug}: a requirement listed as a con: ${r}`)
      }
      const text = [tableRow(p).payout, ...programDetails(p).map(([, v]) => v)].join(" ")
      // The software set comes from network-meta (Lemon Squeezy is a merchant of record that pays affiliates, so it is "marketplace", not here).
      for (const name of SOFTWARE_NETWORKS) assert.ok(!text.includes(`On ${name}'s terms`), `${p.slug}: tracking software ${name} shown as the payer`)
      assert.doesNotMatch(text, /see full terms/, `${p.slug}: points to full terms the page does not link`)
    }
  }
  // Fathom records its commission length as unpublished; Raycast simply has none on record.
  assert.match(tableRow(byslug("fathom-analytics")).commission, /length not published/)
  assert.match(tableRow(byslug("raycast")).commission, /length not recorded/)
})

test("the payout FAQ says a program pays on its network's terms only when it has no schedule of its own", () => {
  let checked = 0
  for (const post of STANDARD) {
    const selection = postSelection(post, new Date(post.checked))
    const a = standardFaq(post, selection, typeSplit(post, selection)).find((f) => /pay out\?$/.test(f.q))!.a
    const onTerms = [...a.matchAll(/([^.]*) pays? on [^.]*'s terms\./g)].map((m) => m[1]).join(" | ")
    for (const { program: p } of selection.shown) {
      if (!onTerms.includes(p.name)) continue
      checked++
      assert.ok(!p.payout.frequency, `${post.slug}: ${p.slug} has a ${p.payout.frequency} schedule on record but the FAQ says it pays on its network's terms`)
    }
  }
  // Reclaim (PartnerStack, a monthly schedule on record, no method) is not "on PartnerStack's terms".
  const ai = STANDARD.find((p) => p.slug === "ai-affiliate-programs")!
  const sel = postSelection(ai, new Date(ai.checked))
  assert.ok(sel.shown.some((s) => s.program.slug === "reclaim" && s.program.payout.frequency))
  assert.doesNotMatch(standardFaq(ai, sel, typeSplit(ai, sel)).find((f) => /pay out\?$/.test(f.q))!.a, /Reclaim AI pays on/)
  assert.ok(checked > 0, "no post has a program paid on its network's terms")
})

test("a payout conflict shows next to the payout terms that are on record", () => {
  // Every program whose payout.frequency or payout.minimum is in conflict says so in Getting paid, even when other payout terms are shown.
  let seen = 0
  for (const { slug, field } of conflictsWithoutValues().filter((c) => c.field === "payout.frequency" || c.field === "payout.minimum")) {
    const p = allPrograms.find((x) => x.slug === slug)
    if (!p) continue
    seen++
    const paid = programDetails(p).find(([k]) => k === "Getting paid")?.[1] ?? ""
    assert.match(paid, field === "payout.frequency" ? /two schedules/ : /two minimums/, `${slug}: ${paid}`)
  }
  assert.ok(seen > 0)
})

test("conflicts[].values items match their field: numbers for payout.minimum, a unit or a word for cookie_days", () => {
  const dir = join(process.cwd(), "programs")
  let seen = 0
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".yaml"))) {
    const doc = parseYaml(readFileSync(join(dir, f), "utf8")) as { conflicts?: { field: string; values?: unknown[] }[] }
    for (const c of doc?.conflicts ?? []) {
      if (c.values === undefined) continue
      seen++
      assert.ok(Array.isArray(c.values) && c.values.length >= 2, `${f} ${c.field}: values needs two or more items`)
      if (c.field === "payout.minimum") assert.ok(c.values.every((v) => typeof v === "number" && v >= 0), `${f}: payout.minimum values are numbers in payout.currency`)
      else if (c.field === "cookie_days") assert.ok(c.values.every((v) => typeof v === "string" && /^(\d+ (day|days|hours?)|indefinitely|lifetime|session)$/.test(v)), `${f}: cookie_days values read like "30 days" or "indefinitely"`)
      else assert.ok(c.values.every((v) => typeof v === "string" && v.trim().length > 0), `${f} ${c.field}: values are short phrases`)
    }
  }
  assert.ok(seen > 0)
})

// ---------- standard "best X" layout (components/best-post-standard.tsx) ----

function renderStandard(post: (typeof POSTS)[number]) {
  const list = postList(post)!
  const selection = postSelection(post, new Date(post.checked))
  const html = renderToStaticMarkup(
    createElement(BestPostStandard, { post, list, selection, path: bestPath(list), parent: { name: "Best Affiliate Programs", href: "/best" } }),
  )
  return { html, selection }
}

const STANDARD = POSTS.filter((p) => p.layout === "standard")
/** A team note on a post ("maintains OpenAffiliate", "run by the team"); no-program.test.ts also greps every source file for the other wording. */
const TEAM_NOTE = /maintains? OpenAffiliate|same\s?team|run by the team|data-affitor-network/i
const SOFTWARE_NETWORKS = Object.values(NETWORK_META).filter((m) => m.kind === "software").map((m) => m.name)

test("a standard post: a four-column table, one inline tracked link per program, no buttons, FAQ JSON-LD matches the FAQ box", () => {
  assert.ok(STANDARD.length > 0, "no post opts into the standard layout")
  for (const post of STANDARD) {
    assert.ok(post.lookFor && post.programs.every((p) => p.verdict), `${post.slug}: a standard post needs lookFor and a verdict per program`)
    for (const p of post.programs) assert.ok(splitLink(p.why), `${post.slug}: ${p.slug} why needs exactly one {linked phrase}`)
    for (const g of post.guides ?? []) assert.ok(GUIDES.some((x) => x.slug === g), `${post.slug}: guide ${g} does not exist`)
    const { html, selection } = renderStandard(post)
    const heads = [...html.match(/<table data-terms-table[\s\S]*?<\/thead>/)![0].matchAll(/<th[^>]*scope="col"[^>]*>([^<]+)</g)].map((m) => m[1])
    assert.deepEqual(heads, ["Program", "Commission", "Cookie", "Payout"])
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))
    for (const a of [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1])) assert.ok(ids.has(a), `${post.slug}: #${a} has no section`)
    for (const { program } of selection.shown) {
      assert.ok(ids.has(program.slug), `${post.slug}: no section for ${program.slug}`)
      const href = blogApplyHref(program, post.slug).replaceAll("&", "&amp;")
      // The tracked Apply link sits inside the program's paragraph, exactly once; no button.
      assert.equal(html.split(`href="${href}"`).length - 1, 1, `${post.slug}: ${program.slug} needs one inline Apply link`)
    }
    assert.doesNotMatch(html, /data-capture-caption|data-receipt|data-toc|data-also-considered|id="what-changed"|data-quick-picks/)
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)![1])
    const faqLd = ld["@graph"].find((n: { "@type": string }) => n["@type"] === "FAQPage")
    const faq = standardFaq(post, selection, typeSplit(post, selection))
    assert.ok(faq.length >= 5 && faq.length <= 7, `${post.slug}: ${faq.length} FAQ questions`)
    assert.deepEqual(faqLd.mainEntity.map((q: { name: string }) => q.name), faq.map((f) => f.q))
    const shownQs = [...html.match(/<aside[^>]*data-faq[\s\S]*?<\/aside>/)![0].matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)].map((m) => m[1].replaceAll("&#x27;", "'"))
    assert.equal(shownQs.length, faq.length, `${post.slug}: the FAQ box shows ${shownQs.length} questions`)
    for (const q of faqLd.mainEntity) assert.doesNotMatch(q.acceptedAnswer.text, /undefined|NaN|null|\[object/)
    assert.doesNotMatch(html.replace(/<script[\s\S]*?<\/script>/g, ""), />[^<]*\b(undefined|NaN)\b[^<]*</)
    assert.ok(html.includes("data-post-disclosure") && html.includes("data-how-we-chose") && html.includes("data-read-more"))
  }
})

test("a standard post shows a capture or a logo card for every program, each capture on disk and in budget", () => {
  for (const post of STANDARD) {
    const { html, selection } = renderStandard(post)
    for (const { program } of selection.shown) {
      const c = CAPTURES[program.slug]
      if (c) {
        const file = join(process.cwd(), "public", c.src)
        assert.ok(existsSync(file), `${program.slug}: ${c.src} is missing`)
        assert.ok(statSync(file).size < 120_000, `${program.slug}: ${c.src} is over 120 KB`)
        assert.match(c.captured, /^\d{4}-\d{2}-\d{2}$/)
        assert.equal(blockedReason(c.url), null, `${program.slug}: captured a blocked host`)
        assert.ok(html.includes(`alt="${program.name} affiliate page, captured `), `${program.slug}: no alt text`)
      } else {
        assert.ok(CAPTURE_SKIPPED[program.slug], `${program.slug}: no capture and no recorded reason`)
      }
    }
    assert.equal((html.match(/data-capture-fallback/g) ?? []).length, selection.shown.filter(({ program }) => !CAPTURES[program.slug]).length)
  }
})

test("program details leave out a term with no value, and say plainly when the brand states two", () => {
  const notes = parseNotes(
    ["# cookie window: not published on b.com/affiliates (checked 2026-10-12)", "not_published:", '  payout.methods: "2026-10-18"', "conflicts:", "  - field: payout.minimum", '    quote: "x"'].join("\n"),
  )
  assert.deepEqual([...notes.notPublished].sort(), ["cookie_days", "payout.methods"])
  assert.deepEqual([...notes.conflicts], ["payout.minimum"])
  for (const post of STANDARD) {
    for (const { program: p } of postSelection(post, new Date(post.checked)).shown) {
      const details = programDetails(p)
      const text = details.map(([k, v]) => `${k}: ${v}`).join("\n")
      assert.doesNotMatch(text, new RegExp(`${NOT_STATED}|${NOT_RECORDED}|${STATED_TWO_WAYS}`), `${p.slug}: an empty-term label in the details`)
      const { conflicts } = termNotes(p.slug)
      const cookie = details.find(([k]) => k === "Cookie duration")
      if (p.cookieDays != null) assert.equal(cookie?.[1], `${p.cookieDays} days`, p.slug)
      else if (conflicts.has("cookie_days")) assert.match(cookie?.[1] ?? "", /the brand gives/i, p.slug)
      else assert.equal(cookie, undefined, `${p.slug}: a cookie bullet with no value on record`)
      if (["payout.minimum", "payout.frequency"].some((f) => conflicts.has(f)) && !p.payout.frequency && p.payout.minimum == null)
        assert.match(details.find(([k]) => k === "Getting paid")?.[1] ?? "", /^The brand gives two/, p.slug)
      const { pros, cons } = prosCons(p)
      assert.ok(pros.length <= PROS_CONS_MAX && cons.length <= PROS_CONS_MAX, p.slug)
    }
  }
  // The FAQ never says "not published" for a term the brand states two ways.
  for (const post of STANDARD) {
    const selection = postSelection(post, new Date(post.checked))
    const cookieAnswer = standardFaq(post, selection, typeSplit(post, selection)).find((f) => /cookies/i.test(f.q))!.a
    for (const { program: p } of selection.shown) {
      if (p.cookieDays == null && termNotes(p.slug).conflicts.has("cookie_days")) {
        const sentence = cookieAnswer.split(". ").find((s) => s.includes(p.name)) ?? ""
        assert.match(sentence, /two different cookie windows/, `${p.slug}: cookie FAQ`)
      }
    }
  }
})

test("a standard post ends with the Affitor line, one Read more box of five posts, then the FAQ", () => {
  const NUMBER_WORDS = /\b(two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million|half|dozen)\b/i
  const line = `${AFFITOR_LINE.before}${AFFITOR_LINE.anchor}${AFFITOR_LINE.after}`
  assert.doesNotMatch(line, /\d|\$|free|price|pricing|guarantee/i)
  assert.doesNotMatch(line, TEAM_NOTE)
  for (const post of POSTS) for (const t of copyStrings(post)) assert.doesNotMatch(t, TEAM_NOTE, `${post.slug}: a team note in copy`)
  assert.doesNotMatch(line, NUMBER_WORDS)
  for (const post of STANDARD) {
    const { html, selection } = renderStandard(post)
    const links = readMoreLinks(post)
    assert.equal(links.length, READ_MORE_COUNT, `${post.slug}: Read more lists ${links.length} posts`)
    for (const l of links) assert.match(l.href, /^\/(best|blog)\/[a-z0-9-]+$/, l.href)
    assert.equal((html.match(/data-read-more/g) ?? []).length, 1, `${post.slug}: Read more appears more than once`)
    const box = html.match(/<aside[^>]*data-read-more[\s\S]*?<\/aside>/)![0]
    assert.deepEqual([...box.matchAll(/href="([^"]+)"/g)].map((m) => m[1]), links.map((l) => l.href))
    const affitor = blogAffitorHref(post.slug)
    assert.equal(new URL(affitor).searchParams.get("utm_medium"), "blog")
    assert.equal(new URL(affitor).searchParams.get("utm_campaign"), post.slug)
    const tag = [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]).find((t) => t.includes(`href="${affitor.replaceAll("&", "&amp;")}"`))
    assert.ok(tag && tag.includes(`${AFFITOR_ATTR}="blog"`), `${post.slug}: no tracked Affitor marketplace link`)
    // Order at the end: last program, Affitor line, Read more, FAQ.
    const last = html.lastIndexOf(`data-post-program="${selection.shown.at(-1)!.program.slug}"`)
    const at = [html.indexOf("data-affitor-line"), html.indexOf("data-read-more"), html.indexOf("data-faq")]
    assert.ok(last < at[0] && at[0] < at[1] && at[1] < at[2], `${post.slug}: end blocks out of order ${JSON.stringify([last, ...at])}`)
  }
})

test("two-value terms show only the values recorded in conflicts[].values, in the field's currency; prohibitions lead the cons", () => {
  // Values come from the structured field, never from the quote text.
  assert.equal(twoValueText(["30 days", "60 days"], "cookie_days", "USD"), "30 days or 60 days")
  assert.equal(twoValueText(["30 days", "indefinitely"], "cookie_days", "USD"), "30 days or indefinitely")
  assert.equal(twoValueText([40, 80], "payout.minimum", "USD"), "$40 or $80")
  assert.equal(twoValueText([40, 80], "payout.minimum", "CHF"), "40 CHF or 80 CHF")
  assert.equal(twoValueText(undefined, "payout.minimum", "USD"), null)
  assert.deepEqual(parseNotes('conflicts:\n  - field: payout.minimum\n    quote: "a: \\"Minimum $80\\" b: \\"$40 minimum\\""\n').conflictValues.size, 0)
  assert.deepEqual(parseNotes('conflicts:\n  - field: cookie_days\n    quote: "x"\n    values: [30 days, 60 days]\n').conflictValues.get("cookie_days"), ["30 days", "60 days"])
  // Across the registry: a conflict with no recorded values never puts a figure in its cell or detail.
  const real = figureLeaks({ cookie: (p) => tableRow(p).cookie, details: programDetails })
  assert.ok(real.checked > 0, "no registry conflict without values was checked")
  assert.deepEqual(real.leaks, [])
  // The two programs on the hosting post carry recorded values.
  const verpex = allPrograms.find((x) => x.slug === "verpex")!
  assert.equal(tableRow(verpex).cookie, "30 days or indefinitely")
  assert.match(tableRow(verpex).payout, /^The brand gives two minimums \(\$40 or \$80\) and two schedules/)
  for (const post of STANDARD) {
    for (const { program: p } of postSelection(post, new Date(post.checked)).shown) {
      const { cons } = prosCons(p)
      const forbids = (r: string) => /^(no|do not|don't|never|not)\b/i.test(r)
      const firstOther = cons.findIndex((c) => !forbids(c))
      if (firstOther >= 0) assert.ok(cons.slice(firstOther).every((c) => !forbids(c)), `${p.slug}: a prohibition after other cons`)
      assert.doesNotMatch(tableRow(p).payout + programDetails(p).map((d) => d[1]).join(" "), /\b[Bb]ank\b(?! transfer)/, `${p.slug}: "Bank" should read "bank transfer"`)
    }
  }
})

test("a standard post's intro, with its computed picks sentence, stays within eighty words", () => {
  for (const post of STANDARD) {
    const selection = postSelection(post, new Date(post.checked))
    const words = `${post.intro} ${picksSentence(post, selection) ?? ""}`.split(/\s+/).filter(Boolean).length
    assert.ok(words <= 80, `${post.slug}: intro is ${words} words`)
  }
})

test("only the posts that opt in render the standard layout", () => {
  for (const post of POSTS) {
    if (post.layout === "standard") continue
    assert.equal(post.lookFor, undefined, `${post.slug}: lookFor without layout "standard" is never shown`)
    assert.equal(post.guides, undefined, `${post.slug}: guides without layout "standard" are never shown`)
  }
})

// ---------- /best/affiliate-networks -----------------------------------------

test("the networks post lists only networks that pay partners, with terms quoted from their own unblocked pages", () => {
  const entries = networkEntries()
  assert.ok(entries.length >= 5, `${entries.length} networks`)
  const keys = entries.map((e) => e.network)
  for (const [key, meta] of Object.entries(NETWORK_META)) {
    if (meta.kind !== "marketplace") assert.ok(!keys.includes(key), `${key} is ${meta.kind}, not a network`)
  }
  // Most live programs first.
  for (let i = 1; i < entries.length; i++) assert.ok(entries[i - 1].programs >= entries[i].programs)
  for (const e of entries) {
    const website = NETWORK_META[e.network].website!
    // A network's terms are read only when its host is not blocked, and every blocked one says so.
    assert.equal(e.terms === null, blockedReason(website) !== null, `${e.network}: terms ${e.terms ? "read" : "missing"} but host ${blockedReason(website) ? "blocked" : "allowed"}`)
    for (const c of e.terms ? [e.terms.join, e.terms.paid] : []) {
      assert.equal(blockedReason(c.source), null, `${e.network}: ${c.source} is blocked`)
      assert.match(c.checked, /^\d{4}-\d{2}-\d{2}$/)
      assert.ok(Date.parse(NETWORKS_POST.checked) - Date.parse(c.checked) <= 90 * 86_400_000, `${e.network}: terms read ${c.checked}`)
      assert.ok(c.quote.length > 10 && c.text.length > 10)
    }
    const capture = NETWORK_CAPTURES[e.network]
    if (capture) {
      assert.equal(blockedReason(capture.url), null, `${e.network}: captured a blocked host`)
      assert.ok(existsSync(join(process.cwd(), "public", capture.src)), `${e.network}: ${capture.src} missing`)
    } else assert.ok(NETWORK_CAPTURE_SKIPPED[e.network], `${e.network}: no capture and no recorded reason`)
    for (const p of e.examples) assert.ok(p.verified && p.network === e.network)
  }
  const NUMBER_WORDS = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|half|dozen)\b/i
  const p = NETWORKS_POST
  for (const t of [p.description, p.intro, p.lookFor.heading, p.lookFor.intro, ...p.lookFor.criteria.flatMap((c) => [c.name, c.text]), ...p.networks.flatMap((n) => [n.why, n.verdict]), p.softwareHeading, p.softwareText, p.howWeChose]) {
    assert.doesNotMatch(t.replace(/\bB2[BC]\b/g, ""), /\d/, `a digit in copy: ${t}`)
    assert.doesNotMatch(t, NUMBER_WORDS, `a spelled-out number in copy: ${t}`)
    assert.doesNotMatch(t, TEAM_NOTE)
  }
  assert.ok(p.description.length >= 120 && p.description.length <= 155, `description is ${p.description.length} characters`)
})

test("the networks post page: one tracked link per network, example programs tracked, the end blocks, FAQ in JSON-LD", () => {
  const html = renderToStaticMarkup(createElement(BestNetworksPost, { path: NETWORKS_POST_PATH }))
  const entries = networkEntries()
  for (const e of entries) {
    const section = html.slice(html.indexOf(`data-post-network="${e.network}"`)).split("data-post-network=")[1] ?? ""
    const href = networkHref(e, NETWORKS_POST.slug).replaceAll("&", "&amp;")
    assert.equal(section.split(`href="${href}"`).length - 1, 1, `${e.network}: one inline link to its page for partners`)
    for (const p of e.examples) assert.ok(section.includes(`href="${blogApplyHref(p, NETWORKS_POST.slug).replaceAll("&", "&amp;")}"`), `${e.network}: ${p.slug} is not linked`)
    assert.doesNotMatch(section, TEAM_NOTE)
  }
  // Affitor's section reads like every other: no label beyond its name.
  const affitor = html.slice(html.indexOf('data-post-network="affitor"')).split("data-post-network=")[1] ?? ""
  assert.doesNotMatch(affitor, TEAM_NOTE)
  assert.doesNotMatch(affitor, /Runs on Affitor|maintain|our own/i)
  const links = networkReadMoreLinks()
  assert.equal(links.length, READ_MORE_COUNT)
  const box = html.match(/<aside[^>]*data-read-more[\s\S]*?<\/aside>/)![0]
  assert.deepEqual([...box.matchAll(/href="([^"]+)"/g)].map((m) => m[1]), links.map((l) => l.href))
  const tag = [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]).find((t) => t.includes(`href="${blogAffitorHref(NETWORKS_POST.slug).replaceAll("&", "&amp;")}"`) && t.includes(`${AFFITOR_ATTR}="blog"`))
  assert.ok(tag, "no tracked Affitor marketplace line")
  const last = html.lastIndexOf(`data-post-network="${entries.at(-1)!.network}"`)
  const at = [html.indexOf("data-software"), html.indexOf("data-affitor-line"), html.indexOf("data-read-more"), html.indexOf("data-faq")]
  assert.ok(last < at[0] && at.every((x, i) => i === 0 || at[i - 1] < x), `blocks out of order ${JSON.stringify([last, ...at])}`)
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)![1])
  const faq = networksFaq(entries)
  assert.deepEqual(ld["@graph"].find((n: { "@type": string }) => n["@type"] === "FAQPage").mainEntity.map((q: { name: string }) => q.name), faq.map((f) => f.q))
  assert.doesNotMatch(html.replace(/<script[\s\S]*?<\/script>/g, ""), />[^<]*\b(undefined|NaN|null)\b[^<]*</)
  // In the blog index and the sitemap.
  assert.ok(blogEntries().posts.some((e) => e.href === NETWORKS_POST_PATH))
  assert.ok(sitemap().some((e) => e.url === `https://openaffiliate.dev${NETWORKS_POST_PATH}`))
})
