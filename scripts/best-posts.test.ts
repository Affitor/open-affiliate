import assert from "node:assert/strict"
import { test } from "node:test"
import { BEST_LISTS } from "../src/lib/best-lists"
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
