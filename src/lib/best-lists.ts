import { commissionDisplay, commissionUnknown, livePrograms, rankScore, type Program } from "./programs"
import type { Faq } from "./program-seo"

/**
 * Best-of list pages at /best/<slug>. Adding a list is one entry in BEST_LISTS:
 * the page, its markdown twin, the sitemap and best.md all read from here.
 *
 * Rules every list shares, so no list can be hand-picked:
 *   - live programs only, and only those that publish a commission figure
 *     (every list ranks by it, and "Not published" cannot be ranked);
 *   - verified programs first, then by listScore (rankScore, the normalization
 *     the networks and categories pages use to compare % with flat fees);
 *   - ties go to lifetime recurring deals, then the name;
 *   - at most MAX_ROWS rows.
 */
export interface BestList {
  slug: string
  /** Before the layout's " | OpenAffiliate" suffix; the whole tag stays within 60 characters. */
  title: string
  h1: string
  /** Meta description, 120 to 155 characters. */
  description: string
  /** Completes "N live programs on OpenAffiliate …". */
  summary: string
  /** The filter in plain words, shown under "How we picked". Keep it in step with qualifies. */
  criteria: string
  qualifies: (p: Program) => boolean
}

export const MAX_ROWS = 50

/** Shown with every list, because it describes the shared rules above. */
export const SHARED_RULES =
  "Verified programs come first, then the rest, each ranked by commission; programs that do not publish a rate are left out."

export const BEST_LISTS: BestList[] = [
  {
    slug: "high-paying-affiliate-programs",
    title: "High-Paying Affiliate Programs, Ranked",
    h1: "High-Paying Affiliate Programs",
    description:
      "Affiliate programs that pay a top rate of 30% or more, or a flat $30 or more, ranked by commission. Verified terms first, with cookie and duration.",
    summary: "pay a top rate of 30% or more, or a flat $30 or more",
    criteria: "Programs that pay 30% or more, or a flat $30 or more, on at least part of the deal.",
    qualifies: (p) => listScore(p.commission) >= 30,
  },
  {
    slug: "affiliate-programs-for-beginners",
    title: "Affiliate Programs for Beginners, Ranked",
    h1: "Affiliate Programs for Beginners",
    description:
      "Affiliate programs that approve new affiliates automatically, so you can start the day you sign up. Ranked by commission, with verified terms first.",
    summary: "approve new affiliates automatically and do not list a payout minimum above $100",
    criteria: "Programs that approve new affiliates automatically and do not list a payout minimum above $100.",
    qualifies: (p) => p.approval === "auto" && (p.payout.minimum == null || p.payout.minimum <= 100),
  },
  {
    slug: "recurring-affiliate-programs",
    title: "Best Recurring Affiliate Programs, Ranked",
    h1: "Recurring Affiliate Programs",
    description:
      "Recurring affiliate programs that keep paying on renewals, ranked by rate. See which pay for 12 months or for life, with verified terms listed first.",
    summary: "list their commission as recurring",
    criteria: "Programs whose commission is listed as recurring.",
    qualifies: (p) => p.commission.type === "recurring",
  },
]

export function getBestList(slug: string): BestList | undefined {
  return BEST_LISTS.find((l) => l.slug === slug)
}

/**
 * The figure lists filter and rank on: rankScore of the typed value, except for
 * tiered and hybrid deals. Those display their raw rate text, so every % and $
 * figure in that text counts too, scored by rankScore one at a time: "$75 or
 * 20%" has a typed value of 20 but pays $75 on one branch, and "100% first
 * payment + 25% recurring" has 25 but pays 100% once. Percentage and flat deals
 * display their typed value, so ranking them by it keeps "30%" below "50%".
 *
 * A tiered or hybrid typed value carries no unit, so the text decides it: money
 * when the text has "$" and no percentage unit ("$50-75" is $75, not 75%). The
 * schema keeps the rate text as written, so "percent", "per cent" and "pct"
 * count as that unit alongside "%". A money range counts its upper bound
 * whether or not it repeats the "$" ("$10-100", "$10-$100", "$10 to 100").
 * verify-machine-surfaces pins these shapes.
 */
export function listScore(c: Program["commission"]): number {
  if (c.mode !== "tiered" && c.mode !== "hybrid") return rankScore(c)
  const raw = String(c.rate).replace(/,/g, "")
  const percent = /([\d.]+)\s*(?:%|per\s?cent\b|pct\b)/gi
  const moneyOnly = raw.includes("$") && !/%|\bper\s?cent\b|\bpct\b/i.test(raw)
  const parts = [
    rankScore(moneyOnly ? { ...c, mode: "flat" } : c),
    ...[...raw.matchAll(percent)].map((m) => rankScore(`${m[1]}%`)),
    ...[...raw.matchAll(/\$\s*([\d.]+)(?:\s*(?:[-–]|to)\s*\$?\s*([\d.]+))?/g)].flatMap((m) =>
      [m[1], m[2]].filter(Boolean).map((n) => rankScore(`$${n}`))
    ),
  ]
  return Math.max(...parts)
}

function isLifetime(p: Program): boolean {
  return p.commission.type === "recurring" && /lifetime/i.test(p.commission.duration ?? "")
}

