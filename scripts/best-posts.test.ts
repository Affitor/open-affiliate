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
import { existsSync, statSync } from "node:fs"
import { join } from "node:path"
import { BestPostStandard } from "../src/components/best-post-standard"
import { NOT_RECORDED, NOT_STATED, STATED_TWO_WAYS, approvalShort, cookieCell, payoutCell, picksSentence, standardFaq, typeSplit } from "../src/lib/best-standard"
import { CAPTURES, CAPTURE_SKIPPED } from "../src/lib/best-captures"
import { leadReceipt, parseNotes, parseReceipts, termNotes } from "../src/lib/term-receipts"
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

// ---------- standard "best X" layout (components/best-post-standard.tsx) ----

function renderStandard(post: (typeof POSTS)[number]) {
  const list = postList(post)!
  const selection = postSelection(post, new Date(post.checked))
  const html = renderToStaticMarkup(
    createElement(BestPostStandard, { post, list, selection, path: bestPath(list), parent: { name: "Best Affiliate Programs", href: "/best" } }),
  )
  return { html, selection }
}

test("a standard post: eight table columns, every anchor lands on a section, FAQ JSON-LD matches, Apply links carry the blog UTM", () => {
  const standard = POSTS.filter((p) => p.layout === "standard")
  assert.ok(standard.length > 0, "no post opts into the standard layout")
  for (const post of standard) {
    assert.ok(post.lookFor && post.programs.every((p) => p.verdict), `${post.slug}: a standard post needs lookFor and a verdict per program`)
    const { html, selection } = renderStandard(post)
    const table = html.match(/<table data-terms-table[\s\S]*?<\/thead>/)![0]
    const heads = [...table.matchAll(/<th[^>]*scope="col"[^>]*>[\s\S]*?<button[^>]*>([^<]+)/g)].map((m) => m[1].trim())
    assert.deepEqual(heads, ["Program", "Best for", "You earn", "Type", "Cookie", "Approval", "Payout", "Checked"])
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))
    const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1])
    assert.ok(anchors.length > selection.shown.length * 2, `${post.slug}: too few in-page links`)
    for (const a of anchors) assert.ok(ids.has(a), `${post.slug}: #${a} has no section`)
    for (const { program } of selection.shown) {
      assert.ok(ids.has(program.slug), `${post.slug}: no section for ${program.slug}`)
      const href = blogApplyHref(program, post.slug)
      assert.ok(html.includes(`href="${href.replaceAll("&", "&amp;")}"`), `${post.slug}: no Apply link for ${program.slug}`)
    }
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)![1])
    const faqLd = ld["@graph"].find((n: { "@type": string }) => n["@type"] === "FAQPage")
    const faq = standardFaq(post, selection, typeSplit(post, selection))
    assert.ok(faq.length >= 5 && faq.length <= 7, `${post.slug}: ${faq.length} FAQ questions`)
    assert.deepEqual(faqLd.mainEntity.map((q: { name: string }) => q.name), faq.map((f) => f.q))
    for (const q of faqLd.mainEntity) {
      assert.equal(q["@type"], "Question")
      assert.equal(q.acceptedAnswer["@type"], "Answer")
      assert.doesNotMatch(q.acceptedAnswer.text, /undefined|NaN|null|\[object/)
    }
    assert.doesNotMatch(html.replace(/<script[\s\S]*?<\/script>/g, ""), />[^<]*\b(undefined|NaN)\b[^<]*</)
    assert.ok(html.includes("data-post-disclosure") && html.includes("data-how-we-chose") && html.includes("data-type-chart"))
    // "What changed this month" sits at the bottom, after the FAQ.
    if (html.includes('id="what-changed"')) assert.ok(html.indexOf('id="what-changed"') > html.indexOf('id="faq"'))
  }
})

test("a standard post shows a capture or a stated fallback for every program, each capture on disk and in budget", () => {
  for (const post of POSTS.filter((p) => p.layout === "standard")) {
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
        assert.ok(CAPTURE_SKIPPED[program.slug], `${program.slug}: no capture and no stated reason`)
      }
    }
    const fallbacks = (html.match(/data-capture-fallback/g) ?? []).length
    assert.equal(fallbacks, selection.shown.filter(({ program }) => !CAPTURES[program.slug]).length)
  }
})

