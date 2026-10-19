import { type NextRequest, NextResponse } from "next/server"
import { resolveProgram } from "@/lib/program-aliases"
import { apiProgram } from "@/lib/no-program"
import { apiError, unsupportedApiVersion } from "@/lib/api-error"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, API-Version",
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
  "CDN-Cache-Control": "public, s-maxage=3600",
  "Vercel-CDN-Cache-Control": "public, s-maxage=3600",
  // A cached answer must not be reused for a request pinning another version.
  "Vary": "API-Version",
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const unsupported = unsupportedApiVersion(request)
  if (unsupported) return unsupported
  const { slug } = await params
  // An alias answers 200 with its program rather than a redirect, so a client
  // that does not follow redirects still gets it. The body's `slug` is canonical.
  const program = resolveProgram(slug)

  if (!program) {
    return apiError(404, "PROGRAM_NOT_FOUND", "Program not found.", "Search /api/programs?q=your-product to find a canonical slug.")
  }

  // A brand with no program gets the page's answer and alternatives, not terms.
  return NextResponse.json(apiProgram(program), { headers: CORS_HEADERS })
}
