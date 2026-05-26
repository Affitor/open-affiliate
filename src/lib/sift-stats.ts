import { createClient } from "@supabase/supabase-js"
import {
  programs,
  parseCommissionRate,
  isCommissionFlat,
  formatCommissionDisplay,
  affiliateScore,
  type Program,
} from "./programs"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""

function getSupabase() {
  return createClient(supabaseUrl, supabaseKey)
}

// ── Types ───────────────────────────────────────────────────────

export interface Opportunity {
  slug: string
  name: string
  category: string
  commission: string
  commissionType: string
  cookieDays: number
  affiliateScore: number
  verifiedContent: number
  totalContent: number
  avgSiftScore: number
  topTag: string
  topPlatform: string
  reason: string
}

export interface CategoryInsight {
  category: string
  programCount: number
  avgSiftScore: number
  bestFormat: string
  bestPlatform: string
  verifiedRate: number
  topProgram: { slug: string; name: string; avgScore: number }
  avgCommission: string
}

export interface PlatformInsight {
  platform: string
  count: number
  avgScore: number
  verifiedRate: number
  bestCategory: string
  bestFormat: string
}

export interface SiftInsights {
  // Summary
  totalContent: number
  scoredContent: number
  programsWithContent: number
  verifiedContent: number
  // Actionable lists
  opportunities: Opportunity[]
  highValueVerified: Opportunity[]
  risingPrograms: Opportunity[]
  // Breakdowns
  categoryInsights: CategoryInsight[]
  platformInsights: PlatformInsight[]
  formatRanking: { tag: string; avgScore: number; count: number }[]
}

// ── Data Fetching ───────────────────────────────────────────────

interface ScoredRow {
  sift_score: number
  sift_tag: string | null
  platform: string
  program_slug: string
}

