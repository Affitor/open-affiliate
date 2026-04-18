import registryData from "./registry.json"

export interface Program {
  slug: string
  name: string
  url: string
  logo: string
  category: string
  commission: {
    type: "recurring" | "one-time" | "tiered"
    rate: string | number
    currency: string
    duration?: string | null
    conditions?: string | null
  }
  cookieDays: number
  payout: {
    minimum: number
    currency?: string
    frequency: string
    methods?: string[]
  }
  description: string
  shortDescription: string
  tags: string[]
  stars: number
  verified: boolean
  agentPrompt: string
  submittedBy: string
  createdAt: string
  // Extended fields from YAML
  signupUrl?: string
  approval?: string
  approvalTime?: string
  restrictions?: string[]
  commissionDuration?: string | null
  commissionConditions?: string | null
  attribution?: string
  trackingMethod?: string
  payoutMethods?: string[]
  marketingMaterials?: boolean
  apiAvailable?: boolean
  dedicatedManager?: boolean
  dashboardUrl?: string | null
  network?: string | null
  programAge?: string | null
  agentKeywords?: string[]
  agentUseCases?: string[]
}

// Map snake_case YAML fields to camelCase Program interface
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapYamlToProgram(yaml: any): Program {
  return {
    slug: yaml.slug,
    name: yaml.name,
    url: yaml.url,
    logo: yaml.name.charAt(0).toUpperCase(),
    category: yaml.category,
    commission: {
      type: yaml.commission.type as "recurring" | "one-time" | "tiered",
      rate: yaml.commission.rate,
      currency: yaml.commission.currency,
      duration: yaml.commission.duration ?? null,
      conditions: yaml.commission.conditions ?? null,
    },
    cookieDays: yaml.cookie_days,
    payout: {
      minimum: yaml.payout.minimum,
      currency: yaml.payout.currency,
      frequency: yaml.payout.frequency,
      methods: yaml.payout.methods ?? [],
    },
    description: yaml.description?.trim() ?? "",
    shortDescription: yaml.short_description ?? "",
    tags: yaml.tags ?? [],
    stars: 0,
    verified: yaml.verified ?? false,
    agentPrompt: yaml.agents?.prompt?.trim() ?? "",
    submittedBy: yaml.submitted_by ?? "community",
    createdAt: yaml.created_at ?? "",
    // Extended fields
    signupUrl: yaml.signup_url,
    approval: yaml.approval,
    approvalTime: yaml.approval_time,
    restrictions: yaml.restrictions ?? [],
    commissionDuration: yaml.commission.duration ?? null,
    commissionConditions: yaml.commission.conditions ?? null,
    attribution: yaml.attribution,
    trackingMethod: yaml.tracking_method,
    payoutMethods: yaml.payout.methods ?? [],
    marketingMaterials: yaml.marketing_materials ?? false,
    apiAvailable: yaml.api_available ?? false,
    dedicatedManager: yaml.dedicated_manager ?? false,
    dashboardUrl: yaml.dashboard_url ?? null,
    network: yaml.network ?? null,
    programAge: yaml.program_age ?? null,
    agentKeywords: yaml.agents?.keywords ?? [],
    agentUseCases: yaml.agents?.use_cases ?? [],
  }
}

export const programs: Program[] = (registryData.programs as unknown[]).map(mapYamlToProgram)

export const categories = registryData.categories as string[]

export function getProgram(slug: string): Program | undefined {
  return programs.find((p) => p.slug === slug)
}

/** Short label for commission type, e.g. "recurring/12mo", "rec/lifetime", "one-time" */
export function commissionLabel(c: Program["commission"], short = false): string {
  const type = c.type === "recurring" ? (short ? "rec" : "recurring") : c.type;
  if (c.type !== "recurring" || !c.duration) return type;
  const d = String(c.duration).toLowerCase().trim();
  if (d === "lifetime") return `${type}/lifetime`;
  const m = d.match(/^(\d+)\s*months?$/);
  if (m) return `${type}/${m[1]}mo`;
  return `${type}/${d}`;
}

export type SortOption = "relevance" | "az" | "za" | "commission_desc" | "newest"

export interface SearchOptions {
  query?: string
  category?: string
  commissionType?: string
  network?: string
  sort?: SortOption
  verified?: boolean
}

