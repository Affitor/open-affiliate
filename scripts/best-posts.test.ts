import assert from "node:assert/strict"
import { test } from "node:test"
import { BEST_LISTS, HUB_MIN_INDEXED, bestPath, buildBestList, categoryList, getBestList, indexable, otherLists } from "../src/lib/best-lists"
import { commissionUnknown, livePrograms } from "../src/lib/programs"
import sitemap from "../src/app/sitemap"
import { blogApplyHref } from "../src/lib/apply-cta"
import { isAffitorHref } from "../src/lib/affitor-link"
import { getProgram, isLive } from "../src/lib/programs"
import { hasNoProgram } from "../src/lib/no-program"
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

