import { type NextRequest, NextResponse } from "next/server"
import { confirmedTerms, searchPrograms, type SortOption } from "@/lib/programs"
import { apiError } from "@/lib/api-error"

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
const VALID_TYPES = new Set(["recurring", "one-time", "tiered", "hybrid"])

export function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  for (const name of ["q", "category", "type", "verified", "include_description", "sort", "limit", "offset"]) {
    if (searchParams.getAll(name).length > 1) {
      return apiError(400, "INVALID_QUERY", `Repeated parameter: ${name}.`, "Supply each filter once. See /openapi.json.")
    }
  }
  for (const name of ["verified", "include_description"]) {
    const value = searchParams.get(name)
    if (value !== null && value !== "true" && value !== "false") {
      return apiError(400, "INVALID_QUERY", `Invalid ${name} value.`, "Use true or false.")
    }
  }
  for (const name of ["limit", "offset"]) {
    const value = searchParams.get(name)
    if (value !== null && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))) {
      return apiError(400, "INVALID_QUERY", `Invalid ${name} value.`, "Use a non-negative safe integer; limit is capped at 500.")
    }
  }
  if (searchParams.has("sort") && !VALID_SORTS.has(searchParams.get("sort")!)) {
    return apiError(400, "INVALID_QUERY", "Unknown sort order.", "Use relevance, az, za, commission_desc or newest.")
  }
  if (searchParams.has("type") && !VALID_TYPES.has(searchParams.get("type")!)) {
    return apiError(400, "INVALID_QUERY", "Unknown commission type.", "Use recurring, one-time, tiered or hybrid.")
  }
  const q = searchParams.get("q") ?? ""
  const category = searchParams.get("category") ?? undefined
  const type = searchParams.get("type") ?? undefined
  const verified = searchParams.get("verified")
  const includeDescription =
    searchParams.get("include_description") === "true"
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
    includeDescription,
  })

  const total = results.length

  if (offset > 0 || limit > 0) {
    results = results.slice(offset, limit > 0 ? offset + limit : undefined)
  }

  return NextResponse.json(
    {
      // Unverified programs leave out their cookie window, payout and approval.
      programs: results.map(confirmedTerms),
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
