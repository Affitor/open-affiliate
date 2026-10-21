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
import { AFFITOR_LINE, NOT_RECORDED, NOT_STATED, PROS_CONS_MAX, READ_MORE_COUNT, STATED_TWO_WAYS, picksSentence, readMoreLinks, twoValueText, programDetails, prosCons, splitLink, standardFaq, tableRow, typeSplit } from "../src/lib/best-standard"
import { CAPTURES, CAPTURE_SKIPPED } from "../src/lib/best-captures"
import { parseNotes, termNotes } from "../src/lib/term-notes"
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

test("a guide page: Apply links carry the guide's blog UTM, no Affitor link, the disclosure cites its source, FAQ in JSON-LD", () => {
  for (const g of GUIDES) {
    const selection = guideSelection(g, new Date(g.checked))
    const html = renderToStaticMarkup(createElement(GuideView, { guide: g, selection, path: guidePath(g) }))
    for (const { program } of selection.shown) {
      const href = blogApplyHref(program, g.slug)
      assert.equal(new URL(href).searchParams.get("utm_campaign"), g.slug)
      assert.ok(html.includes(`href="${href.replaceAll("&", "&amp;")}"`), `${g.slug}: no Apply link for ${program.slug}`)
    }
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replaceAll("&amp;", "&"))
    for (const h of hrefs) assert.ok(!isAffitorHref(h), `${g.slug}: Affitor link ${h}`)
    assert.ok(hrefs.includes(DISCLOSURE_SOURCE.href), `${g.slug}: the disclosure does not cite its source`)
    assert.ok(html.includes("data-post-disclosure") && html.includes("data-registry-facts"))
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)![1])
    const faqLd = ld["@graph"].find((n: { "@type": string }) => n["@type"] === "FAQPage")
    assert.deepEqual(faqLd.mainEntity.map((q: { name: string }) => q.name), g.faq.map((f) => f.q))
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