/**
 * Parse commission rate string into a numeric percentage-equivalent.
 * - "30%" → 30
 * - "$1,000" → 1000 (flat fee, kept as-is — score handles conversion)
 * - "20-30%" → 30 (takes higher)
 * - "$5 per lead + 30%" → 30 (prefers percentage)
 * - "varies" → 0
 */
export function parseCommissionRate(rate: string | number): number {
  if (typeof rate === "number") return rate
  const s = String(rate).replace(/,/g, "")
  // Handle ranges like "20-30%" — take the higher value
  const rangeMatch = s.match(/(\d+)\s*[-–]\s*(\d+)\s*%/)
  if (rangeMatch) return parseFloat(rangeMatch[2])
  // Compound rates: prefer percentage component ("$5 per lead + 30%")
  const pctMatch = s.match(/([\d.]+)\s*%/)
  if (pctMatch) return parseFloat(pctMatch[0])
  // Flat fee: "$100", "$1000"
  const dollarMatch = s.match(/\$\s*([\d.]+)/)
  if (dollarMatch) return parseFloat(dollarMatch[1])
  // Bare number
  const numMatch = s.match(/[\d.]+/)
  return numMatch ? parseFloat(numMatch[0]) : 0
}

/** Check if commission rate is a flat fee (dollar amount) vs percentage */
export function isCommissionFlat(rate: string | number): boolean {
  if (typeof rate === "number") return false
  const s = String(rate).replace(/,/g, "")
  // If it has a percentage sign, it's not flat
  if (s.includes("%")) return false
  // If it has a dollar sign, it's flat
  if (s.includes("$")) return true
  return false
}

/**
 * Affiliate Score (0–100)
 *
 * | Component          | Max | Formula                                               |
 * |--------------------|-----|-------------------------------------------------------|
 * | Commission value   |  40 | Percentage: min(rate/50,1)×40                         |
 * |                    |     | Flat fee: $1-49→8, $50-99→16, $100-499→28, $500+→40  |
 * |                    |     | "varies": 15                                          |
 * | Cookie duration    |  15 | min(days/90,1) × 15                                  |
 * | Type + Duration    |  25 | one-time:5, tiered:12, hybrid:15                      |
 * |                    |     | recurring:18, rec/12mo:21, rec/24mo:23, rec/lifetime:25|
 * | Verified           |  10 | 10 if verified                                        |
 * | Completeness       |  10 | +4 description, +3 agent prompt, +3 signup URL        |
 * | **Total**          | 100 |                                                       |
 */
export function affiliateScore(p: Program): number {
  const raw = parseCommissionRate(p.commission.rate)
  const isVaries = typeof p.commission.rate === "string" && /varies/i.test(p.commission.rate)

  // Commission value (max 40)
  let commScore: number
  if (isVaries) {
    commScore = 15
  } else if (isCommissionFlat(p.commission.rate)) {
    commScore = raw >= 500 ? 40 : raw >= 100 ? 28 : raw >= 50 ? 16 : 8
  } else {
    commScore = Math.min(raw / 50, 1) * 40
  }

  // Cookie duration (max 15)
  const cookieScore = Math.min(p.cookieDays / 90, 1) * 15

  // Type + Duration (max 25)
  let typeScore: number
  if (p.commission.type === "recurring") {
    const dur = p.commission.duration?.toLowerCase().trim() ?? ""
    if (dur === "lifetime") typeScore = 25
    else if (dur.includes("24")) typeScore = 23
    else if (dur.includes("12")) typeScore = 21
    else typeScore = 18
  } else if (p.commission.type === "tiered") {
    typeScore = 12
  } else {
    typeScore = 5
  }

  // Verified (max 10)
  const verifiedScore = p.verified ? 10 : 0

  // Completeness (max 10)
  let completeness = 0
  if (p.description && p.description.length > 20) completeness += 4
  if (p.agentPrompt && p.agentPrompt.length > 10) completeness += 3
  if (p.signupUrl) completeness += 3

  return Math.round(commScore + cookieScore + typeScore + verifiedScore + completeness)
}

