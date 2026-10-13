import { type NextRequest, NextResponse } from "next/server"
import { getProgram } from "@/lib/programs"
import { apiProgram } from "@/lib/no-program"

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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const program = getProgram(slug)

  if (!program) {
    return NextResponse.json(
      { error: "Program not found" },
      { status: 404, headers: CORS_HEADERS }
    )
  }

  // A brand with no program gets the page's answer and alternatives, not terms.
  return NextResponse.json(apiProgram(program), { headers: CORS_HEADERS })
}
