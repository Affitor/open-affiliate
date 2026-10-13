import {
  affiliateScore,
  categoryToSlug,
  commissionDisplay,
  commissionUnknown,
  confirmedTerms,
  livePrograms,
  rankedCommission,
  rankScore,
  type Program,
} from "./programs"
import type { Faq } from "./program-seo"

/**
 * Ranked list pages. Adding a list is one entry in BEST_LISTS: the page, its
 * markdown twin and the sitemap all read from here. The first entry is the hub
 * at /best, whose twin is the best.md llms.txt points at; the rest live at
 * /best/<slug>. Category pages run on the same builder through categoryList().
 *
 * Rules every list shares, so no list can be hand-picked:
 *   - live programs only, and only those that publish a commission figure
 *     (every list ranks by it, and "Not published" cannot be ranked);
 *   - verified programs first, then by listScore (structured fields only:
 *     a single percentage or a flat US-dollar amount, compared through
 *     rankScore), or by the list's own `rank`;
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
  /** Order within the verified and unverified groups; listScore when absent. */
  rank?: (p: Program) => number
  /** How the list is ordered, in plain words; SHARED_RULES when absent. */
  rules?: string
  /** What the FAQ calls these programs; the H1 in lower case when absent. */
  noun?: string
  /**
   * A category page is a directory, not a ranking: every program in it, with
   * no row cap, and those that publish no rate listed last rather than left out.
   */
  directory?: boolean
}

export const MAX_ROWS = 50

/**
 * Follows "Verified <date>" on every list, page and twin alike. The date is
 * verifiedDate(rows) (BestListData.checked); a list with no verified row shows
 * no such line.
 */
export const VERIFIED_NOTE = "the most recent date a program on this list was checked against its own affiliate page."

/**
 * The date a list may call "Verified": the latest last_verified_at among the
 * rows shown that are verified. An unverified row can carry a date (a check
 * that found nothing to confirm), and counting it put a "Verified" line on a
 * list with no verified row, or a later date than any real verification.
 * Both the page and its markdown twin read it through BestListData.checked.
 */
export function verifiedDate(rows: Pick<Program, "verified" | "lastVerifiedAt">[]): string | null {
  return (
    rows
      .flatMap((p) => (p.verified && p.lastVerifiedAt ? [p.lastVerifiedAt.slice(0, 10)] : []))
      .sort()
      .at(-1) ?? null
  )
}

/** Shown with every list, because it describes the shared rules above. */
export const SHARED_RULES =
  "Verified programs come first, then the rest, each ranked by commission; tiered or mixed deals come after single rates, and programs that do not publish a rate are left out."

