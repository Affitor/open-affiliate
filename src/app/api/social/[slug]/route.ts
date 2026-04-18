import { NextRequest, NextResponse } from "next/server"
import { getProgram } from "@/lib/programs"

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY ?? ""

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=172800, stale-while-revalidate=604800",
  "CDN-Cache-Control": "public, s-maxage=172800",
  "Vercel-CDN-Cache-Control": "public, s-maxage=172800",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

export interface SocialItem {
  platform: "youtube" | "tiktok" | "x"
  title: string
  url: string
  thumbnail?: string
  author: string
  views?: number
  publishedAt?: string
  /** Composite quality score: views × recency weight */
  qualityScore?: number
}

/** Recency multiplier: 1.0 for today → 0.1 for 1yr+ old */
function recencyWeight(dateStr?: string): number {
  if (!dateStr) return 0.3
  const days = (Date.now() - new Date(dateStr).getTime()) / 86400000
  if (days < 0) return 1
  if (days < 7) return 1.0
  if (days < 30) return 0.9
  if (days < 90) return 0.7
  if (days < 180) return 0.5
  if (days < 365) return 0.3
  return 0.1
}

/** Platform-specific view normalization (X favorites vs YT/TT views) */
function normalizeViews(views: number, platform: string): number {
  if (platform === "x") return views * 50 // 1 like ≈ 50 views equivalent
  return views
}

function computeQualityScore(item: SocialItem): number {
  const normalized = normalizeViews(item.views ?? 0, item.platform)
  return Math.round(normalized * recencyWeight(item.publishedAt))
}

/** Min quality thresholds per platform */
const MIN_VIEWS: Record<string, number> = {
  youtube: 200,
  tiktok: 300,
  x: 3,
}

async function fetchYouTube(query: string): Promise<SocialItem[]> {
  const res = await fetch(
    `https://youtube-api49.p.rapidapi.com/api/search?q=${encodeURIComponent(query)}&maxResults=6&regionCode=US`,
    {
      headers: {
        "x-rapidapi-host": "youtube-api49.p.rapidapi.com",
        "x-rapidapi-key": RAPIDAPI_KEY,
      },
      signal: AbortSignal.timeout(8000),
    }
  )
  if (!res.ok) return []
  const data = await res.json()
  if (!data?.items?.length) return []

  return data.items
    .filter((item: Record<string, unknown>) => {
      const id = item.id as Record<string, unknown> | undefined
      return id?.kind === "youtube#video"
    })
    .slice(0, 6)
    .map((item: Record<string, unknown>) => {
      const id = item.id as Record<string, unknown>
      const snippet = item.snippet as Record<string, unknown>
      const thumbnails = snippet?.thumbnails as Record<string, unknown> | undefined
      const medium = thumbnails?.medium as Record<string, unknown> | undefined
      return {
        platform: "youtube" as const,
        title: String(snippet?.title ?? ""),
        url: `https://youtube.com/watch?v=${id?.videoId}`,
        thumbnail: medium?.url ? String(medium.url) : undefined,
        author: String(snippet?.channelTitle ?? ""),
        publishedAt: String(snippet?.publishedAt ?? ""),
      }
    })
}

async function fetchTikTok(query: string): Promise<SocialItem[]> {
  const res = await fetch(
    `https://tiktok-api23.p.rapidapi.com/api/search/video?keyword=${encodeURIComponent(query)}&cursor=0&search_id=0`,
    {
      headers: {
        "x-rapidapi-host": "tiktok-api23.p.rapidapi.com",
        "x-rapidapi-key": RAPIDAPI_KEY,
      },
      signal: AbortSignal.timeout(8000),
    }
  )
  if (!res.ok) return []
  const data = await res.json()
  if (!data?.item_list?.length) return []

  return data.item_list.slice(0, 6).map((item: Record<string, unknown>) => {
    const author = item.author as Record<string, unknown> | undefined
    const video = item.video as Record<string, unknown> | undefined
    const stats = item.statistics as Record<string, unknown> | undefined
    const desc = String(item.desc ?? "")
    return {
      platform: "tiktok" as const,
      title: desc.length > 120 ? desc.slice(0, 120) + "..." : desc,
      url: `https://tiktok.com/@${author?.uniqueId}/video/${item.id}`,
      thumbnail: video?.cover ? String(video.cover) : undefined,
      author: String(author?.nickname ?? author?.uniqueId ?? ""),
      views: Number(stats?.playCount ?? item.play_count ?? 0),
      publishedAt: item.createTime
        ? new Date(Number(item.createTime) * 1000).toISOString()
        : undefined,
    }
  })
}

