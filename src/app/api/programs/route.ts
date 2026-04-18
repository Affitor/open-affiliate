import { type NextRequest, NextResponse } from "next/server"
import { searchPrograms, type SortOption } from "@/lib/programs"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
  "CDN-Cache-Control": "public, s-maxage=3600",
  "Vercel-CDN-Cache-Control": "public, s-maxage=3600",
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

const VALID_SORTS = new Set(["relevance", "az", "za", "commission_desc", "newest"])

export function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const q = searchParams.get("q") ?? ""
  const category = searchParams.get("category") ?? undefined
  const type = searchParams.get("type") ?? undefined
  const verified = searchParams.get("verified")
  const sortParam = searchParams.get("sort") ?? "relevance"
  const sort = VALID_SORTS.has(sortParam) ? (sortParam as SortOption) : "relevance"
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "0") || 0, 500)
  const offset = parseInt(searchParams.get("offset") ?? "0") || 0

  let results = searchPrograms({
    query: q || undefined,
    category,
    commissionType: type,
    sort,
    verified: verified === "true" ? true : undefined,
  })

  const total = results.length

  if (offset > 0 || limit > 0) {
    results = results.slice(offset, limit > 0 ? offset + limit : undefined)
  }

  return NextResponse.json(
    {
      programs: results,
      total,
      filters: {
        q: q || null,
        category: category ?? null,
        type: type ?? null,
        sort,
      },
    },
    { headers: CORS_HEADERS }
  )
}