export const BEST_LISTS: BestList[] = [
  {
    // The hub answers "best affiliate programs" at /best; the slug is only its id.
    slug: "affiliate-programs",
    title: "Best Affiliate Programs With Verified Terms",
    h1: "Best Affiliate Programs",
    description:
      "The best affiliate programs with terms checked on each brand's own page, ranked by Affiliate Score: commission, cookie window and commission duration.",
    summary: "have terms verified against the program's own affiliate page",
    noun: "verified affiliate programs",
    criteria: "Programs whose terms we verified on their own affiliate page.",
    rules:
      "Ranked by Affiliate Score, which weighs commission, cookie window and how long commission lasts; programs that do not publish a rate are left out.",
    qualifies: (p) => p.verified,
    rank: (p) => {
      const score = affiliateScore(p)
      return Number.isFinite(score) ? score : -1
    },
  },
  {
    slug: "high-paying-affiliate-programs",
    title: "High-Paying Affiliate Programs, Ranked",
    h1: "High-Paying Affiliate Programs",
    description:
      "Affiliate programs that pay 30% or more, or a flat $30 or more, ranked by commission. Verified terms first, with the cookie and duration for each.",
    summary: "pay a single rate of 30% or more, or a flat $30 or more",
    criteria:
      "Programs that pay a single rate of 30% or more, or a flat $30 or more in US dollars. Programs with tiered or mixed commission are not ranked here; see each program's page.",
    // Tiered and mixed deals never qualify here, so the shared "they come after
    // single rates" clause does not apply.
    rules: "Verified programs come first, then the rest, each ranked by commission.",
    qualifies: (p) => listScore(p) >= 30,
  },
  {
    slug: "affiliate-programs-for-beginners",
    title: "Affiliate Programs for Beginners, Ranked",
    h1: "Affiliate Programs for Beginners",
    description:
      "Affiliate programs that approve new affiliates automatically, so you can start the day you sign up. Ranked by commission, with verified terms first.",
    summary: "approve new affiliates automatically and do not list a payout minimum above $100, going by verified terms",
    criteria:
      "Programs whose verified terms say they approve new affiliates automatically and list no payout minimum above $100. Approval and payout are not shown for unverified programs, so they are not counted.",
    // Approval and payout as shown: unverified programs carry none (confirmed-terms.ts).
    qualifies: (p) => {
      const t = confirmedTerms(p)
      return t.approval === "auto" && (t.payout.minimum == null || t.payout.minimum <= 100)
    },
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
  {
    // Structured fields only: the registry's "saas" tag, the recurring type,
    // and kind, so a credit or gift-card referral reward never counts.
    slug: "saas-recurring-affiliate-programs",
    title: "Recurring Commission SaaS Affiliate Programs",
    h1: "SaaS Affiliate Programs With Recurring Commissions",
    description:
      "SaaS affiliate programs that pay partners a recurring commission, with the commission, duration, cookie and signup link for each, verified terms first.",
    summary: "are SaaS products that pay partners a recurring commission",
    criteria:
      "Programs tagged SaaS in the registry whose commission is listed as recurring. Referral rewards paid in credit or gift cards are left out.",
    qualifies: (p) => p.tags.includes("saas") && p.commission.type === "recurring" && p.kind !== "referral",
  },
  {
    // No field records a sign-up fee or a purchase requirement. What is sourced
    // is automatic approval, on verified programs only; the criteria say so.
    slug: "free-affiliate-programs",
    title: "Free Affiliate Programs You Can Join Today",
    h1: "Free Affiliate Programs",
    description:
      "Free affiliate programs you can join today: verified programs that approve new affiliates automatically, ranked by commission, with cookie and duration.",
    summary: "approve new affiliates automatically, on terms we verified on their own page",
    criteria:
      "Programs whose terms we verified on their own affiliate page and that approve new affiliates automatically. We do not record sign-up fees, so automatic approval is what this list checks.",
    rules:
      "Ranked by commission; tiered or mixed deals come after single rates, and programs that do not publish a rate are left out.",
    qualifies: (p) => p.verified && p.approval === "auto",
  },
  {
    slug: "seo-affiliate-programs",
    title: "SEO Affiliate Programs, Ranked by Commission",
    h1: "SEO Affiliate Programs",
    description:
      "SEO affiliate programs for SEO tools and AI content writers, ranked by commission, with verified terms first and the cookie and duration for each.",
    summary: "are SEO tools, going by their registry tags and keywords",
    criteria: "Programs whose registry tags or keywords name SEO.",
    qualifies: (p) => [...p.tags, ...(p.agentKeywords ?? [])].some((t) => /\bseo\b/i.test(t)),
  },
]

/** The hub: "best affiliate programs" at /best, the parent of every other list. */
export const BEST_INDEX = BEST_LISTS[0]

export function bestPath(list: BestList): string {
  return list === BEST_INDEX ? "/best" : `/best/${list.slug}`
}

/** A list at /best/<slug>; the hub has no such URL. */
export function getBestList(slug: string): BestList | undefined {
  return BEST_LISTS.find((l) => l !== BEST_INDEX && l.slug === slug)
}

/**
 * A category page as a list. Its counts come from the same filter the builder
 * runs, because a directory keeps every live program in the category.
 */
export function categoryList(category: string): BestList {
  const inCategory = livePrograms.filter((p) => p.category === category)
  const n = inCategory.length
  const v = inCategory.filter((p) => p.verified).length
  const h1 = `${category} Affiliate Programs`
  // The longest that fits in 44 characters, 60 with the layout's suffix.
  const title =
    [v > 0 ? `${n} ${h1}, ${v} Verified` : "", `${n} ${h1}, Ranked`, `${n} ${h1}`].find((t) => t && t.length <= 44) ?? h1
  const noun = nounOf(h1)
  const description =
    [
      `Compare ${n} ${noun}, ${v} with terms checked on the brand's own page. Commission, cookie and duration for each, verified programs first.`,
      `Compare ${n} ${noun}, ${v} with terms checked on the brand's own page: commission, cookie and duration, verified first.`,
      `Compare ${n} ${noun}: commission, cookie window and duration for each, with programs verified on the brand's own page listed first.`,
    ].find((d) => d.length >= 120 && d.length <= 155) ?? `Compare ${n} ${noun}: commission, cookie and duration.`
  return {
    // The cache key; category pages live at /categories/<slug>.
    slug: `category/${categoryToSlug(category)}`,
    title,
    h1,
    description,
    summary: `are in the ${category} category`,
    criteria: `Programs listed in the ${category} category.`,
    rules:
      "Verified programs come first, then the rest, each ranked by commission; tiered or mixed deals come after single rates, and programs that do not publish a rate are listed last.",
    qualifies: (p) => p.category === category,
    directory: true,
  }
}

/** "AI Affiliate Programs" → "AI affiliate programs": lowercase Title-case words, keep acronyms. */
function nounOf(h1: string): string {
  return h1
    .split(" ")
    .map((word) => (word.split("-").every((part) => /^[A-Z][a-z]+$/.test(part)) ? word.toLowerCase() : word))
    .join(" ")
}

/**
 * The commission score lists filter and rank on, from structured fields only,
 * through the same rankedCommission the Affiliate Score uses: a single
 * percentage (mode "percentage") scores its value, and a flat amount in
 * explicit US dollars scores through rankScore's dollar mapping. Everything
 * else scores 0: tiered, hybrid and unknown modes, flat amounts in another or
 * no currency, and referral rewards (kind "referral": credit or gift cards).
 *
 * The rate text is never read. Earlier versions parsed it for the % and $
 * figures inside tiered and hybrid deals, and every review round found another
 * phrasing that turned into money ("-$150 adjustment", "$150 customer credits").
 * A 0 keeps such a deal out of a list filtered on commission (high-paying) and
 * places it after single rates in the others; its own page shows the terms.
 */
export function listScore(p: Pick<Program, "commission" | "kind">): number {
  const c = rankedCommission(p)
  return c ? rankScore(c) : 0
}

/**
 * A flat US-dollar payout per referral, read from structured fields only:
 * mode "flat", currency "USD" set explicitly, and a numeric value. Anything
 * else is 0. Free text is not parsed: an earlier version read the rate and
 * conditions, and each review round found another phrasing it misread (a demo
 * payout inside a deal total, a cap read as a payout, "USD 150", "$1.5k").
 *
 * This is the filter for a high-ticket list ("a flat $100 or more per
 * referral"). That list is not published yet: five verified programs store a
 * range, an "up to" amount or a two-part deal as mode "flat", and they have to
 * move to "tiered" or "hybrid" first. That is a data fix, not a parser rule.
 */
export function flatUsdPayout(c: Program["commission"]): number {
  return c.mode === "flat" && c.currency === "USD" && typeof c.value === "number" && Number.isFinite(c.value) ? c.value : 0
}

function isLifetime(p: Program): boolean {
  return p.commission.type === "recurring" && /lifetime/i.test(p.commission.duration ?? "")
}

/** "75-125% CPA + 25% annual, lifetime": the table's figure plus its duration. */
export function termsText(p: Program): string {
  const d = p.commission.duration
  return d ? `${listCommissionText(p)}, ${d}` : listCommissionText(p)
}

/**
 * The commission figure a list shows. A referral reward (kind "referral":
 * credit or a gift card) shows its rate exactly as published, because the
 * numeric display would print "$200" for "$100-$200 Amazon gift card per
 * referral". It still scores 0 in listScore.
 */
export function listCommissionText(p: Pick<Program, "commission" | "kind">): string {
  return p.kind === "referral" ? String(p.commission.rate) : commissionDisplay(p.commission)
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
  /** What the page shows: verified first, at most MAX_ROWS (all of them for a directory). */
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
  /** verifiedDate(rows): the latest last_verified_at among the verified rows, YYYY-MM-DD. */
  checked: string | null
}

/**
 * Fewest verified programs a statistic is quoted over. A "median" of one
 * program, or "the highest" of one, says nothing a reader can use; a small
 * category with one verified program gets the counts and nothing more.
 */
export const MIN_SAMPLE = 3

const built = new Map<string, BestListData>()

export function buildBestList(list: BestList): BestListData {
  const cached = built.get(list.slug)
  if (cached) return cached
  const rank = list.rank ?? listScore
  const qualifying = livePrograms
    .filter((p) => (list.directory || !commissionUnknown(p.commission)) && list.qualifies(p))
    .sort(
      (a, b) =>
        Number(b.verified) - Number(a.verified) ||
        // A directory keeps programs that publish no rate: they go last in
        // their group, not mixed in with tiered deals that also score 0.
        Number(commissionUnknown(a.commission)) - Number(commissionUnknown(b.commission)) ||
        rank(b) - rank(a) ||
        Number(isLifetime(b)) - Number(isLifetime(a)) ||
        a.name.localeCompare(b.name)
    )
  const rows = list.directory ? qualifying : qualifying.slice(0, MAX_ROWS)
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
    medianSinglePct: singlePct.length >= MIN_SAMPLE ? median(singlePct) : null,
    recurringTypeCount: recurringType.length,
    lifetimeCount: recurringType.filter(isLifetime).length,
    cookieDays: verified.flatMap((p) => (p.cookieDays != null ? [p.cookieDays] : [])),
    checked: verifiedDate(rows),
  }
  built.set(list.slug, data)
  return data
}

