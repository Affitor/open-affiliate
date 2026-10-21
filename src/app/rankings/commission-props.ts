import { getCategoryStats, getNetworkStats, groupRow, livePrograms } from "@/lib/programs"
import { payoutMinText } from "@/lib/rankings-terms"
import type { TermFacts } from "./rankings-client"

/**
 * What the commission table needs from the server: payout minimum and check date are not in
 * the browser registry, so the server sends them for the verified programs it lists.
 */
export function commissionProps() {
  const facts: TermFacts[] = livePrograms
    .filter((p) => p.verified)
    .map((p) => ({
      slug: p.slug,
      payoutMin: p.payout.minimum ?? null,
      payoutMinText: payoutMinText(p.payout.minimum, p.payout.currency),
      checked: (p.lastVerifiedAt ?? "").slice(0, 10),
    }))
  return {
    facts,
    networkRows: getNetworkStats().map((n) => groupRow(n.network, n.programCount, n)),
    categoryRows: getCategoryStats().map((c) => groupRow(c.category, c.programCount, c)),
  }
}
