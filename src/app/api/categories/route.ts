import { NextResponse } from "next/server"
import { livePrograms, categories } from "@/lib/programs"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, API-Version",
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
  "CDN-Cache-Control": "public, s-maxage=3600",
  "Vercel-CDN-Cache-Control": "public, s-maxage=3600",
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export function GET() {
  const categoriesWithCounts = categories.map((name) => ({
    name,
    // Live programs only: a brand with no program is not one to count.
    count: livePrograms.filter((p) => p.category === name).length,
  }))

  return NextResponse.json(
    {
      categories: categoriesWithCounts,
      total: categoriesWithCounts.length,
    },
    { headers: CORS_HEADERS }
  )
}
