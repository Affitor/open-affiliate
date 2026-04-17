import { type NextRequest, NextResponse } from "next/server"
import { programs, searchPrograms } from "@/lib/programs"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const q = searchParams.get("q") ?? ""
  const category = searchParams.get("category")
  const type = searchParams.get("type")
  const verified = searchParams.get("verified")

  let results = searchPrograms(q, category ?? undefined)

  if (type) {
    results = results.filter((p) => p.commission.type === type)
  }

  if (verified === "true") {
    results = results.filter((p) => p.verified)
  }

  return NextResponse.json(
    {
      programs: results,
      total: results.length,
      filters: { q: q || null, category, type },
    },
    { headers: CORS_HEADERS }
  )
}
