import { unstable_cache } from "next/cache"
import { createClient } from "@supabase/supabase-js"
import { getProgram } from "@/lib/programs"

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY ?? ""
const APIFY_API_KEY = process.env.APIFY_API_KEY ?? ""

// Supabase client for persisting raw social data
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
const canPersist = Boolean(supabaseUrl && supabaseKey)

function getSupabase() {
  return createClient(supabaseUrl, supabaseKey)
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
  siftScore?: number | null
  siftTag?: string | null
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
  const mentionsName = name.length <= 4
    ? new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t)
    : t.includes(name)
  if (mentionsName) return true
  return RELEVANCE_KEYWORDS.some((kw) => t.includes(kw))
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

// --- YouTube via Apify ---

async function fetchYouTube(query: string): Promise<SocialItem[]> {
  // Prefer RapidAPI (free) over Apify ($0.03-0.05/call)
  if (RAPIDAPI_KEY) {
    try {
      const results = await fetchYouTubeRapidAPI(query)
      if (results.length > 0) return results
    } catch {
      // Fall through to Apify
    }
  }
  if (APIFY_API_KEY) {
    try {
      return await fetchYouTubeApify(query)
    } catch {
      return []
    }
  }
  return []
}

async function fetchYouTubeApify(query: string): Promise<SocialItem[]> {
  const res = await fetch(
    `https://api.apify.com/v2/acts/api-ninja~youtube-search-scraper/run-sync-get-dataset-items?token=${APIFY_API_KEY}&timeout=45`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, maxResults: 30 }),
      signal: AbortSignal.timeout(50000),
    }
  )
  if (!res.ok) return []
  const data = await res.json()
  if (!Array.isArray(data) || data.length === 0) return []

  return data
    .filter((item: Record<string, unknown>) => item.type === "video")
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
    `https://youtube-api49.p.rapidapi.com/api/search?q=${encodeURIComponent(query)}&maxResults=50&regionCode=US`,
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

  return data.item_list.map((item: Record<string, unknown>) => {
    const author = item.author as Record<string, unknown> | undefined
    const video = item.video as Record<string, unknown> | undefined
    const stats = (item.stats ?? item.statistics) as Record<string, unknown> | undefined
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

// --- Persist raw data to Supabase (fire-and-forget) ---

async function persistSocialItems(slug: string, items: SocialItem[]): Promise<void> {
  if (!canPersist || items.length === 0) return
  try {
    const rows = items.map((item) => ({
      program_slug: slug,
      platform: item.platform,
      title: item.title.slice(0, 500),
      url: item.url,
      thumbnail: item.thumbnail ?? null,
      author: item.author,
      views: item.views ?? 0,
      likes: item.likes ?? 0,
      snippet: item.snippet?.slice(0, 500) ?? null,
      quality_score: item.qualityScore ?? computeQualityScore(item),
      published_at: item.publishedAt ?? null,
    }))
    // Upsert by URL — updates views/likes/score on re-fetch
    await getSupabase()
      .from("social_items")
      .upsert(rows, { onConflict: "url", ignoreDuplicates: false })
  } catch {
    // Non-critical — don't break the page if DB is down
  }
}

// --- SIFT score enrichment ---

async function enrichWithSiftScores(slug: string, items: SocialItem[]): Promise<SocialItem[]> {
  if (!canPersist || items.length === 0) return items
  try {
    const { data } = await getSupabase()
      .from("social_items")
      .select("url, sift_score, sift_tag")
      .eq("program_slug", slug)
      .not("sift_score", "is", null)
    if (!data || data.length === 0) return items
    const scoreMap = new Map(data.map((r: { url: string; sift_score: number; sift_tag: string }) => [r.url, r]))
    return items.map((item) => {
      const scored = scoreMap.get(item.url)
      if (!scored) return item
      return { ...item, siftScore: scored.sift_score, siftTag: scored.sift_tag }
    })
  } catch {
    return items
  }
}

// --- Main exported function ---

async function _fetchSocialItems(slug: string): Promise<SocialItem[]> {
  const program = getProgram(slug)
  if (!program) return []
  if (!RAPIDAPI_KEY && !APIFY_API_KEY) return []

  // Rotate queries weekly to discover different content over time
  const week = Math.floor(Date.now() / (7 * 86400000))
  const ytQueries = [
    `${program.name} affiliate program review`,
    `${program.name} make money review ${new Date().getFullYear()}`,
    `${program.name} honest review commission`,
  ]
  const ttQueries = [
    `${program.name} affiliate`,
    `${program.name} make money`,
    `${program.name} review`,
  ]
  const blogQueries = [
    `${program.name} affiliate program review`,
    `${program.name} affiliate commission review ${new Date().getFullYear()}`,
    `"${program.name}" affiliate program pros cons`,
  ]
  const ytQuery = ytQueries[week % ytQueries.length]
  const ttQuery = ttQueries[week % ttQueries.length]
  const xQuery = `"${program.name}" affiliate program`
  const redditQuery = `${program.name} affiliate program`
  const blogQuery = blogQueries[week % blogQueries.length]

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
    results = []
  }

  const raw: SocialItem[] = results.flatMap((r) =>
    r.status === "fulfilled" ? r.value : []
  )

  // Score ALL raw items for storage
  const allScored = raw.map((item) => ({
    ...item,
    qualityScore: computeQualityScore(item),
  }))

  // Persist ALL raw data to Supabase (fire-and-forget, non-blocking)
  persistSocialItems(slug, allScored).catch(() => {})

  // Enrich with SIFT scores from DB (items scored by the SIFT pipeline)
  const enriched = await enrichWithSiftScores(slug, allScored)

  // 1. Filter: remove SIFT junk (score 0-2) if scored, otherwise use relevance check
  const filtered = enriched.filter((item) => {
    if (item.siftScore != null && item.siftScore <= 2) return false
    const min = MIN_VIEWS[item.platform] ?? 0
    const engagement = item.views ?? item.likes ?? 0
    if (engagement < min && item.platform !== "blog" && item.platform !== "reddit") return false
    return isRelevant(item.title, program.name)
  })

  // 2. Deduplicate: max 2 per author
  const authorCount = new Map<string, number>()
  const deduped = filtered.filter((item) => {
    const key = `${item.platform}:${item.author.toLowerCase()}`
    const count = authorCount.get(key) ?? 0
    if (count >= 2) return false
    authorCount.set(key, count + 1)
    return true
  })

  // 3. Sort by SIFT score (if available), then quality score. Balanced platform mix.
  deduped.sort((a, b) => {
    const sa = a.siftScore ?? -1
    const sb = b.siftScore ?? -1
    if (sa !== sb) return sb - sa
    return (b.qualityScore ?? 0) - (a.qualityScore ?? 0)
  })

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

  // 4. Sort by platform order, then SIFT score within platform
  const platformOrder: Record<string, number> = {
    youtube: 0, tiktok: 1, x: 2, reddit: 3, blog: 4,
  }
  balanced.sort((a, b) => {
    const pa = platformOrder[a.platform] ?? 9
    const pb = platformOrder[b.platform] ?? 9
    if (pa !== pb) return pa - pb
    const sa = a.siftScore ?? -1
    const sb = b.siftScore ?? -1
    if (sa !== sb) return sb - sa
    return (b.qualityScore ?? 0) - (a.qualityScore ?? 0)
  })

  return balanced
}

// Cached version — revalidates every 7 days via ISR
export const fetchSocialItems = unstable_cache(
  _fetchSocialItems,
  ["social-listen"],
  { revalidate: 604800 }
)
