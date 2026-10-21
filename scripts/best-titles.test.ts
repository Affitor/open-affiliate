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

test("countTitle: a 0 count is dropped, not printed", () => {
  assert.equal(countTitle("SEO Affiliate Programs", 0, 0, "2026-10-20"), "SEO Affiliate Programs (Oct 2026)")
  assert.equal(countTitle("SEO Affiliate Programs", 0, 0, null), "SEO Affiliate Programs")
})

/** The numbers a title states: "551 Verified" → [551, 551]; "48 Programs, 39 Verified" → [48, 39]; none → null. */
function titleCounts(title: string): [number, number] | null {
  const m = /: ([\d,]+) (Verified|Programs?)(?:, ([\d,]+) Verified)?/.exec(title)
  if (!m) return null
  const a = Number(m[1].replace(/,/g, ""))
  return [a, m[2] === "Verified" ? a : m[3] ? Number(m[3].replace(/,/g, "")) : -1]
}

test("every /best title fits, leads with its query and states the page's own counts", () => {
  for (const list of BEST_LISTS) {
    const ready = readyPost(list.slug)
    const title = ready ? postPageTitle(ready.post, ready.selection) : listPageTitle(list)
    assert.ok(title.length <= TITLE_MAX, `${list.slug}: "${title}" is ${title.length} characters`)
    assert.ok(title.startsWith(list.query), `${list.slug}: "${title}" does not lead with "${list.query}"`)
    const counts = titleCounts(title)
    if (!counts) continue
    if (ready) {
      // A post states its blocks, all verified.
      const n = ready.selection.shown.length
      assert.deepEqual(counts, [n, n], `${list.slug}: "${title}" does not count its ${n} blocks`)
    } else {
      // A list states its header stats: Programs (total) and Verified.
      const { total, verified } = buildBestList(list)
      assert.equal(counts[0], total, `${list.slug}: "${title}" does not match the Programs stat ${total}`)
      if (counts[1] !== -1) assert.equal(counts[1], verified.length, `${list.slug}: "${title}" does not match the Verified stat ${verified.length}`)
    }
  }
})

test("a capped list's title states the Verified stat, not the row cap", () => {
  const hub = BEST_LISTS[0]
  const data = buildBestList(hub)
  assert.ok(data.rows.length < data.verified.length, "the /best hub shows fewer rows than it has verified programs")
  assert.deepEqual(titleCounts(listPageTitle(hub)), [data.verified.length, data.verified.length])
})

test("the recurring list is the parent of the per-category recurring lists", () => {
  const recurring = getBestList("recurring-affiliate-programs")!
  const children = childLists(recurring)
  assert.ok(children.length > 0)
  assert.ok(children.every((l) => l.slug.endsWith("-recurring-affiliate-programs") && l.scope))
  assert.ok(BEST_LISTS.filter((l) => l.scope).every((l) => l.parent && getBestList(l.parent)), "every per-category list has a parent list")
})
