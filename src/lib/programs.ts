import registryData from "./registry.json"
import { networkKind, networkName } from "./network-meta"
import { confirmedPitch, confirmedPrompt, confirmedProse, confirmedProseList, termsConfirmed, UNCONFIRMED, UNCONFIRMED_NOTE } from "./confirmed-terms"

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
  cookieDays?: number
  payout: {
    minimum?: number
    currency?: string
    frequency?: string
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
  updatedAt?: string
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
  /**
   * "discontinued" (closed) and "no_program" (none found, no closure on record) keep the
   * page live so it can answer "does X have an affiliate program?" truthfully.
   */
  status?: "active" | "paused" | "discontinued" | "no_program"
  statusNote?: string | null
  /** Registrable domain whose owner verified the listing (claim flow). */
  claimedBy?: string | null
  /**
   * The same brand on Affitor too (schema `also_on`): its marketplace page, and
   * the commission scripts/sync-affitor.ts copies from the Affitor API, absent
   * when Affitor publishes none. One extra line on the page; never ranked.
   */
  alsoOn?: { affitor?: { url: string; commission?: Program["commission"] } } | null
  /** Type of income program as the YAML states it; undefined when the file leaves it out. */
  kind?: "affiliate" | "referral" | "creator-payout" | "revenue-share" | "cashback" | "partner-network"
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
    updatedAt: yaml.updated_at ?? undefined,
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
    // Unstated stays undefined so the page shows nothing rather than a ✗ the
    // source never said. A listing synced from Affitor omits all three.
    marketingMaterials: yaml.marketing_materials,
    apiAvailable: yaml.api_available,
    dedicatedManager: yaml.dedicated_manager,
    dashboardUrl: yaml.dashboard_url ?? null,
    network: yaml.network ?? null,
    programAge: yaml.program_age ?? null,
    agentKeywords: yaml.agents?.keywords ?? [],
    agentUseCases: yaml.agents?.use_cases ?? [],
    source: yaml.source,
    lastVerifiedAt: yaml.last_verified_at ?? null,
    aliases: yaml.aliases ?? [],
    status: yaml.status ?? "active",
    statusNote: yaml.status_note ?? null,
    claimedBy: yaml.claimed_by ?? null,
    alsoOn: yaml.also_on ?? null,
    kind: yaml.kind,
  }
}

export const programs: Program[] = (registryData.programs as unknown[]).map(mapYamlToProgram)

/** Paused, discontinued and no_program entries keep their page (reachable by slug) but are never listed or ranked as live. */
export function isLive(p: { status?: string | null }): boolean {
  return (p.status ?? "active") === "active"
}
export const livePrograms: Program[] = programs.filter(isLive)

export const categories = registryData.categories as string[]

export function getProgram(slug: string): Program | undefined {
  return programs.find((p) => p.slug === slug)
}

export { confirmedPitch, confirmedPrompt, confirmedProse, confirmedProseList, termsConfirmed, UNCONFIRMED, UNCONFIRMED_NOTE }

/**
 * The program as a reader may see it: unconfirmed cookie window, payout and
 * approval left out, along with the sentences of free text that state them
 * (see confirmed-terms.ts). For display and API output only; affiliateScore
 * and list ranking take the stored program.
 */
