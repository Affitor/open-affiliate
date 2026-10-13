/**
 * Every order "by commission" runs on commissionRank: structured fields only,
 * listScore without its cap, so a tie at the cap goes to the larger figure
 * ($10,000 before $550), and commissions it cannot rank (unpublished, tiered,
 * hybrid, referral, a flat amount in another currency) come last. That covers
 * the /best lists, category pages, the "pay the most" FAQ, and the browser's
 * /programs "Highest Commission" sort and /rankings commission column, which
 * read the commissionRank build-registry ships in client-registry.json.
 * Every one of them sorts through compareCommission (commission-order.ts), so
 * two surfaces that order the same programs agree on every pair, ties
 * included; lists keep verified-first as an outer key. Network pages are
 * checked as served against the REST order, in verify-machine-surfaces.
 *
 * Reads src/lib/registry.json and client-registry.json, so run it after
 * build-registry (CI runs it after `npm run build`).
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { BEST_LISTS, buildBestList, categoryList, listScore } from "../src/lib/best-lists"
import {
  compareByCommission,
  programs as clientPrograms,
  searchPrograms as clientSearch,
  type ClientProgram,
} from "../src/lib/client-programs"
import {
  categories,
  commissionRank,
  commissionUnknown,
  getProgram,
  liveNetworks,
  livePrograms,
  searchPrograms,
  type Program,
} from "../src/lib/programs"

function program(name: string, commission: Partial<Program["commission"]>, over: Partial<Omit<Program, "commission">> = {}): Program {
  return {
    slug: name.toLowerCase(),
    name,
    url: "https://example.com",
    logo: name[0],
    category: "SaaS",
    commission: { type: "one-time", rate: "", mode: "unknown", value: null, currency: "USD", duration: null, ...commission },
    payout: {},
    description: "",
    shortDescription: "",
    tags: [],
    stars: 0,
    verified: false,
    agentPrompt: "",
    submittedBy: "test",
    createdAt: "2026-10-13",
    kind: "affiliate",
    ...over,
  }
}

test("a tie at listScore's cap goes to the larger figure", () => {
  const capped = [
    program("F550", { mode: "flat", value: 550, currency: "USD" }),
    program("F10000", { mode: "flat", value: 10000, currency: "USD" }),
    program("F1000", { mode: "flat", value: 1000, currency: "USD" }),
    program("R150", { mode: "percentage", value: 150 }),
  ]
  // Non-vacuity: listScore ties every one of them at 100.
  for (const p of capped) assert.equal(listScore(p), 100, p.slug)
  assert.deepEqual(
    capped.map((p) => commissionRank(p)),
    [100, 1045, 145, 150]
  )
  const order = [...capped].sort((a, b) => commissionRank(b) - commissionRank(a)).map((p) => p.slug)
  assert.deepEqual(order, ["f10000", "r150", "f1000", "f550"])
  // Below the cap the rank is listScore itself.
  for (const p of [program("R30", { mode: "percentage", value: 30 }), program("F40", { mode: "flat", value: 40, currency: "USD" })]) {
    assert.equal(commissionRank(p), listScore(p), p.slug)
  }
})

test("commissions commissionRank cannot rank score 0", () => {
  for (const p of [
    program("Gift", { mode: "flat", value: 200, currency: "USD" }, { kind: "referral" }),
    program("Tiered", { mode: "tiered", value: 150, currency: "USD", rate: "up to $150" }),
    program("Hybrid", { mode: "hybrid", value: 80 }),
    program("Euro", { mode: "flat", value: 900, currency: "EUR" }),
    program("Unpublished", { mode: "unknown", value: null }),
  ]) {
    assert.equal(commissionRank(p), 0, p.slug)
  }
})

test("lists and category pages order each group by commissionRank, and the cap tie-break is exercised", () => {
  const lists = [...BEST_LISTS.filter((l) => !l.rank), ...categories.map(categoryList)]
  let capTies = 0
  for (const list of lists) {
    const rows = buildBestList(list).rows
    for (let i = 1; i < rows.length; i++) {
      const [a, b] = [rows[i - 1], rows[i]]
      // Groups: verified first, then (directories only) unpublished last.
      if (a.verified !== b.verified || commissionUnknown(a.commission) !== commissionUnknown(b.commission)) continue
      assert.ok(commissionRank(a) >= commissionRank(b), `${list.slug}: ${b.slug} (${commissionRank(b)}) after ${a.slug} (${commissionRank(a)})`)
      if (listScore(a) === 100 && listScore(b) === 100 && commissionRank(a) > commissionRank(b)) capTies++
    }
  }
  assert.ok(capTies > 0, "no list holds two programs at the cap, so the tie-break went untested")
})

function row(slug: string, commissionRank: number): ClientProgram {
  const mode = commissionRank > 0 ? "percentage" : "unknown"
  return { slug, name: slug, commissionRank, commission: { type: "one-time", rate: "", mode, value: null, currency: "USD" } } as ClientProgram
}

test("the browser's commission sorts keep unrankable programs last in both directions", () => {
  const rows = [row("zero", 0), row("thirty", 30), row("tenk", 1045), row("zero2", 0), row("cap", 100)]
  const sorted = (dir: number) => [...rows].sort((a, b) => compareByCommission(a, b, dir)).map((r) => r.slug)
  assert.deepEqual(sorted(-1), ["tenk", "cap", "thirty", "zero", "zero2"])
  assert.deepEqual(sorted(1), ["thirty", "cap", "tenk", "zero", "zero2"])
})

test("/programs Highest Commission follows commissionRank, not the stored value", () => {
  const sorted = clientSearch({ sort: "commission_desc" })
  assert.equal(sorted.length, clientPrograms.length)
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(sorted[i - 1].commissionRank >= sorted[i].commissionRank, `${sorted[i].slug} after ${sorted[i - 1].slug}`)
  }
  for (const p of sorted) assert.equal(p.commissionRank, commissionRank(getProgram(p.slug)!), p.slug)
  // Non-vacuity: a stored value larger than a ranked program's comes after it,
  // because it is tiered, a referral reward or in another currency.
  const at = new Map(sorted.map((p, i) => [p.slug, i]))
  const outranked = sorted.some((p) =>
    p.commissionRank === 0 &&
    (p.commission.value ?? 0) > 0 &&
    sorted.some((q) => q.commissionRank > 0 && (q.commission.value ?? 0) < (p.commission.value ?? 0) && at.get(q.slug)! < at.get(p.slug)!)
  )
  assert.ok(outranked, "no unrankable program with a large stored value to check")
})

const slugs = (rows: { slug: string }[]) => rows.map((r) => r.slug)

/**
 * Pairs two orders of overlapping programs rank differently. `sameGroup`
 * limits the pairs to those a surface does not split by an outer key (the
 * lists' verified-first). Returns the disagreements and how many pairs tied on
 * commissionRank, which only the shared tie-break can order.
 */
