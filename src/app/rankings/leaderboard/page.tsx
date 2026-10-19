import type { Metadata } from "next"
import { Suspense } from "react"
import { notFound } from "next/navigation"
import { LeaderboardTable } from "./leaderboard-table"
import { leaderRows } from "./rows"
import { livePrograms } from "@/lib/programs"
import { buildBoard, oasScores } from "@/lib/oas"
import { scoreIndex } from "@/lib/score-index"
import { ScoreYourProgram } from "@/components/score-your-program"
import { ShareButton } from "@/components/share-button"

export const revalidate = 3600

export const metadata: Metadata = {
  title: "OAS Leaderboard: Every Affiliate Program by OpenAffiliate Score",
  description:
    "Every scored affiliate program ranked by OAS, the OpenAffiliate Score: how clearly a program publishes its terms and protects its partners. Filter by category.",
  openGraph: {
    title: "OAS Leaderboard: OpenAffiliate",
    description: "Every scored affiliate program ranked by OAS, by category.",
    url: "https://openaffiliate.dev/rankings/leaderboard",
    siteName: "OpenAffiliate",
  },
  alternates: {
    canonical: "/rankings/leaderboard",
    types: { "text/markdown": "https://openaffiliate.dev/rankings/leaderboard.md" },
  },
}

export default function LeaderboardPage() {
  const { rows, tabs } = leaderRows()
  if (rows.length === 0) notFound()

  return (
    <div className="oa-frame px-4 py-10 sm:px-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-title md:text-display font-semibold tracking-[-0.03em]">OAS leaderboard</h1>
        <ShareButton path="/rankings/leaderboard" title="OAS leaderboard" />
      </div>
      {/* One input on the page (Sơn: one search): Score your program, as is-agentic's. */}
      <ScoreYourProgram index={scoreIndex(livePrograms, buildBoard(oasScores, livePrograms, new Date()))} compact className="mt-5 max-w-xl" />
      <Suspense>
        <LeaderboardTable rows={rows} tabs={tabs} search={false} />
      </Suspense>
    </div>
  )
}
