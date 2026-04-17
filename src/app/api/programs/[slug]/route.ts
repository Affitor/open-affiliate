import { type NextRequest, NextResponse } from "next/server"
import { getProgram } from "@/lib/programs"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
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

  return NextResponse.json(program, { headers: CORS_HEADERS })
}
