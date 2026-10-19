import { formatPercentage } from "./commission-mode"
import registryData from "./client-registry.json"
import { compareCommission, compareText } from "./commission-order"
import { LONG_COOKIE_DAYS, paysBy, type PayoutMethodFilter } from "./payout-filters"

export const IN_HOUSE = "in-house"

export interface ClientProgram {
  slug: string
  name: string
  category: string
  tags: string[]
  commission: {
    type: "recurring" | "one-time" | "tiered" | "hybrid"
    rate: string | number
    mode: "percentage" | "flat" | "tiered" | "hybrid" | "unknown"
    value: number | null
    currency: string
    duration?: string | null
  }
  /** Left out for an unverified program (confirmed-terms.ts). */
  cookieDays?: number
  /** Left out for an unverified program, and when the terms name none. */
  payoutMethods?: string[]
  /** Left out for an unverified program. */
  payoutMinimum?: number
  shortDescription: string
  verified: boolean
  network?: string | null
  createdAt: string
  source?: string
  /** Affiliate Score, computed at build time from the stored program. */
  score: number
  /**
   * Commission order key, computed at build time by commissionRank: it reads
   * `kind`, which this registry leaves out. 0 for unpublished, tiered, hybrid,
   * referral and non-USD flat commissions.
   */
  commissionRank: number
  status?: "paused" | "discontinued" | "no_program"
}

export type Program = ClientProgram
export type SortOption =
  | "relevance"
  | "az"
  | "za"
  | "commission_desc"
  | "newest"

interface SearchOptions {
  query?: string
  category?: string
  commissionType?: string
  network?: string
  sort?: SortOption
  verified?: boolean
  payout?: PayoutMethodFilter
  /** Only programs whose terms set no payout minimum. */
  noMinimum?: boolean
  /** Only programs with a cookie of LONG_COOKIE_DAYS or more. */
  longCookie?: boolean
}

// Paused, discontinued and no_program entries are not listed or ranked; their own page still renders.
// build-registry writes `status` only when it is not active. Through `unknown`:
// the committed client-registry.json can predate a field (`score`), and
// prebuild and predev regenerate it before anything reads it.
export const allPrograms = registryData.programs as unknown as ClientProgram[]
export const programs = allPrograms.filter((p) => !p.status)
export const categories = registryData.categories as string[]

export function getProgram(slug: string): ClientProgram | undefined {
  return programs.find((program) => program.slug === slug)
}

export function commissionLabel(
  commission: ClientProgram["commission"],
  short = false
): string {
  const type =
    commission.type === "recurring"
      ? short
        ? "rec"
        : "recurring"
      : commission.type
  if (commission.type !== "recurring" || !commission.duration) return type

  const duration = commission.duration.toLowerCase().trim()
  if (duration === "lifetime") return `${type}/lifetime`
  const months = duration.match(/^(\d+)\s*months?$/)
  return months ? `${type}/${months[1]}mo` : `${type}/${duration}`
}

export function commissionDisplay(
  commission: ClientProgram["commission"]
): string {
  switch (commission.mode) {
    case "percentage":
      return formatPercentage(commission.rate, commission.value)
    case "flat":
      return commission.value !== null
        ? `$${commission.value.toLocaleString()}${/credit/i.test(String(commission.rate)) ? " in credits" : ""}`
        : "Not published"
    case "tiered":
    case "hybrid":
      return String(commission.rate)
    default:
      return "Not published"
  }
}

/**
 * Precomputed by build-registry with the site's own affiliateScore, which
 * reads the description, agent prompt and signup URL that this registry
 * leaves out, so the score cannot be recomputed here.
 */
export function affiliateScore(program: ClientProgram): number {
  return program.score
}

/**
 * Commission order for the browser's sorts (/programs "Highest Commission",
 * the /rankings commission column): the order every commission surface shares
 * (commission-order.ts), on the commissionRank build-registry ships. `dir` -1
 * puts the largest first; programs it cannot rank stay last either way.
 */
