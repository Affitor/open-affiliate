import Link from "next/link"
import { getNetworkStats, livePrograms, networkToSlug } from "@/lib/programs"
import { networkName } from "@/lib/network-meta"
import { buildBoard, oasScores, TEAM_DISCLOSURE } from "@/lib/oas"
import { ShareButton } from "@/components/share-button"
import { RankingsJsonLd } from "./json-ld"
import { OasLeaderboard } from "./oas-leaderboard"
import { leaderRows } from "./leaderboard/rows"
import RankingsClient from "./rankings-client"
import { commissionProps } from "./commission-props"

export const revalidate = 3600

/**
 * Sơn 19/10 12:5x: open on the scores ("vao la thay score program luon"), then categories,
 * then networks; no intro block, no counters. 13:1x: the first section is six category cards
 * ("co 6 card thoi, ai muon xem them thi bam vao full"), the full table is /rankings/leaderboard.
 * The commission table has its own page, /rankings/commission. Until OAS is published (no
 * scores), the commission view stays here.
 */
export default function RankingsPage() {
  const board = buildBoard(oasScores, livePrograms, new Date())
  const commission = commissionProps()
  if (board.length === 0) return <><RankingsJsonLd /><RankingsClient oas={null} {...commission} /></>

  const { rows, tabs } = leaderRows()
  const top = board.filter((r) => r.rank != null).slice(0, 20).map((r) => ({ slug: r.program.slug, name: r.program.name }))
  return (
    <div className="oa-frame px-4 py-10 sm:px-12">
      <RankingsJsonLd top={top} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-title md:text-display font-semibold tracking-[-0.03em]">Affiliate program rankings</h1>
        <ShareButton path="/rankings" title="Affiliate program rankings by OAS" />
      </div>
      <div className="mt-8">
        <OasLeaderboard board={board} limit={6} />
      </div>
      <Link href="/rankings/leaderboard" className="mt-8 inline-flex h-10 items-center gap-1.5 rounded-lg bg-foreground px-4 text-sm font-medium text-background hover:opacity-90 transition-opacity">
        View full leaderboard <span aria-hidden>→</span>
      </Link>

      <section aria-labelledby="cat-h" className="mt-14">
        <h2 id="cat-h" className="text-title font-semibold tracking-[-0.02em] mb-4">By category</h2>
        <ul className="grid grid-cols-2 gap-x-8 sm:grid-cols-3 lg:grid-cols-4">
          {tabs.map((t) => (
            <li key={t.slug}>
              <Link href={`/rankings/leaderboard?category=${t.slug}`} className="flex items-baseline justify-between gap-3 border-b border-border py-2.5 text-sm hover:underline underline-offset-2">
                {t.name}<span className="font-mono text-meta text-muted-foreground">{rows.filter((r) => r.categorySlug === t.slug && r.rank != null).length}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="net-h" className="mt-14">
        <h2 id="net-h" className="text-title font-semibold tracking-[-0.02em] mb-4">By network</h2>
        <ul className="grid grid-cols-2 gap-x-8 sm:grid-cols-3 lg:grid-cols-4">
          {getNetworkStats().map((n) => (
            <li key={n.network}>
              <Link href={`/networks/${networkToSlug(n.network)}`} className="flex items-baseline justify-between gap-3 border-b border-border py-2.5 text-sm hover:underline underline-offset-2">
                {networkName(n.network)}<span className="font-mono text-meta text-muted-foreground">{rows.filter((r) => r.network === networkName(n.network) && r.rank != null).length} ranked</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-meta text-muted-foreground mt-10 max-w-3xl">
        Comparing what programs pay? <Link href="/rankings/commission" className="underline underline-offset-2 hover:text-foreground">Programs by commission</Link>. How OAS works: <Link href="/methodology#oas" className="underline underline-offset-2 hover:text-foreground">Methodology</Link>. {TEAM_DISCLOSURE}
      </p>
    </div>
  )
}
