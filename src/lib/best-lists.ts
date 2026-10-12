import { commissionDisplay, commissionUnknown, livePrograms, rankScore, type Program } from "./programs"
import type { Faq } from "./program-seo"

/**
 * Best-of list pages at /best/<slug>. Adding a list is one entry in BEST_LISTS:
 * the page, its markdown twin, the sitemap and best.md all read from here.
 *
 * Rules every list shares, so no list can be hand-picked:
 *   - live programs only, and only those that publish a commission figure
 *     (every list ranks by it, and "Not published" cannot be ranked);
 *   - verified programs first, then by rankScore, the same normalization the
 *     networks and categories pages use to compare % with flat fees;
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
  /** The filter in words, shown under "How we picked". Keep it in step with qualifies. */
  criteria: string
  qualifies: (p: Program) => boolean
}

export const MAX_ROWS = 50

/** Shown with every list, because it describes the shared rules above. */
export const SHARED_RULES =
  "Programs that do not publish a commission figure are left out. Verified programs come first, then the rest by top commission rate (a flat fee counts $1 as one point up to $50, then a tenth of a point per dollar, capped at 100). Ties go to lifetime recurring deals, then the name."

export const BEST_LISTS: BestList[] = [
  {
    slug: "high-paying-affiliate-programs",
    title: "High-Paying Affiliate Programs, Ranked",
    h1: "High-Paying Affiliate Programs",
    description:
      "Affiliate programs that pay a top rate of 30% or more, or a flat $30 or more, ranked by commission. Verified terms first, with cookie and duration.",
    summary: "pay a top rate of 30% or more, or a flat $30 or more",
    criteria: "Live programs whose top commission rate is 30% or more, or whose flat payout is $30 or more.",
    qualifies: (p) => rankScore(p.commission) >= 30,
  },
  {
    slug: "affiliate-programs-for-beginners",
    title: "Affiliate Programs for Beginners, Ranked",
    h1: "Affiliate Programs for Beginners",
    description:
      "Affiliate programs that approve new affiliates automatically, so you can start the day you sign up. Ranked by commission, with verified terms first.",
    summary: "approve new affiliates automatically and do not list a payout minimum above $100",
    criteria:
      "Live programs that approve affiliates automatically (no application review) and whose payout minimum, where stated, is $100 or less.",
    qualifies: (p) => p.approval === "auto" && (p.payout.minimum == null || p.payout.minimum <= 100),
  },
  {
    slug: "recurring-affiliate-programs",
    title: "Best Recurring Affiliate Programs, Ranked",
    h1: "Recurring Affiliate Programs",
    description:
      "Recurring affiliate programs that keep paying on renewals, ranked by rate. See which pay for 12 months or for life, with verified terms listed first.",
    summary: "pay recurring commission on the customers you refer",
    criteria: "Live programs whose commission type is recurring.",
    qualifies: (p) => p.commission.type === "recurring",
  },
]

export function getBestList(slug: string): BestList | undefined {
  return BEST_LISTS.find((l) => l.slug === slug)
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
  verifiedTotal: number
  topVerified: Program | null
  /** Median among qualifying verified programs that pay a percentage. */
  medianVerifiedPct: number | null
  /** Latest last_verified_at among the rows, YYYY-MM-DD. */
  checked: string | null
  intro: string
  faq: Faq[]
}

/**
 * Stats and FAQ answers come from verified programs only: an answer reads as a
 * statement of fact, and the rest of the registry is community-submitted.
 */
export function buildBestList(list: BestList): BestListData {
  const qualifying = livePrograms
    .filter((p) => !commissionUnknown(p.commission) && list.qualifies(p))
    .sort(
      (a, b) =>
        Number(b.verified) - Number(a.verified) ||
        rankScore(b.commission) - rankScore(a.commission) ||
        Number(isLifetime(b)) - Number(isLifetime(a)) ||
        a.name.localeCompare(b.name)
    )
  const rows = qualifying.slice(0, MAX_ROWS)
  const verified = qualifying.filter((p) => p.verified)
  const pctRates = verified.flatMap((p) => (p.commission.mode === "percentage" && p.commission.value != null ? [p.commission.value] : []))
  const medianVerifiedPct = median(pctRates)
  const cookies = verified.flatMap((p) => (p.cookieDays != null ? [p.cookieDays] : []))
  const recurring = verified.filter((p) => p.commission.type === "recurring")
  const lifetime = recurring.filter(isLifetime)
  const checked =
    rows
      .flatMap((p) => (p.lastVerifiedAt ? [p.lastVerifiedAt.slice(0, 10)] : []))
      .sort()
      .at(-1) ?? null
  const topVerified = verified[0] ?? null
  const noun = list.h1.toLowerCase()

  const intro =
    `${qualifying.length} live programs on OpenAffiliate ${list.summary}, and ${verified.length} of them have terms verified against the program's own page.` +
    (topVerified
      ? ` The top verified pick is ${topVerified.name} at ${termsText(topVerified)}` +
        (medianVerifiedPct != null ? `, and the median verified percentage rate is ${medianVerifiedPct}%.` : ".")
      : "")

  const faq: Faq[] = [
    {
      q: `How many ${noun} does OpenAffiliate list?`,
      a: `${qualifying.length} live programs ${list.summary}. ${verified.length} have terms verified against the program's own page; the rest are community-submitted and not yet confirmed.${qualifying.length > rows.length ? ` This page shows the top ${rows.length}.` : ""}`,
    },
  ]
  if (verified.length > 0) {
    faq.push({
      q: `Which ${noun} pay the most?`,
      a: `Among verified programs, the highest by commission are ${andList(verified.slice(0, 3).map((p) => `${p.name} (${termsText(p)})`))}.`,
    })
  }
  if (medianVerifiedPct != null) {
    faq.push({
      q: `How much do ${noun} pay?`,
      a:
        `The median rate is ${medianVerifiedPct}% across the ${pctRates.length} verified programs that pay a percentage. ` +
        (recurring.length === verified.length
          ? `${lifetime.length} of the ${verified.length} verified programs pay for the customer's lifetime.`
          : `${recurring.length} of the ${verified.length} verified programs pay recurring commission, ${lifetime.length} of them for the customer's lifetime.`),
    })
  }
  if (cookies.length > 0) {
    faq.push({
      q: `How long do cookies last on ${noun}?`,
      a: `Among the ${cookies.length} verified programs that publish a cookie window, the median is ${median(cookies)} days and the longest is ${Math.max(...cookies)} days.`,
    })
  }
  faq.push({
    q: "How was this list picked?",
    a: `${list.criteria} ${SHARED_RULES}${checked ? ` The most recent verification among these programs was on ${checked}.` : ""}`,
  })

  return {
    list,
    rows,
    total: qualifying.length,
    verifiedTotal: verified.length,
    topVerified,
    medianVerifiedPct,
    checked,
    intro,
    faq,
  }
}
