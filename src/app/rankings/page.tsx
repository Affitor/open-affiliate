import { getCachedSiftRankings } from "@/lib/sift-rankings"
import { getCategoryStats, getNetworkStats, groupRow } from "@/lib/programs"
import RankingsClient from "./rankings-client"

export const revalidate = 3600

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
