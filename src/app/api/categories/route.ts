import { NextResponse } from "next/server"
import { programs, categories } from "@/lib/programs"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export function GET() {
  const categoriesWithCounts = categories.map((name) => ({
    name,
    count: programs.filter((p) => p.category === name).length,
  }))

  return NextResponse.json(
    {
      categories: categoriesWithCounts,
      total: categoriesWithCounts.length,
    },
    { headers: CORS_HEADERS }
  )
}