export function confirmedTerms(p: Program): Program {
  if (termsConfirmed(p)) return p
  const conditions = confirmedProse(p, p.commission.conditions) || null
  return {
    ...p,
    commission: { ...p.commission, conditions },
    commissionConditions: conditions,
    cookieDays: undefined,
    payout: {},
    payoutMethods: undefined,
    approval: undefined,
    approvalTime: undefined,
    description: confirmedPitch(p, p.description),
    shortDescription: confirmedPitch(p, p.shortDescription),
    agentPrompt: confirmedPrompt(p, p.agentPrompt),
    agentUseCases: confirmedProseList(p, p.agentUseCases),
    restrictions: confirmedProseList(p, p.restrictions),
  }
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
  includeDescription?: boolean
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
      if (c.value === null) return "Not published"
      return isCreditReward(c) ? `$${c.value.toLocaleString()} in credits` : `$${c.value.toLocaleString()}`
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

/** Reward paid as product credit, not cash (e.g. "$20 in Replit credits"). */
export function isCreditReward(c: Program["commission"]): boolean {
  return /credit/i.test(String(c.rate))
}

/** True when there is no figure to compare on. */
export function commissionUnknown(c: Program["commission"]): boolean {
  return c.mode === "unknown" || c.value === null
}

/**
 * Format a commission figure for display: `flat` for a US-dollar amount
 * ("$150", "$1.5k"), otherwise a percentage ("30%", "12.5%"). Callers pass a
 * figure from rankedCommission, so the unit is known, never guessed.
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
 * The commission a ranking may count, from structured fields only: a single
 * percentage (mode "percentage"), or a flat amount in explicit US dollars
 * (mode "flat", currency "USD"). Null for everything else: tiered, hybrid and
 * unknown modes, a flat amount in another or no currency, and referral rewards
 * (kind "referral": credit or gift cards). The rate text is never read.
 * listScore (best-lists.ts) and affiliateScore both go through here, so a list
 * and the Affiliate Score cannot disagree on what counts as cash.
 */
export function rankedCommission(p: Pick<Program, "commission" | "kind">): Program["commission"] | null {
  const c = p.commission
  if (p.kind === "referral") return null
  if (c.mode === "percentage" || (c.mode === "flat" && c.currency === "USD")) return c
  return null
}

/**
 * Affiliate Score (0–100), from structured fields only: the rate text is
 * never read, so rewording it cannot move a program.
 *
 * | Component          | Max | Formula                                               |
 * |--------------------|-----|-------------------------------------------------------|
 * | Commission value   |  40 | rankedCommission only, otherwise 0                    |
 * |                    |     | Percentage: min(value/50,1)×40                        |
 * |                    |     | Flat USD: $1-49→8, $50-99→16, $100-499→28, $500+→40  |
 * | Cookie window      |  15 | min(days/90,1) × 15, once terms are confirmed; else 0 |
 * | Type + Duration    |  25 | one-time:5, hybrid:5, tiered:12                       |
 * |                    |     | recurring:18, rec/12mo:21, rec/24mo:23, rec/lifetime:25|
 * | Verified           |  10 | 10 if verified                                        |
 * | Completeness       |  10 | +4 description, +3 agent prompt, +3 signup URL        |
 * | **Total**          | 100 |                                                       |
 */
export function affiliateScore(p: Program): number {
  // Commission value (max 40)
  const c = rankedCommission(p)
  const value = c?.value ?? 0
  let commScore = 0
  if (c && Number.isFinite(value) && value > 0) {
    commScore =
      c.mode === "percentage"
        ? Math.min(value / 50, 1) * 40
        : value >= 500 ? 40 : value >= 100 ? 28 : value >= 50 ? 16 : 8
  }

  // Cookie window (max 15). An unverified program's stored window is usually
  // an import default, and no surface shows it (confirmed-terms.ts), so it
  // counts as unknown here too.
  const cookieScore = termsConfirmed(p) ? Math.min((p.cookieDays ?? 0) / 90, 1) * 15 : 0

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

  let results = livePrograms

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
        p.category.toLowerCase().includes(q) ||
        (opts.includeDescription && p.description.toLowerCase().includes(q))
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

/**
 * Networks with at least one live program: the only ones that get a page, a
 * Markdown twin or a sitemap entry. A network whose programs are all paused or
 * discontinued would otherwise publish an empty page.
 */
export const liveNetworks = [...new Set(livePrograms.map((p) => p.network ?? IN_HOUSE))].sort() as string[]

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

export {
  NETWORK_META,
  NETWORK_KIND_LABEL,
  networkHeading,
  networkKind,
  networkName,
  type NetworkKind,
  type NetworkMeta,
} from "./network-meta"

/** One sentence explaining how a reader actually joins programs here. */
export function networkHowToJoin(network: string): string {
  // Affitor has no network-level application to pass: you sign up as a
  // partner, then apply per program, approved instantly or by the brand
  // (affitor.com/docs/partners).
  if (network === "affitor") {
    return "Affitor runs a marketplace: you create one partner account, then apply to each program inside it."
  }
  const name = networkName(network)
  switch (networkKind(network)) {
    case "marketplace":
      return `${name} runs a marketplace: you apply once, then request access to individual programs from inside it.`
    case "direct":
      return "These brands run their own programs — you sign up with each one directly, on their site."
    case "software":
    default:
      return `${name} is affiliate software rather than a marketplace. Brands run their own programs on it, so there is no directory to browse — you join through the brand.`
  }
}

export function networkToSlug(network: string): string {
  return network.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
}

export function slugToNetwork(slug: string): string | undefined {
  return liveNetworks.find((n) => networkToSlug(n) === slug)
}

/**
 * Orders programs by commission on the list pages (listScore in best-lists.ts),
 * with a normalized score that can place a percentage next to a flat fee.
 * Heuristic: $1 ≈ 1pp up to a cap of 100, so every flat amount from $550 up
 * ties at the cap. That is fine for an order and wrong for a "best" figure,
 * which is why commissionStats never uses it. Takes a commission that
 * rankedCommission has let through: the typed value and mode, never the text.
 */
export function rankScore(c: Program["commission"]): number {
  const n = c.value ?? 0
  if (!isFinite(n) || n <= 0) return 0
  if (c.mode === "flat") {
    // $1-$49 → 1-49, $50-$500 → 50-95, capped at 100
    if (n < 50) return n
    return Math.min(100, 50 + (n - 50) * 0.1)
  }
  // Percentage: direct, capped at 100
  return Math.min(n, 100)
}

/** A commission figure and the program that pays it. */
export interface PaidBy {
  value: number
  program: Program
}

/**
 * Commission figures for a group of programs (a network, a category), from
 * rankedCommission only. A percentage and a dollar amount are never averaged
 * or compared with each other: without the sale price there is no honest
 * exchange rate between "30%" and "$150". So a group has a rate side and a
 * flat side:
 *   - avgRate, topRate: mean and highest single percentage rate;
 *   - topFlatUsd: highest flat payout in US dollars.
 * Credit and gift-card rewards, tiered and hybrid deals, flat amounts in
 * another or no currency, and unpublished rates count on neither side (a
 * tiered "up to $150" was shown as a 150% rate). A percentage counts in any
 * currency. Each is null when nothing in the group counts. A tie goes to the
 * verified program, then to the earlier one in the group.
 *
 * Unverified commissions count, as everywhere else on the site, so every
 * surface that shows these figures says so: the average with rateBasis, a
 * named top program with the "unconfirmed" marker when !termsConfirmed.
 */
export interface CommissionStats {
  avgRate: number | null
  /** The single rates the average is taken over, and how many are unconfirmed. */
  rateCount: number
  unconfirmedRates: number
  topRate: PaidBy | null
  topFlatUsd: PaidBy | null
}

export function commissionStats(progs: Program[]): CommissionStats {
  const side = (mode: "percentage" | "flat"): PaidBy[] =>
    progs.flatMap((program) => {
      const c = rankedCommission(program)
      const value = c?.value
      return c?.mode === mode && typeof value === "number" && Number.isFinite(value) && value > 0 ? [{ value, program }] : []
    })
  const top = (paid: PaidBy[]): PaidBy | null =>
    paid.reduce<PaidBy | null>(
      (best, x) =>
        !best || x.value > best.value || (x.value === best.value && x.program.verified && !best.program.verified) ? x : best,
      null
    )
  const rates = side("percentage")
  return {
    avgRate: rates.length ? rates.reduce((sum, r) => sum + r.value, 0) / rates.length : null,
    rateCount: rates.length,
    unconfirmedRates: rates.filter((r) => !termsConfirmed(r.program)).length,
    topRate: top(rates),
    topFlatUsd: top(side("flat")),
  }
}

/** What an average rate is taken over: "289 rates (214 unconfirmed)". */
export function rateBasis(s: CommissionStats): string {
  const n = s.rateCount
  return `${n} ${n === 1 ? "rate" : "rates"}${s.unconfirmedRates > 0 ? ` (${s.unconfirmedRates} unconfirmed)` : ""}`
}

/** A figure on a /rankings networks or categories row, as the browser shows it. */
export interface PaidFigure {
  display: string
  slug: string
  name: string
  /** The program's terms are not verified: shown with the UNCONFIRMED marker. */
  unconfirmed: boolean
}

/**
 * A /rankings networks or categories row, built on the server as display
 * strings: the browser's copy of the registry has no `kind`, so it could not
 * leave referral rewards out.
 */
export interface GroupRow {
  /** The network id or the category name. */
  name: string
  programCount: number
  /** Mean single percentage rate, "23.4%", or "—". */
  avgRate: string
  /** rateBasis, or null when no rate counts. */
  avgBasis: string | null
  topRate: PaidFigure | null
  topFlatUsd: PaidFigure | null
}

export function groupRow(name: string, programCount: number, s: CommissionStats): GroupRow {
  const figure = (x: PaidBy | null, flat: boolean): PaidFigure | null =>
    x
      ? {
          display: formatCommissionDisplay(x.value, flat),
          slug: x.program.slug,
          name: x.program.name,
          unconfirmed: !termsConfirmed(x.program),
        }
      : null
  return {
    name,
    programCount,
    avgRate: s.avgRate != null ? `${s.avgRate.toFixed(1)}%` : "—",
    avgBasis: s.avgRate != null ? rateBasis(s) : null,
    topRate: figure(s.topRate, false),
    topFlatUsd: figure(s.topFlatUsd, true),
  }
}

export interface NetworkStats extends CommissionStats {
  network: string
  programCount: number
}

export function getNetworkStats(): NetworkStats[] {
  const networkMap = new Map<string, Program[]>()
  for (const p of livePrograms) {
    const net = p.network ?? IN_HOUSE
    if (!networkMap.has(net)) networkMap.set(net, [])
    networkMap.get(net)!.push(p)
  }

  return Array.from(networkMap.entries())
    .map(([network, progs]) => ({ network, programCount: progs.length, ...commissionStats(progs) }))
    .sort((a, b) => b.programCount - a.programCount)
}

export interface CategoryStats extends CommissionStats {
  category: string
  programCount: number
}

export function getCategoryStats(): CategoryStats[] {
  const catMap = new Map<string, Program[]>()
  for (const p of livePrograms) {
    if (!catMap.has(p.category)) catMap.set(p.category, [])
    catMap.get(p.category)!.push(p)
  }

  return Array.from(catMap.entries())
    .map(([category, progs]) => ({ category, programCount: progs.length, ...commissionStats(progs) }))
    .sort((a, b) => b.programCount - a.programCount)
}