export function searchPrograms(query: string, category?: string): Program[]
export function searchPrograms(options: SearchOptions): Program[]
export function searchPrograms(queryOrOptions: string | SearchOptions, category?: string): Program[] {
  const opts: SearchOptions = typeof queryOrOptions === "string"
    ? { query: queryOrOptions, category }
    : queryOrOptions

  let results = programs

  if (opts.category) {
    results = results.filter((p) => p.category === opts.category)
  }

  if (opts.commissionType) {
    results = results.filter((p) => p.commission.type === opts.commissionType)
  }

  if (opts.network) {
    results = results.filter((p) => (p.network ?? "In-house") === opts.network)
  }

  if (opts.verified) {
    results = results.filter((p) => p.verified)
  }

  if (opts.query) {
    const q = opts.query.toLowerCase()
    results = results.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.shortDescription.toLowerCase().includes(q) ||
        p.tags.some((t) => t.includes(q)) ||
        p.category.toLowerCase().includes(q)
    )
  }

  const sort = opts.sort ?? "relevance"
  switch (sort) {
    case "az":
      results.sort((a, b) => a.name.localeCompare(b.name))
      break
    case "za":
      results.sort((a, b) => b.name.localeCompare(a.name))
      break
    case "commission_desc":
      results.sort((a, b) => parseCommissionRate(b.commission.rate) - parseCommissionRate(a.commission.rate))
      break
    case "newest":
      results.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      break
    case "relevance":
    default:
      if (opts.query) {
        const q = opts.query.toLowerCase()
        results.sort((a, b) => {
          const aName = a.name.toLowerCase().includes(q) ? 1 : 0
          const bName = b.name.toLowerCase().includes(q) ? 1 : 0
          return bName - aName || b.stars - a.stars
        })
      } else {
        results.sort((a, b) => b.stars - a.stars)
      }
      break
  }

  return results
}

export const commissionTypes = [...new Set(programs.map((p) => p.commission.type))] as string[]

export const categoryCounts: Record<string, number> = programs.reduce(
  (acc, p) => {
    acc[p.category] = (acc[p.category] || 0) + 1
    return acc
  },
  {} as Record<string, number>
)

export function categoryToSlug(category: string): string {
  return category.toLowerCase().replace(/\s+/g, "-").replace(/[&]/g, "and").replace(/[^a-z0-9-]/g, "")
}

export function slugToCategory(slug: string): string | undefined {
  return categories.find((c) => categoryToSlug(c) === slug)
}

export function networkToSlug(network: string): string {
  return network.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
}

export function slugToNetwork(slug: string): string | undefined {
  const networks = [...new Set(programs.map((p) => p.network ?? "In-house"))]
  return networks.find((n) => networkToSlug(n) === slug)
}

export interface NetworkStats {
  network: string
  programCount: number
  avgCommission: number
  bestCommission: number
  topProgram: Program
}

export function getNetworkStats(): NetworkStats[] {
  const networkMap = new Map<string, Program[]>()
  for (const p of programs) {
    const net = p.network ?? "In-house"
    if (!networkMap.has(net)) networkMap.set(net, [])
    networkMap.get(net)!.push(p)
  }

  return Array.from(networkMap.entries())
    .map(([network, progs]) => {
      const rates = progs.map((p) => parseCommissionRate(p.commission.rate))
      const bestIdx = rates.indexOf(Math.max(...rates))
      return {
        network,
        programCount: progs.length,
        avgCommission: rates.reduce((a, b) => a + b, 0) / rates.length,
        bestCommission: Math.max(...rates),
        topProgram: progs[bestIdx],
      }
    })
    .sort((a, b) => b.programCount - a.programCount)
}

export interface CategoryStats {
  category: string
  programCount: number
  highestCommission: number
  avgCommission: number
  topProgram: Program
}

export function getCategoryStats(): CategoryStats[] {
  const catMap = new Map<string, Program[]>()
  for (const p of programs) {
    if (!catMap.has(p.category)) catMap.set(p.category, [])
    catMap.get(p.category)!.push(p)
  }

  return Array.from(catMap.entries())
    .map(([category, progs]) => {
      const rates = progs.map((p) => parseCommissionRate(p.commission.rate))
      const bestIdx = rates.indexOf(Math.max(...rates))
      return {
        category,
        programCount: progs.length,
        highestCommission: Math.max(...rates),
        avgCommission: rates.reduce((a, b) => a + b, 0) / rates.length,
        topProgram: progs[bestIdx],
      }
    })
    .sort((a, b) => b.programCount - a.programCount)
}