/** "75-125% CPA + 25% annual, lifetime": the table's figure plus its duration. */
export function termsText(p: Program): string {
  const d = p.commission.duration
  return d ? `${commissionDisplay(p.commission)}, ${d}` : commissionDisplay(p.commission)
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  const m = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
  return Math.round(m * 10) / 10
}

function andList(items: string[]): string {
  return items.length < 3 ? items.join(" and ") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`
}

export interface BestListData {
  list: BestList
  /** What the page shows: verified first, at most MAX_ROWS. */
  rows: Program[]
  /** Every live program that qualifies, before the cap. */
  total: number
  /** Qualifying verified programs, in list order. */
  verified: Program[]
  /** Verified programs whose commission is a single percentage (mode "percentage"). */
  singlePctCount: number
  medianSinglePct: number | null
  /** Verified programs whose commission type is "recurring", and those with a lifetime duration. */
  recurringTypeCount: number
  lifetimeCount: number
  /** Verified programs that publish a cookie window. */
  cookieDays: number[]
  /** Latest last_verified_at among the rows, YYYY-MM-DD. */
  checked: string | null
}

const built = new Map<string, BestListData>()

export function buildBestList(list: BestList): BestListData {
  const cached = built.get(list.slug)
  if (cached) return cached
  const qualifying = livePrograms
    .filter((p) => !commissionUnknown(p.commission) && list.qualifies(p))
    .sort(
      (a, b) =>
        Number(b.verified) - Number(a.verified) ||
        listScore(b.commission) - listScore(a.commission) ||
        Number(isLifetime(b)) - Number(isLifetime(a)) ||
        a.name.localeCompare(b.name)
    )
  const rows = qualifying.slice(0, MAX_ROWS)
  const verified = qualifying.filter((p) => p.verified)
  const singlePct = verified.flatMap((p) =>
    p.commission.mode === "percentage" && p.commission.value != null ? [p.commission.value] : []
  )
  const recurringType = verified.filter((p) => p.commission.type === "recurring")
  const data: BestListData = {
    list,
    rows,
    total: qualifying.length,
    verified,
    singlePctCount: singlePct.length,
    medianSinglePct: median(singlePct),
    recurringTypeCount: recurringType.length,
    lifetimeCount: recurringType.filter(isLifetime).length,
    cookieDays: verified.flatMap((p) => (p.cookieDays != null ? [p.cookieDays] : [])),
    checked:
      rows
        .flatMap((p) => (p.lastVerifiedAt ? [p.lastVerifiedAt.slice(0, 10)] : []))
        .sort()
        .at(-1) ?? null,
  }
  built.set(list.slug, data)
  return data
}

/**
 * The intro and FAQ, as sentences. Facts about specific programs come from
 * verified programs only: an answer reads as a statement of fact, and the rest
 * of the registry is community-submitted.
 *
 * `esc` is applied to every contributor-written piece (names, rate text,
 * durations, and `checked`: ten characters of a contributor's
 * last_verified_at are room enough for `[a](//x.y)`) and to nothing else.
 * The page passes nothing, since React escapes;
 * the markdown twin passes its inline escaper, so a name cannot become a link.
 */
export function bestListCopy(data: BestListData, esc: (text: string) => string = (t) => t): { intro: string; faq: Faq[] } {
  const { list, verified, total, rows } = data
  const pick = (p: Program) => `${esc(p.name)} (${esc(termsText(p))})`
  const top = verified[0]
  const noun = list.h1.toLowerCase()

  const intro =
    `${total} live programs on OpenAffiliate ${list.summary}, and ${verified.length} of them have terms verified against the program's own page.` +
    (top
      ? ` The top verified pick is ${pick(top)}` +
        (data.medianSinglePct != null
          ? `, and the median among verified programs with a single percentage rate is ${data.medianSinglePct}%.`
          : ".")
      : "")

  const faq: Faq[] = [
    {
      q: `How many ${noun} does OpenAffiliate list?`,
      a: `${total} live programs ${list.summary}. ${verified.length} have terms verified against the program's own page; the rest are community-submitted and not yet confirmed.${total > rows.length ? ` This page shows the top ${rows.length}.` : ""}`,
    },
  ]
  if (top) {
    faq.push({
      q: `Which ${noun} pay the most?`,
      a: `Among verified programs, the highest by commission are ${andList(verified.slice(0, 3).map(pick))}.`,
    })
  }
  if (data.medianSinglePct != null) {
    faq.push({
      q: `How much do ${noun} pay?`,
      a:
        `The median rate is ${data.medianSinglePct}% across the ${data.singlePctCount} verified programs with a single percentage rate. ` +
        (data.recurringTypeCount === verified.length
          ? `${data.lifetimeCount} of the ${verified.length} verified programs list a lifetime duration.`
          : `${data.recurringTypeCount} of the ${verified.length} verified programs list recurring as their commission type, ${data.lifetimeCount} of those with a lifetime duration.`),
    })
  }
  if (data.cookieDays.length > 0) {
    faq.push({
      q: `How long do cookies last on ${noun}?`,
      a: `Among the ${data.cookieDays.length} verified programs that publish a cookie window, the median is ${median(data.cookieDays)} days and the longest is ${Math.max(...data.cookieDays)} days.`,
    })
  }
  faq.push({
    q: "How was this list picked?",
    a: `${list.criteria} ${SHARED_RULES}${data.checked ? ` The most recent verification among these programs was on ${esc(data.checked)}.` : ""}`,
  })

  return { intro, faq }
}
