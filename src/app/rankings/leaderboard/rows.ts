import { categories, categoryToSlug, IN_HOUSE, livePrograms } from "@/lib/programs"
import { networkName } from "@/lib/network-meta"
import { buildBoard, oasScores } from "@/lib/oas"
import { domainOf } from "@/lib/score-index"
import type { LeaderRow } from "./leaderboard-table"

/** The OAS board as table rows, and the category tabs that have rows. Server only. */
export function leaderRows(): { rows: LeaderRow[]; tabs: { name: string; slug: string }[] } {
  const board = buildBoard(oasScores, livePrograms, new Date())
  const bySlug = new Map(livePrograms.map((p) => [p.slug, p]))
  const rows: LeaderRow[] = board.map((r) => {
    const p = bySlug.get(r.program.slug)!
    return {
      slug: p.slug,
      name: p.name,
      domain: domainOf(p.url),
      category: p.category,
      categorySlug: categoryToSlug(p.category),
      network: networkName(p.network ?? IN_HOUSE),
      oas: r.oas,
      rank: r.rank,
      status: r.unranked,
      checked: (p.lastVerifiedAt ?? "").slice(0, 10),
    }
  })
  const tabs = categories.filter((c) => rows.some((r) => r.category === c)).map((c) => ({ name: c, slug: categoryToSlug(c) }))
  return { rows, tabs }
}