function disagreements(a: string[], b: string[], sameGroup: (x: string, y: string) => boolean = () => true) {
  const at = new Map(b.map((slug, i) => [slug, i]))
  const both = a.filter((slug) => at.has(slug))
  const found: string[] = []
  let ties = 0
  for (let i = 0; i < both.length; i++) {
    for (let j = i + 1; j < both.length; j++) {
      const [x, y] = [both[i], both[j]]
      if (!sameGroup(x, y)) continue
      if (commissionRank(getProgram(x)!) === commissionRank(getProgram(y)!)) ties++
      if (at.get(x)! > at.get(y)!) found.push(`${x} / ${y}`)
    }
  }
  return { found, ties }
}

test("every surface that orders the same programs by commission agrees on every pair, ties included", () => {
  const sameVerified = (x: string, y: string) => getProgram(x)!.verified === getProgram(y)!.verified
  let ties = 0
  for (const category of categories) {
    const rest = slugs(searchPrograms({ category, sort: "commission_desc" }))
    const browser = slugs(clientSearch({ category, sort: "commission_desc" }))
    const page = slugs(buildBestList(categoryList(category)).rows)
    for (const [label, d] of [
      ["REST vs browser", disagreements(rest, browser)],
      ["category page vs REST", disagreements(page, rest, sameVerified)],
    ] as const) {
      assert.deepEqual(d.found.slice(0, 3), [], `${category}, ${label}`)
      ties += d.ties
    }
  }
  for (const network of liveNetworks) {
    const d = disagreements(slugs(searchPrograms({ network, sort: "commission_desc" })), slugs(clientSearch({ network, sort: "commission_desc" })))
    assert.deepEqual(d.found.slice(0, 3), [], `network ${network}, REST vs browser`)
    ties += d.ties
  }
  // Non-vacuity: plenty of pairs tie on commissionRank, so the tie-break is exercised.
  assert.ok(ties > 100, `${ties} tied pairs`)
  // The case review found: Rytr and Scalenut, both verified AI programs at 30%.
  const [rytr, scalenut] = [getProgram("rytr"), getProgram("scalenut")]
  if (rytr && scalenut && commissionRank(rytr) === commissionRank(scalenut)) {
    const orders = [
      slugs(searchPrograms({ category: rytr.category, sort: "commission_desc" })),
      slugs(clientSearch({ category: rytr.category, sort: "commission_desc" })),
      slugs(buildBestList(categoryList(rytr.category)).rows),
    ].map((order) => order.indexOf("rytr") < order.indexOf("scalenut"))
    assert.ok(orders.every((o) => o === orders[0]), `rytr/scalenut ordered ${JSON.stringify(orders)}`)
  }
})

test("searchPrograms leaves livePrograms alone, so one request cannot reorder the next", () => {
  const base = slugs(livePrograms)
  const relevance = slugs(searchPrograms({}))
  const commission = slugs(searchPrograms({ sort: "commission_desc" }))
  searchPrograms({ sort: "za" })
  assert.deepEqual(slugs(livePrograms), base)
  // Relevance breaks Affiliate Score ties by the base order, so a reordered
  // base would show here.
  assert.deepEqual(slugs(searchPrograms({})), relevance)
  assert.deepEqual(slugs(searchPrograms({ sort: "commission_desc" })), commission)
})