export { compareText }

export function compareByCommission(a: ClientProgram, b: ClientProgram, dir = -1): number {
  return compareCommission(a, b, (p) => p.commissionRank, dir)
}

export function searchPrograms(query: string, category?: string): ClientProgram[]
export function searchPrograms(options: SearchOptions): ClientProgram[]
export function searchPrograms(
  queryOrOptions: string | SearchOptions,
  category?: string
): ClientProgram[] {
  const options =
    typeof queryOrOptions === "string"
      ? { query: queryOrOptions, category }
      : queryOrOptions
  let results = [...programs]

  if (options.category) {
    results = results.filter(
      (program) => program.category === options.category
    )
  }
  if (options.commissionType) {
    results = results.filter(
      (program) => program.commission.type === options.commissionType
    )
  }
  if (options.network) {
    results = results.filter(
      (program) => (program.network ?? IN_HOUSE) === options.network
    )
  }
  if (options.verified) {
    results = results.filter((program) => program.verified)
  }
  // Payout and cookie fields ship for confirmed terms only, so these keep unverified programs out.
  if (options.payout) {
    const filter = options.payout
    results = results.filter((program) => paysBy(program.payoutMethods, filter))
  }
  if (options.noMinimum) {
    results = results.filter((program) => program.payoutMinimum === 0)
  }
  if (options.longCookie) {
    results = results.filter((program) => (program.cookieDays ?? 0) >= LONG_COOKIE_DAYS)
  }
  if (options.query) {
    const query = options.query.toLowerCase()
    results = results.filter(
      (program) =>
        program.name.toLowerCase().includes(query) ||
        program.shortDescription.toLowerCase().includes(query) ||
        program.tags.some((tag) => tag.includes(query)) ||
        program.category.toLowerCase().includes(query)
    )
  }

  switch (options.sort ?? "relevance") {
    case "az":
      return results.sort((a, b) => compareText(a.name, b.name))
    case "za":
      return results.sort((a, b) => compareText(b.name, a.name))
    case "commission_desc":
      return results.sort((a, b) => compareByCommission(a, b))
    case "newest": {
      const sourceWeight: Record<string, number> = {
        community: 9,
        manual: 9,
        "yc-directory": 8,
        firstpromoter: 7,
        rewardful: 7,
        tolt: 7,
        dub: 7,
        impact: 6,
        awin: 6,
        "partnerstack-api": 5,
        "product-hunt": 4,
        "hacker-news": 4,
        theresanaiforthat: 3,
        futuretools: 3,
        legacy: 1,
      }
      return results.sort(
        (a, b) =>
          compareText(b.createdAt, a.createdAt) ||
          (sourceWeight[b.source ?? ""] ?? 2) -
            (sourceWeight[a.source ?? ""] ?? 2) ||
          affiliateScore(b) - affiliateScore(a)
      )
    }
    default:
      if (!options.query) {
        return results.sort((a, b) => affiliateScore(b) - affiliateScore(a))
      }
      {
        const query = options.query.toLowerCase()
        return results.sort(
          (a, b) =>
            Number(b.name.toLowerCase().includes(query)) -
              Number(a.name.toLowerCase().includes(query)) ||
            affiliateScore(b) - affiliateScore(a)
        )
      }
  }
}

export const commissionTypes = [
  ...new Set(programs.map((program) => program.commission.type)),
]
export const categoryCounts = Object.fromEntries(
  categories.map((category) => [
    category,
    programs.filter((program) => program.category === category).length,
  ])
)
export const networks = [
  ...new Set(programs.map((program) => program.network ?? IN_HOUSE)),
].sort()
export const networkCounts = Object.fromEntries(
  networks.map((network) => [
    network,
    programs.filter(
      (program) => (program.network ?? IN_HOUSE) === network
    ).length,
  ])
)
