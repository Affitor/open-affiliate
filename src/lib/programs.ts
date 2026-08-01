import registryData from "./registry.json"

/**
 * Fallback network for programs whose YAML omits `network`.
 *
 * Must stay lowercase: the schema documents network values as
 * "lowercase, hyphenated" and its enum carries "in-house", so 291 programs
 * already store that literal string. Using "In-house" here instead produced
 * two distinct buckets — "in-house" (291) and "In-house" (4) — that both
 * slugify to /networks/in-house, so the networks index rendered the same
 * network as two separate cards pointing at one page.
 */
export const IN_HOUSE = "in-house"

export interface Program {
  slug: string
  name: string
  url: string
  logo: string
  category: string
  commission: {
    type: "recurring" | "one-time" | "tiered"
    /** Exactly what the source said. Kept verbatim; read mode and value. */
    rate: string | number
    /**
     * How to read `value`. `unknown` means no figure was ever published —
     * 198 of 760 programs. Rendering the raw string in those cases put the
     * word "varies" into a number column, and worse: two pages appended a
     * literal "%" to it, so a flat $36 program shipped as "$36%".
     */
    mode: "percentage" | "flat" | "tiered" | "hybrid" | "unknown"
    /** Percent, or currency amount when flat. Null when mode is unknown. */
    value: number | null
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
  source?: string
  lastVerifiedAt?: string | null
  aliases?: string[]
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
      // Defaults cover a program authored before the migration or by hand.
      // Falling back to unknown is right: a missing mode means nobody has
      // said how to read the figure, which is exactly what unknown means.
      mode: yaml.commission.mode ?? "unknown",
      value: yaml.commission.value ?? null,
      currency: yaml.commission.currency,
      duration: yaml.commission.duration ?? null,
      conditions: yaml.commission.conditions ?? null,
    },
    cookieDays: yaml.cookie_days,
    payout: {
      minimum: yaml.payout?.minimum,
      currency: yaml.payout?.currency,
      frequency: yaml.payout?.frequency,
      methods: yaml.payout?.methods ?? [],
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
    payoutMethods: yaml.payout?.methods ?? [],
    marketingMaterials: yaml.marketing_materials ?? false,
    apiAvailable: yaml.api_available ?? false,
    dedicatedManager: yaml.dedicated_manager ?? false,
    dashboardUrl: yaml.dashboard_url ?? null,
    network: yaml.network ?? null,
    programAge: yaml.program_age ?? null,
    agentKeywords: yaml.agents?.keywords ?? [],
    agentUseCases: yaml.agents?.use_cases ?? [],
    source: yaml.source,
    lastVerifiedAt: yaml.last_verified_at ?? null,
    aliases: yaml.aliases ?? [],
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
export function parseCommissionRate(
  rate: string | number | Program["commission"]
): number {
  // Prefer the typed value. The regexes below are what the registry used
  // before commission was typed, and they had to guess: "175" could be
  // percent or dollars, "varies" parsed to 0 and sorted like a real zero.
  // They stay for any caller still passing a raw string.
  if (rate && typeof rate === "object") {
    return rate.value ?? 0
  }
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
/**
 * How a commission should be written for a reader.
 *
 * Every call site used to interpolate `commission.rate` directly, which is how
 * "varies" ended up in commission columns and how two pages shipped "$36%" by
 * appending a percent sign to a flat amount. One helper, one set of rules.
 */
export function commissionDisplay(c: Program["commission"]): string {
  switch (c.mode) {
    case "percentage":
      return c.value !== null ? `${c.value}%` : "Not published"
    case "flat":
      return c.value !== null ? `$${c.value.toLocaleString()}` : "Not published"
    case "tiered":
    case "hybrid":
      // A band or a two-part deal — the raw string carries nuance a single
      // number would throw away ("$5 per lead + 30%").
      return String(c.rate)
    case "unknown":
    default:
      return "Not published"
  }
}

/** True when there is no figure to compare on. */
export function commissionUnknown(c: Program["commission"]): boolean {
  return c.mode === "unknown" || c.value === null
}

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
 * Format a parsed commission value for display. A raw parsed number can
 * be either a percentage or a flat dollar fee — the `flat` flag tells
 * the renderer which suffix to use. Used by rankings and category stats
 * where we show aggregated best/avg values pulled from mixed rate types.
 */
export function formatCommissionDisplay(value: number, flat: boolean): string {
  if (!isFinite(value) || value <= 0) return "—"
  if (flat) {
    return value >= 1000
      ? `$${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`
      : `$${value.toLocaleString()}`
  }
  return `${value % 1 === 0 ? value : value.toFixed(1)}%`
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
  const raw = parseCommissionRate(p.commission)
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
    results = results.filter((p) => (p.network ?? IN_HOUSE) === opts.network)
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
      results.sort((a, b) => parseCommissionRate(b.commission) - parseCommissionRate(a.commission))
      break
    case "newest":
      // Many existing programs share a backfill date of 2026-04-18. To give
      // users a meaningful "what arrived most recently" view, tiebreak by:
      //   (1) source priority — recently-added batches use community /
      //       yc-directory; the original bulk import used partnerstack-api
      //       or legacy. Newer source > older source.
      //   (2) affiliate score — higher-quality programs surface first.
      {
        const sourceWeight = (s: string | undefined): number => {
          // Higher = shown first when created_at ties.
          const map: Record<string, number> = {
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
          return map[s ?? ""] ?? 2
        }
        results.sort((a, b) => {
          const byDate = (b.createdAt || "").localeCompare(a.createdAt || "")
          if (byDate !== 0) return byDate
          const bySource = sourceWeight(b.source) - sourceWeight(a.source)
          if (bySource !== 0) return bySource
          return affiliateScore(b) - affiliateScore(a)
        })
      }
      break
    case "relevance":
    default:
      if (opts.query) {
        const q = opts.query.toLowerCase()
        results.sort((a, b) => {
          const aName = a.name.toLowerCase().includes(q) ? 1 : 0
          const bName = b.name.toLowerCase().includes(q) ? 1 : 0
          return bName - aName || affiliateScore(b) - affiliateScore(a)
        })
      } else {
        results.sort((a, b) => affiliateScore(b) - affiliateScore(a))
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

export const networks = [...new Set(programs.map((p) => p.network ?? IN_HOUSE))].sort() as string[]

export const networkCounts: Record<string, number> = programs.reduce(
  (acc, p) => {
    const net = p.network ?? IN_HOUSE
    acc[net] = (acc[net] || 0) + 1
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
  const networks = [...new Set(programs.map((p) => p.network ?? IN_HOUSE))]
  return networks.find((n) => networkToSlug(n) === slug)
}

export interface NetworkStats {
  network: string
  programCount: number
  avgCommission: number        // legacy — mean of percentage rates only
  bestCommission: number       // legacy — max of percentage rates only
  bestCommissionDisplay: string // formatted, covers both flat and percentage
  topProgram: Program           // the program with the strongest commission
}

/**
 * Rank programs within a network or category using a normalized score that
 * can compare a percentage rate against a flat-fee rate. Heuristic: treat
 * $1 ≈ 1pp up to a cap of 100 (so $500 flat ≈ a cap, preventing giant
 * referral bounties like $10,000 from dominating the "best" slot).
 */
function rankScore(rate: string | number): number {
  const n = parseCommissionRate(rate)
  if (!isFinite(n) || n <= 0) return 0
  if (isCommissionFlat(rate)) {
    // $1-$49 → 5-49, $50-$500 → 50-100, $500+ → 100 cap
    if (n < 50) return n
    return Math.min(100, 50 + (n - 50) * 0.1)
  }
  // Percentage: direct, capped at 100
  return Math.min(n, 100)
}

export function getNetworkStats(): NetworkStats[] {
  const networkMap = new Map<string, Program[]>()
  for (const p of programs) {
    const net = p.network ?? IN_HOUSE
    if (!networkMap.has(net)) networkMap.set(net, [])
    networkMap.get(net)!.push(p)
  }

  return Array.from(networkMap.entries())
    .map(([network, progs]) => {
      const scores = progs.map((p) => rankScore(p.commission.rate))
      const bestIdx = scores.indexOf(Math.max(...scores))
      const topProgram = progs[bestIdx]
      // Avg and bestCommission legacy: only consider percentage rates, so the
      // displayed "X%" makes semantic sense. Flat-fee-only networks will show
      // a conservative 0 for avg and use bestCommissionDisplay for UI.
      const pctRates = progs
        .filter((p) => !isCommissionFlat(p.commission.rate))
        .map((p) => parseCommissionRate(p.commission))
      return {
        network,
        programCount: progs.length,
        avgCommission: pctRates.length
          ? pctRates.reduce((a, b) => a + b, 0) / pctRates.length
          : 0,
        bestCommission: pctRates.length ? Math.max(...pctRates) : 0,
        bestCommissionDisplay: formatCommissionDisplay(
          parseCommissionRate(topProgram.commission),
          isCommissionFlat(topProgram.commission.rate)
        ),
        topProgram,
      }
    })
    .sort((a, b) => b.programCount - a.programCount)
}

export interface CategoryStats {
  category: string
  programCount: number
  highestCommission: number        // legacy — max of percentage rates only
  avgCommission: number             // legacy — mean of percentage rates only
  highestCommissionDisplay: string  // formatted, covers both flat and percentage
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
      const scores = progs.map((p) => rankScore(p.commission.rate))
      const bestIdx = scores.indexOf(Math.max(...scores))
      const topProgram = progs[bestIdx]
      const pctRates = progs
        .filter((p) => !isCommissionFlat(p.commission.rate))
        .map((p) => parseCommissionRate(p.commission))
      return {
        category,
        programCount: progs.length,
        highestCommission: pctRates.length ? Math.max(...pctRates) : 0,
        avgCommission: pctRates.length
          ? pctRates.reduce((a, b) => a + b, 0) / pctRates.length
          : 0,
        highestCommissionDisplay: formatCommissionDisplay(
          parseCommissionRate(topProgram.commission),
          isCommissionFlat(topProgram.commission.rate)
        ),
        topProgram,
      }
    })
    .sort((a, b) => b.programCount - a.programCount)
}
