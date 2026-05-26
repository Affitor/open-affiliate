import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import {
  programs,
  parseCommissionRate,
  isCommissionFlat,
  formatCommissionDisplay,
  affiliateScore,
} from "@/lib/programs"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""

export async function GET() {
  const supabase = createClient(supabaseUrl, supabaseKey)

  // Fetch all scored items
  const allScored: { sift_score: number; sift_tag: string | null; platform: string; program_slug: string }[] = []
  let offset = 0
  while (true) {
    const { data } = await supabase
      .from("social_items")
      .select("sift_score, sift_tag, platform, program_slug")
      .not("sift_score", "is", null)
      .range(offset, offset + 999)
    if (!data || data.length === 0) break
    allScored.push(...data)
    if (data.length < 1000) break
    offset += 1000
  }

  // Build per-program aggregates
  const programMap = new Map<string, { scores: number[]; tags: Map<string, number>; platforms: Map<string, number> }>()
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

  const programLookup = new Map(programs.map((p) => [p.slug, p]))

  const items = Array.from(programMap.entries()).map(([slug, data]) => {
    const program = programLookup.get(slug)
    const avg = data.scores.reduce((a, b) => a + b, 0) / data.scores.length
    const verified = data.scores.filter((s) => s >= 7).length
    const topTag = Array.from(data.tags.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "none"
    const topPlatform = Array.from(data.platforms.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown"
    const score = program ? affiliateScore(program) : 0
    const commRate = program ? parseCommissionRate(program.commission.rate) : 0
    const flat = program ? isCommissionFlat(program.commission.rate) : false

    return {
      slug,
      name: program?.name ?? slug.replace(/-/g, " "),
      category: program?.category ?? "Other",
      commission: program ? String(program.commission.rate) : "—",
      commissionDisplay: formatCommissionDisplay(commRate, flat),
      commissionType: program?.commission.type ?? "unknown",
      cookieDays: program?.cookieDays ?? 0,
      affiliateScore: score,
      verified: program?.verified ?? false,
      verifiedContent: verified,
      totalContent: data.scores.length,
      avgSiftScore: Math.round(avg * 10) / 10,
      topTag,
      topPlatform,
    }
  })

  return NextResponse.json(items, {
    headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=600" },
  })
}
