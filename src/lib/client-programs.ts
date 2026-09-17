import registryData from "./client-registry.json"

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
  cookieDays: number
  shortDescription: string
  verified: boolean
  network?: string | null
  createdAt: string
  source?: string
  descriptionAvailable: boolean
  agentPromptAvailable: boolean
  signupAvailable: boolean
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
}

export const programs = registryData.programs as ClientProgram[]
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
      return commission.value !== null
        ? `${commission.value}%`
        : "Not published"
    case "flat":
      return commission.value !== null
        ? `$${commission.value.toLocaleString()}`
        : "Not published"
    case "tiered":
    case "hybrid":
      return String(commission.rate)
    default:
      return "Not published"
  }
}

export function parseCommissionRate(
  rate: string | number | ClientProgram["commission"]
): number {
  if (rate && typeof rate === "object") return rate.value ?? 0
  if (typeof rate === "number") return rate

  const value = String(rate).replace(/,/g, "")
  const range = value.match(/(\d+)\s*[-–]\s*(\d+)\s*%/)
  if (range) return Number.parseFloat(range[2])
  const percentage = value.match(/([\d.]+)\s*%/)
  if (percentage) return Number.parseFloat(percentage[1])
  const dollars = value.match(/\$\s*([\d.]+)/)
  if (dollars) return Number.parseFloat(dollars[1])
  const number = value.match(/[\d.]+/)
  return number ? Number.parseFloat(number[0]) : 0
}

function isCommissionFlat(rate: string | number): boolean {
  if (typeof rate === "number") return false
  const value = rate.replace(/,/g, "")
  return !value.includes("%") && value.includes("$")
}

function formatCommissionDisplay(value: number, flat: boolean): string {
  if (!Number.isFinite(value) || value <= 0) return "—"
  if (flat) {
    return value >= 1000
      ? `$${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`
      : `$${value.toLocaleString()}`
  }
  return `${value % 1 === 0 ? value : value.toFixed(1)}%`
}

export function affiliateScore(program: ClientProgram): number {
  const raw = parseCommissionRate(program.commission)
  const varies =
    typeof program.commission.rate === "string" &&
    /varies/i.test(program.commission.rate)

  const commissionScore = varies
    ? 15
    : isCommissionFlat(program.commission.rate)
      ? raw >= 500
        ? 40
        : raw >= 100
          ? 28
          : raw >= 50
            ? 16
            : 8
      : Math.min(raw / 50, 1) * 40

  const cookieScore = Math.min(program.cookieDays / 90, 1) * 15
  let typeScore = 5
  if (program.commission.type === "recurring") {
    const duration = program.commission.duration?.toLowerCase().trim() ?? ""
    typeScore =
      duration === "lifetime"
        ? 25
        : duration.includes("24")
          ? 23
          : duration.includes("12")
            ? 21
            : 18
  } else if (program.commission.type === "tiered") {
    typeScore = 12
  }

  const completeness =
    (program.descriptionAvailable ? 4 : 0) +
    (program.agentPromptAvailable ? 3 : 0) +
    (program.signupAvailable ? 3 : 0)

  return Math.round(
    commissionScore +
      cookieScore +
      typeScore +
      (program.verified ? 10 : 0) +
      completeness
  )
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
      return results.sort((a, b) => a.name.localeCompare(b.name))
    case "za":
      return results.sort((a, b) => b.name.localeCompare(a.name))
    case "commission_desc":
      return results.sort(
        (a, b) =>
          parseCommissionRate(b.commission) -
          parseCommissionRate(a.commission)
      )
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
          b.createdAt.localeCompare(a.createdAt) ||
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

function rankScore(rate: string | number): number {
  const value = parseCommissionRate(rate)
  if (!Number.isFinite(value) || value <= 0) return 0
  if (isCommissionFlat(rate)) {
    return value < 50 ? value : Math.min(100, 50 + (value - 50) * 0.1)
  }
  return Math.min(value, 100)
}

interface AggregateStats {
  programCount: number
  avgCommission: number
  topProgram: ClientProgram
}

function aggregatePrograms(items: ClientProgram[]): AggregateStats {
  const scores = items.map((program) => rankScore(program.commission.rate))
  const topProgram = items[scores.indexOf(Math.max(...scores))]
  const percentageRates = items
    .filter((program) => !isCommissionFlat(program.commission.rate))
    .map((program) => parseCommissionRate(program.commission))

  return {
    programCount: items.length,
    avgCommission: percentageRates.length
      ? percentageRates.reduce((sum, value) => sum + value, 0) /
        percentageRates.length
      : 0,
    topProgram,
  }
}

export function getNetworkStats() {
  return networks
    .map((network) => {
      const items = programs.filter(
        (program) => (program.network ?? IN_HOUSE) === network
      )
      const stats = aggregatePrograms(items)
      const percentageRates = items
        .filter((program) => !isCommissionFlat(program.commission.rate))
        .map((program) => parseCommissionRate(program.commission))
      return {
        network,
        ...stats,
        bestCommission: percentageRates.length
          ? Math.max(...percentageRates)
          : 0,
        bestCommissionDisplay: formatCommissionDisplay(
          parseCommissionRate(stats.topProgram.commission),
          isCommissionFlat(stats.topProgram.commission.rate)
        ),
      }
    })
    .sort((a, b) => b.programCount - a.programCount)
}

export function getCategoryStats() {
  return categories
    .map((category) => {
      const items = programs.filter(
        (program) => program.category === category
      )
      const stats = aggregatePrograms(items)
      const percentageRates = items
        .filter((program) => !isCommissionFlat(program.commission.rate))
        .map((program) => parseCommissionRate(program.commission))
      return {
        category,
        ...stats,
        highestCommission: percentageRates.length
          ? Math.max(...percentageRates)
          : 0,
        highestCommissionDisplay: formatCommissionDisplay(
          parseCommissionRate(stats.topProgram.commission),
          isCommissionFlat(stats.topProgram.commission.rate)
        ),
      }
    })
    .sort((a, b) => b.programCount - a.programCount)
}
