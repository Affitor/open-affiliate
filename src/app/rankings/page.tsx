import { getCategoryStats, getNetworkStats, groupRow, livePrograms } from "@/lib/programs"
import { payoutMinText } from "@/lib/rankings-terms"
import { isSameTeam } from "@/lib/same-team"
import RankingsClient, { type TermFacts } from "./rankings-client"

export const revalidate = 3600

export default function RankingsPage() {
  // Payout minimum and check date are not in the browser registry, so the
  // server sends them for the verified programs the table lists.
  // Our own programs are listed but never ranked (Sơn 18/10 09:31, "kyma unranked").
  const verified = livePrograms.filter((p) => p.verified)
  const unranked = verified.filter((p) => isSameTeam(p.slug)).map((p) => ({ slug: p.slug, name: p.name }))
  const facts: TermFacts[] = verified
    .filter((p) => !isSameTeam(p.slug))
    .map((p) => ({
      slug: p.slug,
      payoutMin: p.payout.minimum ?? null,
      payoutMinText: payoutMinText(p.payout.minimum, p.payout.currency),
      checked: (p.lastVerifiedAt ?? "").slice(0, 10),
    }))
  return (
    <RankingsClient
      facts={facts}
      unranked={unranked}
      networkRows={getNetworkStats().map((n) => groupRow(n.network, n.programCount, n))}
      categoryRows={getCategoryStats().map((c) => groupRow(c.category, c.programCount, c))}
    />
  )
}
