import { NextRequest, NextResponse } from "next/server"
import { getProgram } from "@/lib/programs"

export const maxDuration = 55

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY ?? ""
const APIFY_API_KEY = process.env.APIFY_API_KEY ?? ""

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=172800, stale-while-revalidate=604800",
  "CDN-Cache-Control": "public, s-maxage=172800",
  "Vercel-CDN-Cache-Control": "public, s-maxage=172800",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

export interface SocialItem {
  platform: "youtube" | "tiktok" | "x" | "reddit" | "blog"
  title: string
  url: string
  thumbnail?: string
  author: string
  views?: number
  likes?: number
  publishedAt?: string
  snippet?: string
  qualityScore?: number
}

// --- Relevance & scoring ---

const RELEVANCE_KEYWORDS = [
  "affiliate", "review", "make money", "earn", "commission", "passive income",
  "tutorial", "how to", "worth it", "honest", "pros and cons", "comparison",
  "vs", "pricing", "referral", "partner", "creator program", "side hustle",
  "$", "per month", "per day", "income", "revenue",
]

function isRelevant(title: string, programName: string): boolean {
  const t = title.toLowerCase()
  const name = programName.toLowerCase()
  // Must mention program name OR have affiliate-intent keywords
  const mentionsName = t.includes(name)
  const hasKeyword = RELEVANCE_KEYWORDS.some((kw) => t.includes(kw))
  return mentionsName || hasKeyword
}

function relevanceMultiplier(title: string): number {
  const t = title.toLowerCase()
  let hits = 0
  for (const kw of RELEVANCE_KEYWORDS) {
    if (t.includes(kw)) hits++
  }
  if (hits >= 3) return 2.0
  if (hits >= 2) return 1.5
  if (hits >= 1) return 1.2
  return 0.5
}

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

function normalizeViews(views: number, platform: string): number {
  if (platform === "x") return views * 50
  if (platform === "reddit") return views * 30
  return views
}

function computeQualityScore(item: SocialItem): number {
  const views = item.views ?? item.likes ?? 0
  const normalized = normalizeViews(views, item.platform)
  const recency = recencyWeight(item.publishedAt)
  const relevance = relevanceMultiplier(item.title)
  return Math.round(normalized * recency * relevance)
}

const MIN_VIEWS: Record<string, number> = {
  youtube: 100,
  tiktok: 200,
  x: 3,
  reddit: 1,
  blog: 0,
}

// --- YouTube via Apify (better data with view counts) ---

async function fetchYouTube(query: string): Promise<SocialItem[]> {
  if (APIFY_API_KEY) {
    try {
      return await fetchYouTubeApify(query)
    } catch {
      // Fall through to RapidAPI
    }
  }
  return fetchYouTubeRapidAPI(query)
}

async function fetchYouTubeApify(query: string): Promise<SocialItem[]> {
  const res = await fetch(
    `https://api.apify.com/v2/acts/api-ninja~youtube-search-scraper/run-sync-get-dataset-items?token=${APIFY_API_KEY}&timeout=45`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, maxResults: 20 }),
      signal: AbortSignal.timeout(50000),
    }
  )
  if (!res.ok) return []
  const data = await res.json()
  if (!Array.isArray(data) || data.length === 0) return []

  return data
    .filter((item: Record<string, unknown>) => item.type === "video")
    .slice(0, 6)
    .map((item: Record<string, unknown>) => ({
      platform: "youtube" as const,
      title: String(item.title ?? ""),
      url: `https://youtube.com/watch?v=${item.videoId}`,
      thumbnail: (() => {
        const thumb = item.thumbnail as Record<string, unknown>[] | undefined
        return thumb?.[0]?.url ? String(thumb[0].url) : undefined
      })(),
      author: String(item.channelTitle ?? ""),
      views: Number(item.viewCount ?? 0),
      publishedAt: item.publishedAt ? String(item.publishedAt) : undefined,
    }))
}

async function fetchYouTubeRapidAPI(query: string): Promise<SocialItem[]> {
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

// --- TikTok via RapidAPI ---

async function fetchTikTok(query: string): Promise<SocialItem[]> {
  if (!RAPIDAPI_KEY) return []
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

// --- X via RapidAPI ---

async function fetchX(query: string): Promise<SocialItem[]> {
  if (!RAPIDAPI_KEY) return []
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
        likes: Number(item.favorites ?? 0),
        views: item.views ? Number(item.views) : undefined,
        publishedAt: item.created_at ? String(item.created_at) : undefined,
      }
    })
}

// --- Reddit via Google Search (Apify) ---