test("receipts: only a quoted line with one source, attached to the next key, short, linked only to the brand's own site", () => {
  const yaml = [
    '# "earn up to $500 per sale" (brand.com/affiliates, checked 2026-10-13)',
    "commission:",
    "  type: one-time",
    '# "30 days" (brand.com/a, checked 2026-10-13) vs "60 days" (brand.com/b, checked 2026-10-13)',
    "",
    '# cookie: "Your referrals have 60 days" (https://www.brand.com/faq, checked 2026-10-12)',
    "cookie_days: 60",
    '# "paid monthly" (other.com/terms, checked 2026-10-12)',
    "",
    "payout:",
    `# "${"word ".repeat(30).trim()}" (brand.com/terms, checked 2026-10-12)`,
    "approval: manual",
  ].join("\n")
  const r = parseReceipts(yaml, "https://brand.com")
  assert.deepEqual(r.map((x) => [x.field, x.quote, x.href]), [
    ["commission", "earn up to $500 per sale", "https://brand.com/affiliates"],
    ["cookie", "Your referrals have 60 days", "https://www.brand.com/faq"],
  ])
  // A quote from another site (a directory, a network page) is never shown as the brand's.
  assert.deepEqual(parseReceipts('# "a b c" (evil.com/x, checked 2026-10-12)\napproval: auto', "https://brand.com"), [])
  // The commission quote leads even when short; the newest receipt wins within a field.
  const many = parseReceipts(
    '# "€20.00" and "€250.00" (b.com, checked 2026-10-12)\ncommission:\n# "after a sixty day wait" (b.com, checked 2026-10-12)\n# "paid on the first" (b.com, checked 2026-10-19)\npayout:',
    "https://b.com",
  )
  assert.equal(leadReceipt(many)?.quote, "€20.00 … €250.00")
  assert.equal(leadReceipt(many.filter((r) => r.field !== "commission"))?.quote, "paid on the first")
  // A receipt for a fact the section leaves empty never leads.
  assert.equal(leadReceipt(many.filter((r) => r.field !== "commission"), (f) => f !== "payout"), null)
})

test("empty terms are labelled the way the YAML backs them: two ways, not published, or not recorded", () => {
  const notes = parseNotes(
    [
      "# cookie window: not published on b.com/affiliates (checked 2026-10-12)",
      "not_published:",
      '  payout.methods: "2026-10-18"',
      "conflicts:",
      "  - field: payout.minimum",
      '    quote: "x"',
      "# Runs on a platform the network enum does not list",
      "network: null",
    ].join("\n"),
    "https://b.com",
  )
  assert.deepEqual([...notes.notPublished].sort(), ["cookie_days", "payout.methods"])
  assert.deepEqual([...notes.conflicts], ["payout.minimum"])
  assert.equal(notes.networkOutsideList, true)
  assert.equal(parseNotes("network: null", "https://b.com").networkOutsideList, false)

  // On the page: a field the brand states two ways never reads "Not stated by the brand".
  for (const post of POSTS.filter((p) => p.layout === "standard")) {
    for (const { program: p } of postSelection(post, new Date(post.checked)).shown) {
      const { conflicts, notPublished } = termNotes(p.slug, p.url)
      if (p.cookieDays == null) {
        const want = conflicts.has("cookie_days") ? STATED_TWO_WAYS : notPublished.has("cookie_days") ? NOT_STATED : NOT_RECORDED
        assert.equal(cookieCell(p), want, `${p.slug}: cookie`)
      }
      if (["payout.minimum", "payout.frequency"].some((f) => conflicts.has(f))) assert.ok(payoutCell(p).startsWith(STATED_TWO_WAYS), `${p.slug}: payout`)
      if (approvalShort(p) === NOT_STATED) assert.ok(notPublished.has("approval"), `${p.slug}: approval not stated without a record`)
      if (payoutCell(p).includes(NOT_STATED)) assert.ok(notPublished.has("payout.minimum") && notPublished.has("payout.methods"), `${p.slug}: payout not stated without a record`)
    }
  }
})

test("a standard post's intro, with its computed picks sentence, stays within eighty words", () => {
  for (const post of POSTS.filter((p) => p.layout === "standard")) {
    const selection = postSelection(post, new Date(post.checked))
    const words = `${post.intro} ${picksSentence(post, selection) ?? ""}`.split(/\s+/).filter(Boolean).length
    assert.ok(words <= 80, `${post.slug}: intro is ${words} words`)
  }
})

test("only the posts that opt in render the standard layout", () => {
  for (const post of POSTS) {
    if (post.layout === "standard") continue
    assert.equal(post.lookFor, undefined, `${post.slug}: lookFor without layout "standard" is never shown`)
  }
})
