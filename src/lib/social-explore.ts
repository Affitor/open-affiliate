import { createClient } from "@supabase/supabase-js"
import { readdirSync, readFileSync } from "fs"
import { join } from "path"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const supabaseAnonKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""

function getSupabase() {
  return createClient(supabaseUrl, supabaseAnonKey)
}

export interface ExploreItem {
  id: number
  program_slug: string
  platform: "youtube" | "tiktok" | "x" | "reddit" | "blog"
  title: string
  url: string
  thumbnail: string | null
  author: string
  views: number
  snippet: string | null
  sift_score: number | null
  sift_tag: string | null
  published_at: string | null
  fetched_at: string
}

export interface ExploreFilters {
  platform?: string
  category?: string
  timeRange?: string
  sort?: string
  quality?: string
  q?: string
  page?: number
  pageSize?: number
}

export interface ExploreResult {
  items: ExploreItem[]
  total: number
  page: number
  pageSize: number
  platforms: { platform: string; count: number }[]
  categories: string[]
}

// Build category → slugs map from YAML files (cached at module level)
let _categoryMap: Record<string, string[]> | null = null

function getCategoryMap(): Record<string, string[]> {
  if (_categoryMap) return _categoryMap
  _categoryMap = {}
  try {
    const programDir = join(process.cwd(), "programs")
    const files = readdirSync(programDir).filter((f) => f.endsWith(".yaml"))
    for (const f of files) {
      const content = readFileSync(join(programDir, f), "utf8")
      const catMatch = content.match(/category:\s*(.+)/)
      const cat = catMatch ? catMatch[1].trim() : "Other"
      const slug = f.replace(".yaml", "")
      if (!_categoryMap[cat]) _categoryMap[cat] = []
      _categoryMap[cat].push(slug)
    }
  } catch {
    // fallback if programs dir not available
  }
  return _categoryMap
}

function getDateThreshold(timeRange: string): string | null {
  const now = new Date()
  switch (timeRange) {
    case "7d":
      return new Date(now.getTime() - 7 * 86400000).toISOString()
    case "30d":
      return new Date(now.getTime() - 30 * 86400000).toISOString()
    case "90d":
      return new Date(now.getTime() - 90 * 86400000).toISOString()
    default:
      return null
  }
}

export async function fetchExploreData(
  filters: ExploreFilters
): Promise<ExploreResult> {
  const supabase = getSupabase()
  const page = filters.page ?? 1
  const pageSize = filters.pageSize ?? 25
  const offset = (page - 1) * pageSize

  // Build query
  let query = supabase
    .from("social_items")
    .select("*", { count: "exact" })

  // Platform filter
  if (filters.platform && filters.platform !== "all") {
    query = query.eq("platform", filters.platform)
  }

  // Category filter — get all program slugs in this category
  if (filters.category && filters.category !== "all") {
    const catMap = getCategoryMap()
    const slugs = catMap[filters.category] ?? []
    if (slugs.length > 0) {
      query = query.in("program_slug", slugs)
    } else {
      // No programs in this category
      return { items: [], total: 0, page, pageSize, platforms: [], categories: [] }
    }
  }

  // Time range filter
  const dateThreshold = getDateThreshold(filters.timeRange ?? "all")
  if (dateThreshold) {
    query = query.gte("published_at", dateThreshold)
  }

  // SIFT quality filter — only show scored content above threshold
  if (filters.quality && filters.quality !== "all") {
    const minScore = parseInt(filters.quality, 10)
    if (!isNaN(minScore)) {
      query = query.gte("sift_score", minScore)
    }
  }

  // Search
  if (filters.q) {
    query = query.or(
      `title.ilike.%${filters.q}%,author.ilike.%${filters.q}%,snippet.ilike.%${filters.q}%`
    )
  }

  // Sort
  switch (filters.sort) {
    case "quality":
      query = query.order("sift_score", { ascending: false, nullsFirst: false })
      break
    case "recent":
      query = query.order("published_at", { ascending: false, nullsFirst: false })
      break
    case "views":
      query = query.order("views", { ascending: false, nullsFirst: false })
      break
    default:
      query = query.order("sift_score", { ascending: false, nullsFirst: false })
      break
  }

  // Pagination
  query = query.range(offset, offset + pageSize - 1)

  const { data, count, error } = await query

  if (error) {
    console.error("Explore query error:", error)
    return { items: [], total: 0, page, pageSize, platforms: [], categories: [] }
  }

  // Get categories for filter dropdown
  const catMap = getCategoryMap()
  const categories = Object.keys(catMap).sort()

  return {
    items: (data ?? []) as ExploreItem[],
    total: count ?? 0,
    page,
    pageSize,
    platforms: [],
    categories,
  }
}

export async function fetchPlatformCounts(): Promise<
  Record<string, number>
> {
  const supabase = getSupabase()
  const platforms = ["youtube", "tiktok", "x", "reddit", "blog"]
  const counts: Record<string, number> = {}

  await Promise.all(
    platforms.map(async (p) => {
      const { count } = await supabase
        .from("social_items")
        .select("id", { count: "exact", head: true })
        .eq("platform", p)
      counts[p] = count ?? 0
    })
  )

  return counts
}