/**
 * The intro and FAQ, as sentences. Facts about specific programs come from
 * verified programs only: an answer reads as a statement of fact, and the rest
 * of the registry is community-submitted.
 *
 * `esc` is applied to every piece that can carry contributor text: names,
 * rate text, durations, `checked` (ten characters of a contributor's
 * last_verified_at are room enough for `[a](//x.y)`), and the list's own words,
 * because a category list's summary, noun and criteria carry the category
 * name, which no enum guards. The page passes nothing, since React escapes;
 * the markdown twin passes its inline escaper, so a name cannot become a link.
 */
export function bestListCopy(data: BestListData, esc: (text: string) => string = (t) => t): { intro: string; faq: Faq[] } {
  const { list, verified, total, rows } = data
  const pick = (p: Program) => `${esc(p.name)} (${esc(termsText(p))})`
  const top = verified[0]
  const noun = esc(list.noun ?? nounOf(list.h1))
  const summary = esc(list.summary)
  const v = verified.length
  const rules = esc(list.rules ?? SHARED_RULES)
  // "Pay the most" is by commission whatever order the list itself uses.
  const topPaying = [...verified].sort((a, b) => listScore(b) - listScore(a)).slice(0, 3)
  const list1 = (k: number, one: string, many: string) => (k === 1 ? one : many)

  const intro =
    (v === total
      ? `${total} live programs on OpenAffiliate ${summary}.`
      : `${total} live programs on OpenAffiliate ${summary}, and ` +
        (v === 0
          ? "none of them has terms verified against the program's own page yet."
          : `${v} of them ${list1(v, "has", "have")} terms verified against the program's own page.`)) +
    (top && v >= MIN_SAMPLE
      ? ` The top verified pick is ${pick(top)}` +
        (data.medianSinglePct != null
          ? `, and the median among verified programs with a single percentage rate is ${data.medianSinglePct}%.`
          : ".")
      : "")

  const faq: Faq[] = [
    {
      q: `How many ${noun} does OpenAffiliate list?`,
      a:
        `${total} live programs ${summary}.` +
        (v === total
          ? ""
          : v === 0
            ? " None has terms verified against the program's own page yet; all are community-submitted and not yet confirmed."
            : ` ${v} ${list1(v, "has", "have")} terms verified against the program's own page; the rest are community-submitted and not yet confirmed.`) +
        (total > rows.length ? ` This page shows the top ${rows.length}.` : ""),
    },
  ]
  if (v >= MIN_SAMPLE) {
    faq.push({
      q: `Which ${noun} pay the most?`,
      a: `Among verified programs, the highest by commission are ${andList(topPaying.map(pick))}.`,
    })
  }
  if (data.medianSinglePct != null) {
    const k = data.recurringTypeCount
    faq.push({
      q: `How much do ${noun} pay?`,
      a:
        `The median rate is ${data.medianSinglePct}% across the ${data.singlePctCount} verified programs with a single percentage rate. ` +
        (k === v
          ? `${data.lifetimeCount} of the ${v} verified programs ${list1(data.lifetimeCount, "lists", "list")} a lifetime duration.`
          : `${k} of the ${v} verified programs ${list1(k, "lists", "list")} recurring as their commission type, ${data.lifetimeCount} of those with a lifetime duration.`),
    })
  }
  if (data.cookieDays.length >= MIN_SAMPLE) {
    faq.push({
      q: `How long do cookies last on ${noun}?`,
      a: `Among the ${data.cookieDays.length} verified programs that publish a cookie window, the median is ${median(data.cookieDays)} days and the longest is ${Math.max(...data.cookieDays)} days.`,
    })
  }
  faq.push({
    q: "How was this list picked?",
    a: `${esc(list.criteria)} ${rules}${data.checked ? ` The most recent verification among these programs was on ${esc(data.checked)}.` : ""}`,
  })

  return { intro, faq }
}
