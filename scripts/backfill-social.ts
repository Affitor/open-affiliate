/**
 * One-shot backfill: warm Supabase social_items for the top N programs.
 *
 * Why: after switching /programs/[slug] to ISR, build only renders 50 pages.
 * The rest render on-demand on first visit, which calls Apify and blocks the
 * user for 5-10s. Running this once seeds the DB so first-visit reads from
 * Supabase instead.
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/backfill-social.ts            # top 50, default
 *   npx tsx scripts/backfill-social.ts --top=100  # top 100
 *   npx tsx scripts/backfill-social.ts --all      # every program (expensive)
 */

import { fetchSocialItems } from "../src/lib/social"
import { programs, affiliateScore } from "../src/lib/programs"

const CONCURRENCY = 3

function parseArgs(): { top: number; all: boolean } {
  const args = process.argv.slice(2)
  const all = args.includes("--all")
  const topArg = args.find((a) => a.startsWith("--top="))
  const top = topArg ? parseInt(topArg.split("=")[1], 10) : 50
  return { top, all }
}

async function main() {
  const { top, all } = parseArgs()

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing Supabase env. Source .env.local first.")
    process.exit(1)
  }
  if (!process.env.APIFY_API_KEY && !process.env.RAPIDAPI_KEY) {
    console.error("Missing APIFY_API_KEY and RAPIDAPI_KEY. Nothing to fetch.")
    process.exit(1)
  }

  const target = all
    ? programs
    : [...programs].sort((a, b) => affiliateScore(b) - affiliateScore(a)).slice(0, top)

  console.log(`Backfilling ${target.length} programs (concurrency=${CONCURRENCY})`)

  let done = 0
  let okCount = 0
  let failCount = 0
  const start = Date.now()

  for (let i = 0; i < target.length; i += CONCURRENCY) {
    const batch = target.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(batch.map((p) => fetchSocialItems(p.slug)))
    for (let j = 0; j < batch.length; j++) {
      const r = results[j]
      done++
      if (r.status === "fulfilled") {
        okCount++
        console.log(`[${done}/${target.length}] ${batch[j].slug} → ${r.value.length} items`)
      } else {
        failCount++
        console.log(`[${done}/${target.length}] ${batch[j].slug} → FAILED: ${r.reason}`)
      }
    }
  }

  const secs = Math.round((Date.now() - start) / 1000)
  console.log(`\nDone in ${secs}s — ok: ${okCount}, failed: ${failCount}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
