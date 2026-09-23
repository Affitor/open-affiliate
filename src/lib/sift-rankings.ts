import { unstable_cache } from "next/cache"
import { createClient } from "@supabase/supabase-js"

export type SiftRankingRow = {
  slug: string
  verifiedContent: number
  totalContent: number
  avgSiftScore: number
  topTag: string
  topPlatform: string
}

export const SIFT_RANKINGS_CACHE_HEADERS = {
  "Cache-Control":
    "public, s-maxage=3600, stale-while-revalidate=604800",
  "CDN-Cache-Control":
    "public, s-maxage=3600, stale-while-revalidate=604800",
  "Vercel-CDN-Cache-Control":
    "public, s-maxage=3600, stale-while-revalidate=604800",
}

type RpcRow = {
  slug: string
  verified_content: number | string | null
  total_content: number | string | null
  avg_sift_score: number | string | null
  top_tag: string | null
  top_platform: string | null
}

function mapRow(row: RpcRow): SiftRankingRow {
  return {
    slug: row.slug,
    verifiedContent: Number(row.verified_content) || 0,
    totalContent: Number(row.total_content) || 0,
    avgSiftScore: Number(row.avg_sift_score) || 0,
    topTag: row.top_tag ?? "",
    topPlatform: row.top_platform ?? "",
  }
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  if (!url || !key) return null
  return createClient(url, key)
}

async function fetchViaRpc(): Promise<SiftRankingRow[] | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase.rpc("sift_rankings_agg")
  if (error || !data) return null
  return (data as RpcRow[]).map(mapRow)
}

/** Last-resort path: page every scored row. ~10s. Used only at runtime. */
async function fetchViaPagination(): Promise<SiftRankingRow[]> {
  const supabase = getSupabase()
  if (!supabase) return []

  const allScored: {
    sift_score: number
    sift_tag: string | null
    platform: string
    program_slug: string
  }[] = []
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

  const programMap = new Map<
    string,
    { scores: number[]; tags: Map<string, number>; platforms: Map<string, number> }
  >()
  for (const row of allScored) {
    if (!programMap.has(row.program_slug)) {
      programMap.set(row.program_slug, {
        scores: [],
        tags: new Map(),
        platforms: new Map(),
      })
    }
    const d = programMap.get(row.program_slug)!
    d.scores.push(row.sift_score)
    const tag = row.sift_tag || "untagged"
    d.tags.set(tag, (d.tags.get(tag) ?? 0) + 1)
    d.platforms.set(row.platform, (d.platforms.get(row.platform) ?? 0) + 1)
  }

  return Array.from(programMap.entries()).map(([slug, data]) => {
    const avg = data.scores.reduce((a, b) => a + b, 0) / data.scores.length
    return {
      slug,
      verifiedContent: data.scores.filter((s) => s >= 7).length,
      totalContent: data.scores.length,
      avgSiftScore: Math.round(avg * 10) / 10,
      topTag: Array.from(data.tags.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "",
      topPlatform:
        Array.from(data.platforms.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "",
    }
  })
}

export async function fetchSiftRankings(): Promise<SiftRankingRow[]> {
  const rpc = await fetchViaRpc()
  if (rpc) return rpc
  return fetchViaPagination()
}

/** Server page path: one RPC, never the 10s pagination loop. */
export async function fetchSiftRankingsForPage(): Promise<SiftRankingRow[]> {
  return (await fetchViaRpc()) ?? []
}

export const getCachedSiftRankings = unstable_cache(
  fetchSiftRankingsForPage,
  ["sift-rankings-agg"],
  { revalidate: 3600 }
)