async function fetchReddit(query: string): Promise<SocialItem[]> {
  if (!APIFY_API_KEY) return []
  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/igolaizola~google-search-scraper-ppe/run-sync-get-dataset-items?token=${APIFY_API_KEY}&timeout=25`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `${query} site:reddit.com`,
          maxResults: 5,
        }),
        signal: AbortSignal.timeout(30000),
      }
    )
    if (!res.ok) return []
    const data = await res.json()
    if (!Array.isArray(data)) return []

    return data
      .filter((item: Record<string, unknown>) => {
        const url = String(item.url ?? "")
        return url.includes("reddit.com") && !url.includes("/user/")
      })
      .slice(0, 4)
      .map((item: Record<string, unknown>) => {
        const url = String(item.url ?? "")
        // Extract subreddit from URL
        const subMatch = url.match(/reddit\.com\/r\/([^/]+)/)
        const subreddit = subMatch ? subMatch[1] : ""
        return {
          platform: "reddit" as const,
          title: String(item.title ?? "").replace(/ - Reddit$/, "").replace(/ : r\/\w+/, ""),
          url,
          author: subreddit ? `r/${subreddit}` : "reddit",
          snippet: String(item.snippet ?? "").slice(0, 150),
        }
      })
  } catch {
    return []
  }
}

// --- Blog via Google Search (Apify) ---

async function fetchBlogs(query: string, programDomain: string): Promise<SocialItem[]> {
  if (!APIFY_API_KEY) return []
  try {
    // Exclude social/video platforms and the program's own domain
    const domain = programDomain.replace("https://", "").replace("http://", "").split("/")[0]
    const excludes = [
      "reddit.com", "youtube.com", "tiktok.com", "twitter.com", "x.com",
      "instagram.com", "facebook.com", "openaffiliate.dev", domain,
    ].map((d) => `-site:${d}`).join(" ")

    const res = await fetch(
      `https://api.apify.com/v2/acts/igolaizola~google-search-scraper-ppe/run-sync-get-dataset-items?token=${APIFY_API_KEY}&timeout=25`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `${query} ${excludes}`,
          maxResults: 5,
        }),
        signal: AbortSignal.timeout(30000),
      }
    )
    if (!res.ok) return []
    const data = await res.json()
    if (!Array.isArray(data)) return []

    return data
      .slice(0, 4)
      .map((item: Record<string, unknown>) => {
        const url = String(item.url ?? "")
        // Extract domain as "author"
        const domainMatch = url.match(/https?:\/\/(?:www\.)?([^/]+)/)
        const blogDomain = domainMatch ? domainMatch[1] : ""
        return {
          platform: "blog" as const,
          title: String(item.title ?? ""),
          url,
          author: blogDomain,
          snippet: String(item.snippet ?? "").slice(0, 150),
        }
      })
  } catch {
    return []
  }
}

// --- Main handler ---

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const program = getProgram(slug)

  if (!program) {
    return NextResponse.json({ items: [] }, { status: 404, headers: CACHE_HEADERS })
  }

  if (!RAPIDAPI_KEY && !APIFY_API_KEY) {
    return NextResponse.json(
      { items: [], error: "API keys not configured" },
      { headers: CACHE_HEADERS }
    )
  }

  // Intent-driven queries per platform
  const ytQuery = `${program.name} affiliate program review`
  const ttQuery = `${program.name} affiliate`
  const xQuery = `"${program.name}" affiliate program`
  const redditQuery = `${program.name} affiliate program`
  const blogQuery = `${program.name} affiliate program review`

  // Fetch all platforms in parallel with global timeout
  const globalTimeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("global timeout")), 50000)
  )

  let results: PromiseSettledResult<SocialItem[]>[]
  try {
    results = await Promise.race([
      Promise.allSettled([
        fetchYouTube(ytQuery),
        fetchTikTok(ttQuery),
        fetchX(xQuery),
        fetchReddit(redditQuery),
        fetchBlogs(blogQuery, program.url),
      ]),
      globalTimeout,
    ]) as PromiseSettledResult<SocialItem[]>[]
  } catch {
    // Global timeout — collect whatever resolved
    results = []
  }

  const raw: SocialItem[] = results.flatMap((r) =>
    r.status === "fulfilled" ? r.value : []
  )

  // 1. Filter: min quality threshold + relevance
  const filtered = raw.filter((item) => {
    const min = MIN_VIEWS[item.platform] ?? 0
    const engagement = item.views ?? item.likes ?? 0
    if (engagement < min && item.platform !== "blog" && item.platform !== "reddit") return false
    return isRelevant(item.title, program.name)
  })

  // 2. Score
  const scored = filtered.map((item) => ({
    ...item,
    qualityScore: computeQualityScore(item),
  }))

  // 3. Deduplicate: max 2 per author
  const authorCount = new Map<string, number>()
  const deduped = scored.filter((item) => {
    const key = `${item.platform}:${item.author.toLowerCase()}`
    const count = authorCount.get(key) ?? 0
    if (count >= 2) return false
    authorCount.set(key, count + 1)
    return true
  })

  // 4. Sort by quality, balanced platform mix
  deduped.sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0))

  const PLATFORM_MAX: Record<string, number> = {
    youtube: 4, tiktok: 2, x: 2, reddit: 2, blog: 2,
  }
  const platformCount = new Map<string, number>()
  const balanced: SocialItem[] = []
  for (const item of deduped) {
    const max = PLATFORM_MAX[item.platform] ?? 2
    const pc = platformCount.get(item.platform) ?? 0
    if (pc >= max) continue
    platformCount.set(item.platform, pc + 1)
    balanced.push(item)
    if (balanced.length >= 11) break
  }

  // 5. Final: group by platform order (YouTube > TikTok > X > Reddit > Blog)
  const platformOrder: Record<string, number> = {
    youtube: 0, tiktok: 1, x: 2, reddit: 3, blog: 4,
  }
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
