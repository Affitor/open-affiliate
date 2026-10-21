import assert from "node:assert/strict"
import { test } from "node:test"
import {
  BEST_LISTS,
  TITLE_MAX,
  buildBestList,
  childLists,
  countTitle,
  directorySentence,
  getBestList,
  listPageTitle,
  monthYear,
  plural,
} from "../src/lib/best-lists"
import { postPageTitle, readyPost } from "../src/lib/best-posts"

const row = (verified: boolean, lastVerifiedAt: string | null = "2026-10-20T08:00:00Z") => ({
  status: "active" as const,
  verified,
  lastVerifiedAt,
})

test("countTitle: query, count and month, every count from the caller", () => {
  assert.equal(countTitle("Recurring Affiliate Programs", 11, 11, "2026-10-18"), "Recurring Affiliate Programs: 11 Verified (Oct 2026)")
  assert.equal(countTitle("SEO Affiliate Programs", 48, 39, "2026-10-20"), "SEO Affiliate Programs: 48 Programs, 39 Verified (Oct 2026)")
  assert.equal(countTitle("SEO Affiliate Programs", 48, 0, "2026-10-20"), "SEO Affiliate Programs: 48 Programs (Oct 2026)")
  assert.equal(countTitle("SEO Affiliate Programs", 1, 0, null), "SEO Affiliate Programs: 1 Program")
  assert.equal(countTitle("Free Affiliate Programs", 9, 9, null), "Free Affiliate Programs: 9 Verified")
})

test("countTitle drops the verified count, then the counts, before going over TITLE_MAX", () => {
  const q = "Business Operations Recurring Affiliate Programs"
  const t = countTitle(q, 15, 11, "2026-10-20")
  assert.equal(t, `${q} (Oct 2026)`)
  assert.ok(t.length <= TITLE_MAX)
  assert.equal(countTitle("x".repeat(70), 3, 3, "2026-10-20"), "x".repeat(70), "a query alone is the last resort")
})

test("monthYear and plural", () => {
  assert.equal(monthYear("2026-01-01T00:30:00-08:00"), "Jan 2026")
  assert.equal(monthYear("2026-12-31"), "Dec 2026")
  assert.equal(plural(1, "affiliate program"), "1 affiliate program")
  assert.equal(plural(1258, "affiliate program"), "1,258 affiliate programs")
})

test("directorySentence agrees in number with its counts", () => {
  assert.equal(
    directorySentence([row(true), row(false)]),
    "OpenAffiliate is an open directory and database of 2 affiliate programs; 1 has its terms verified on the brand's own page, last checked 2026-10-20."
  )
  assert.match(directorySentence([row(true), row(true)]), /; 2 have their terms verified/)
  assert.match(directorySentence([row(false, null)]), /of 1 affiliate program; 0 have their terms verified on the brand's own page\.$/)
})

test("every /best title fits, leads with its query and counts what the page shows", () => {
  for (const list of BEST_LISTS) {
    const ready = readyPost(list.slug)
    const title = ready ? postPageTitle(ready.post, ready.selection) : listPageTitle(list)
    assert.ok(title.length <= TITLE_MAX, `${list.slug}: "${title}" is ${title.length} characters`)
    assert.ok(title.startsWith(list.query), `${list.slug}: "${title}" does not lead with "${list.query}"`)
    const shown = ready ? ready.selection.shown.length : buildBestList(list).rows.length
    if (title.includes(":")) assert.match(title, new RegExp(`: ${shown} (Verified|Programs?)\\b`), `${list.slug}: "${title}" does not count its ${shown} programs`)
  }
})

test("the recurring list is the parent of the per-category recurring lists", () => {
  const recurring = getBestList("recurring-affiliate-programs")!
  const children = childLists(recurring)
  assert.ok(children.length > 0)
  assert.ok(children.every((l) => l.slug.endsWith("-recurring-affiliate-programs") && l.scope))
  assert.ok(BEST_LISTS.filter((l) => l.scope).every((l) => l.parent && getBestList(l.parent)), "every per-category list has a parent list")
})
