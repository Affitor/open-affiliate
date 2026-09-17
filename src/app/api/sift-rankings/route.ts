import { NextResponse } from "next/server"
import {
  fetchSiftRankings,
  SIFT_RANKINGS_CACHE_HEADERS,
} from "@/lib/sift-rankings"

export const maxDuration = 30

export async function GET() {
  const items = await fetchSiftRankings()
  return NextResponse.json(items, {
    headers: SIFT_RANKINGS_CACHE_HEADERS,
  })
}