export async function fetchSiftInsights(): Promise<SiftInsights> {
  const supabase = getSupabase()

  // Paginate all scored items
  const allScored: ScoredRow[] = []
  let offset = 0
  const batchSize = 1000
  while (true) {
    const { data: batch } = await supabase
      .from("social_items")
      .select("sift_score, sift_tag, platform, program_slug")
      .not("sift_score", "is", null)
      .range(offset, offset + batchSize - 1)
    if (!batch || batch.length === 0) break
    allScored.push(...(batch as ScoredRow[]))
    if (batch.length < batchSize) break
    offset += batchSize
  }

  // Total count
  const { count: totalCount } = await supabase
    .from("social_items")
    .select("id", { count: "exact", head: true })

  const totalContent = totalCount ?? 0
  const scoredContent = allScored.length

  // Build program-level aggregates
  const programMap = new Map<
    string,
    { scores: number[]; tags: Map<string, number>; platforms: Map<string, number> }
  >()
  for (const row of allScored) {
    if (!programMap.has(row.program_slug)) {
      programMap.set(row.program_slug, { scores: [], tags: new Map(), platforms: new Map() })
    }
    const d = programMap.get(row.program_slug)!
    d.scores.push(row.sift_score)
    const tag = row.sift_tag || "untagged"
    d.tags.set(tag, (d.tags.get(tag) ?? 0) + 1)
    d.platforms.set(row.platform, (d.platforms.get(row.platform) ?? 0) + 1)
  }

  const programsWithContent = programMap.size
  const verifiedContent = allScored.filter((r) => r.sift_score >= 7).length

  // Map programs to registry data
  const programLookup = new Map(programs.map((p) => [p.slug, p]))

  // ── Build Opportunities ─────────────────────────────────────

  // Opportunity: High commission + low content coverage
  const allProgramsWithData = Array.from(programMap.entries()).map(([slug, data]) => {
    const program = programLookup.get(slug)
    const avgScore = data.scores.reduce((a, b) => a + b, 0) / data.scores.length
    const verified = data.scores.filter((s) => s >= 7).length
    const topTag = Array.from(data.tags.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "none"
    const topPlatform = Array.from(data.platforms.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown"

    return {
      slug,
      name: program?.name ?? slug.replace(/-/g, " "),
      category: program?.category ?? "Other",
      commission: program ? String(program.commission.rate) : "—",
      commissionType: program?.commission.type ?? "unknown",
      cookieDays: program?.cookieDays ?? 0,
      affiliateScore: program ? affiliateScore(program) : 0,
      verifiedContent: verified,
      totalContent: data.scores.length,
      avgSiftScore: Math.round(avgScore * 10) / 10,
      topTag,
      topPlatform,
      reason: "",
      _program: program,
    }
  })

  // Gap opportunities: high-value programs with little verified content
  const opportunities = allProgramsWithData
    .filter((p) => p._program && p.affiliateScore >= 50 && p.verifiedContent <= 3)
    .map((p) => {
      const commRate = p._program ? parseCommissionRate(p._program.commission.rate) : 0
      const flat = p._program ? isCommissionFlat(p._program.commission.rate) : false
      const commDisplay = formatCommissionDisplay(commRate, flat)
      return {
        ...p,
        reason: p.verifiedContent === 0
          ? `${commDisplay} ${p.commissionType} commission, zero verified content — wide open`
          : `${commDisplay} ${p.commissionType}, only ${p.verifiedContent} verified pieces — low competition`,
        _program: undefined,
      }
    })
    .sort((a, b) => b.affiliateScore - a.affiliateScore)
    .slice(0, 12)

  // High-value verified: programs with strong content AND good commissions
  const highValueVerified = allProgramsWithData
    .filter((p) => p._program && p.verifiedContent >= 3 && p.affiliateScore >= 40)
    .map((p) => ({
      ...p,
      reason: `${p.verifiedContent} verified pieces (avg ${p.avgSiftScore}) — proven content patterns to replicate`,
      _program: undefined,
    }))
    .sort((a, b) => b.verifiedContent - a.verifiedContent)
    .slice(0, 12)

  // Rising: good avg score, moderate content — growing
  const risingPrograms = allProgramsWithData
    .filter((p) => p.avgSiftScore >= 5 && p.totalContent >= 3 && p.totalContent <= 20)
    .map((p) => ({
      ...p,
      reason: `Avg score ${p.avgSiftScore} across ${p.totalContent} items — ${p.topTag} content on ${p.topPlatform} performing well`,
      _program: undefined,
    }))
    .sort((a, b) => b.avgSiftScore - a.avgSiftScore)
    .slice(0, 12)

  // ── Category Insights ───────────────────────────────────────

  const catMap = new Map<
    string,
    { scores: number[]; tags: Map<string, number>; platforms: Map<string, number>; programs: Set<string> }
  >()
  for (const row of allScored) {
    const program = programLookup.get(row.program_slug)
    const cat = program?.category ?? "Other"
    if (!catMap.has(cat)) catMap.set(cat, { scores: [], tags: new Map(), platforms: new Map(), programs: new Set() })
    const d = catMap.get(cat)!
    d.scores.push(row.sift_score)
    d.programs.add(row.program_slug)
    const tag = row.sift_tag || "untagged"
    d.tags.set(tag, (d.tags.get(tag) ?? 0) + 1)
    d.platforms.set(row.platform, (d.platforms.get(row.platform) ?? 0) + 1)
  }

  const categoryInsights: CategoryInsight[] = Array.from(catMap.entries())
    .filter(([, d]) => d.scores.length >= 5)
    .map(([category, d]) => {
      const avgScore = d.scores.reduce((a, b) => a + b, 0) / d.scores.length
      const verified = d.scores.filter((s) => s >= 7).length
      const bestFormat = Array.from(d.tags.entries())
        .filter(([t]) => !["junk", "spam", "name_collision", "untagged"].includes(t))
        .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "mixed"
      const bestPlatform = Array.from(d.platforms.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "mixed"

      // Find top program in this category
      const catPrograms = allProgramsWithData.filter((p) => p.category === category && p.totalContent >= 3)
      const topProg = catPrograms.sort((a, b) => b.avgSiftScore - a.avgSiftScore)[0]

      // Avg commission for category
      const catProgramsFull = programs.filter((p) => p.category === category)
      const pctRates = catProgramsFull
        .filter((p) => !isCommissionFlat(p.commission.rate))
        .map((p) => parseCommissionRate(p.commission.rate))
      const avgComm = pctRates.length ? Math.round(pctRates.reduce((a, b) => a + b, 0) / pctRates.length) : 0

      return {
        category,
        programCount: d.programs.size,
        avgSiftScore: Math.round(avgScore * 10) / 10,
        bestFormat: bestFormat.replace(/_/g, " "),
        bestPlatform,
        verifiedRate: Math.round((verified / d.scores.length) * 100),
        topProgram: topProg
          ? { slug: topProg.slug, name: topProg.name, avgScore: topProg.avgSiftScore }
          : { slug: "", name: "—", avgScore: 0 },
        avgCommission: avgComm > 0 ? `${avgComm}%` : "—",
      }
    })
    .sort((a, b) => b.avgSiftScore - a.avgSiftScore)

  // ── Platform Insights ───────────────────────────────────────

  const platMap = new Map<
    string,
    { scores: number[]; tags: Map<string, number>; categories: Map<string, number> }
  >()
  for (const row of allScored) {
    if (!platMap.has(row.platform)) platMap.set(row.platform, { scores: [], tags: new Map(), categories: new Map() })
    const d = platMap.get(row.platform)!
    d.scores.push(row.sift_score)
    const tag = row.sift_tag || "untagged"
    d.tags.set(tag, (d.tags.get(tag) ?? 0) + 1)
    const program = programLookup.get(row.program_slug)
    const cat = program?.category ?? "Other"
    d.categories.set(cat, (d.categories.get(cat) ?? 0) + 1)
  }

  const platformInsights: PlatformInsight[] = Array.from(platMap.entries())
    .map(([platform, d]) => {
      const avgScore = d.scores.reduce((a, b) => a + b, 0) / d.scores.length
      const verified = d.scores.filter((s) => s >= 7).length
      const bestCategory = Array.from(d.categories.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "mixed"
      const bestFormat = Array.from(d.tags.entries())
        .filter(([t]) => !["junk", "spam", "name_collision", "untagged"].includes(t))
        .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "mixed"
      return {
        platform,
        count: d.scores.length,
        avgScore: Math.round(avgScore * 10) / 10,
        verifiedRate: Math.round((verified / d.scores.length) * 100),
        bestCategory,
        bestFormat: bestFormat.replace(/_/g, " "),
      }
    })
    .sort((a, b) => b.avgScore - a.avgScore)

  // ── Format Ranking ──────────────────────────────────────────

  const tagScores = new Map<string, number[]>()
  for (const row of allScored) {
    const tag = row.sift_tag || "untagged"
    if (["junk", "spam", "name_collision", "untagged"].includes(tag)) continue
    if (!tagScores.has(tag)) tagScores.set(tag, [])
    tagScores.get(tag)!.push(row.sift_score)
  }

  const formatRanking = Array.from(tagScores.entries())
    .map(([tag, scores]) => ({
      tag: tag.replace(/_/g, " "),
      avgScore: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
      count: scores.length,
    }))
    .sort((a, b) => b.avgScore - a.avgScore)

  return {
    totalContent,
    scoredContent,
    programsWithContent,
    verifiedContent,
    opportunities,
    highValueVerified,
    risingPrograms,
    categoryInsights,
    platformInsights,
    formatRanking,
  }
}
