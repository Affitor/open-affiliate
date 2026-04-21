import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { fetchSocialItems } from "@/lib/social"
import { programs, affiliateScore } from "@/lib/programs"

export const maxDuration = 300

const TOP_N = 50
const STALE_DAYS = 6
const CONCURRENCY = 3

interface SlugRow {
  program_slug: string
  fetched_at: string
}

async function pickStaleSlugs(): Promise<string[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  )

  const top = [...programs]
    .sort((a, b) => affiliateScore(b) - affiliateScore(a))
    .slice(0, TOP_N)
    .map((p) => p.slug)

  const since = new Date(Date.now() - STALE_DAYS * 86400000).toISOString()
  const { data } = await supabase
    .from("social_items")
    .select("program_slug, fetched_at")
    .in("program_slug", top)
    .gte("fetched_at", since)

  const fresh = new Set((data ?? []).map((r: SlugRow) => r.program_slug))
  return top.filter((slug) => !fresh.has(slug))
}

async function runBatch(slugs: string[]): Promise<{ slug: string; ok: boolean; count: number }[]> {
  const results: { slug: string; ok: boolean; count: number }[] = []
  for (let i = 0; i < slugs.length; i += CONCURRENCY) {
    const batch = slugs.slice(i, i + CONCURRENCY)
    const settled = await Promise.allSettled(batch.map((slug) => fetchSocialItems(slug)))
    for (let j = 0; j < batch.length; j++) {
      const r = settled[j]
      if (r.status === "fulfilled") {
        results.push({ slug: batch[j], ok: true, count: r.value.length })
      } else {
        results.push({ slug: batch[j], ok: false, count: 0 })
      }
    }
  }
  return results
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const stale = await pickStaleSlugs()
  if (stale.length === 0) {
    return NextResponse.json({ message: "All top programs fresh", refreshed: 0 })
  }

  const results = await runBatch(stale)
  const ok = results.filter((r) => r.ok).length
  const failed = results.length - ok

  return NextResponse.json({
    message: "Social refresh complete",
    candidates: stale.length,
    refreshed: ok,
    failed,
    results,
  })
}
