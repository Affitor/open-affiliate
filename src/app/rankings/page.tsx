import { getCachedSiftRankings } from "@/lib/sift-rankings"
import { formatCommissionDisplay, getCategoryStats, getNetworkStats, type CommissionStats, type PaidBy } from "@/lib/programs"
import RankingsClient, { type GroupRow } from "./rankings-client"

export const revalidate = 3600

/**
 * Network and category figures are computed here, from structured fields
 * (commissionStats), and sent as display strings: the browser's copy of the
 * registry carries no `kind`, so it could not leave out referral rewards.
 */
function groupRow(name: string, programCount: number, s: CommissionStats): GroupRow {
  const paid = (x: PaidBy | null, flat: boolean) =>
    x ? { display: formatCommissionDisplay(x.value, flat), slug: x.program.slug, name: x.program.name } : null
  return {
    name,
    programCount,
    avgRate: s.avgRate != null ? `${s.avgRate.toFixed(1)}%` : "—",
    topRate: paid(s.topRate, false),
    topFlatUsd: paid(s.topFlatUsd, true),
  }
}

export default async function RankingsPage() {
  const initialContent = await getCachedSiftRankings()
  return (
    <RankingsClient
      initialContent={initialContent}
      networkRows={getNetworkStats().map((n) => groupRow(n.network, n.programCount, n))}
      categoryRows={getCategoryStats().map((c) => groupRow(c.category, c.programCount, c))}
    />
  )
}
