import { NextResponse } from "next/server"
import { openapi } from "@/lib/openapi"

export const dynamic = "force-static"

export function GET() {
  return NextResponse.json(openapi, {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=0, s-maxage=3600" },
  })
}