async function fetchX(query: string): Promise<SocialItem[]> {
  const res = await fetch(
    `https://twitter-api45.p.rapidapi.com/search.php?query=${encodeURIComponent(query)}&search_type=Top`,
    {
      headers: {
        "x-rapidapi-host": "twitter-api45.p.rapidapi.com",
        "x-rapidapi-key": RAPIDAPI_KEY,
      },
      signal: AbortSignal.timeout(8000),
    }
  )
  if (!res.ok) return []
  const data = await res.json()
  if (!data?.timeline?.length) return []

  return data.timeline
    .filter((item: Record<string, unknown>) => item.type === "tweet")
    .slice(0, 6)
    .map((item: Record<string, unknown>) => {
      const text = String(item.text ?? "")
      return {
        platform: "x" as const,
        title: text.length > 140 ? text.slice(0, 140) + "..." : text,
        url: `https://x.com/${item.screen_name}/status/${item.tweet_id}`,
        author: String(item.screen_name ?? ""),
        views: Number(item.favorites ?? 0),
        publishedAt: item.created_at ? String(item.created_at) : undefined,
      }
    })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const program = getProgram(slug)

  if (!program) {
    return NextResponse.json({ items: [] }, { status: 404, headers: CACHE_HEADERS })
  }

  if (!RAPIDAPI_KEY) {
    return NextResponse.json(
      { items: [], error: "API key not configured" },
      { headers: CACHE_HEADERS }
    )
  }

  // Intent-driven queries per platform
  const ytQuery = `${program.name} affiliate program review`
  const ttQuery = `${program.name} affiliate make money`
  const xQuery = `${program.name} affiliate`

  const [ytResult, ttResult, xResult] = await Promise.allSettled([
    fetchYouTube(ytQuery),
    fetchTikTok(ttQuery),
    fetchX(xQuery),
  ])

  const raw: SocialItem[] = [
    ...(ytResult.status === "fulfilled" ? ytResult.value : []),
    ...(ttResult.status === "fulfilled" ? ttResult.value : []),
    ...(xResult.status === "fulfilled" ? xResult.value : []),
  ]

  // 1. Filter: min quality threshold per platform
  const filtered = raw.filter((item) => {
    const min = MIN_VIEWS[item.platform] ?? 0
    return (item.views ?? 0) >= min
  })

  // 2. Score: composite quality (views × recency)
  const scored = filtered.map((item) => ({
    ...item,
    qualityScore: computeQualityScore(item),
  }))

  // 3. Deduplicate: max 2 per author (diversity)
  const authorCount = new Map<string, number>()
  const deduped = scored.filter((item) => {
    const key = `${item.platform}:${item.author.toLowerCase()}`
    const count = authorCount.get(key) ?? 0
    if (count >= 2) return false
    authorCount.set(key, count + 1)
    return true
  })

  // 4. Sort by quality score, then pick top per platform (balanced mix)
  deduped.sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0))

  // Ensure balanced platform representation: max 3 per platform in final output
  const platformCount = new Map<string, number>()
  const balanced: SocialItem[] = []
  for (const item of deduped) {
    const pc = platformCount.get(item.platform) ?? 0
    if (pc >= 3) continue
    platformCount.set(item.platform, pc + 1)
    balanced.push(item)
    if (balanced.length >= 9) break
  }

  // 5. Final sort: group by platform, then by quality within each group
  const platformOrder = { youtube: 0, tiktok: 1, x: 2 }
  balanced.sort((a, b) => {
    const pa = platformOrder[a.platform] ?? 9
    const pb = platformOrder[b.platform] ?? 9
    if (pa !== pb) return pa - pb
    return (b.qualityScore ?? 0) - (a.qualityScore ?? 0)
  })

  return NextResponse.json(
    { items: balanced, cached_at: new Date().toISOString() },
    { headers: CACHE_HEADERS }
  )
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CACHE_HEADERS })
}
