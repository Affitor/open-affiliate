import { getCategoryStats, getNetworkStats, groupRow, livePrograms } from "@/lib/programs"
import { payoutMinText } from "@/lib/rankings-terms"
import { buildBoard, oasScores } from "@/lib/oas"
import { OasLeaderboard } from "./oas-leaderboard"
import RankingsClient, { type TermFacts } from "./rankings-client"

export const revalidate = 3600

export default function RankingsPage() {
  // Payout minimum and check date are not in the browser registry, so the
  // server sends them for the verified programs the table lists.
  const facts: TermFacts[] = livePrograms
    .filter((p) => p.verified)
    .map((p) => ({
      slug: p.slug,
      payoutMin: p.payout.minimum ?? null,
      payoutMinText: payoutMinText(p.payout.minimum, p.payout.currency),
      checked: (p.lastVerifiedAt ?? "").slice(0, 10),
    }))
  const board = buildBoard(oasScores, livePrograms, new Date())
  return (
    <RankingsClient
      oas={board.length > 0 ? <OasLeaderboard board={board} /> : null}
      facts={facts}
      networkRows={getNetworkStats().map((n) => groupRow(n.network, n.programCount, n))}
      categoryRows={getCategoryStats().map((c) => groupRow(c.category, c.programCount, c))}
    />
  )
}
