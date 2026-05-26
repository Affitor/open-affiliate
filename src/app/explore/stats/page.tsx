import { Suspense } from "react"
import { connection } from "next/server"
import type { Metadata } from "next"
import Link from "next/link"
import { fetchSiftInsights } from "@/lib/sift-stats"
import { SiftInsightsView } from "@/components/sift-charts"

export const metadata: Metadata = {
  title: "Content Insights — OpenAffiliate",
  description:
    "Find affiliate opportunities: high-commission programs with low content competition, best platforms and formats, category performance.",
}

function InsightsShell() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <div className="h-6 w-48 bg-muted/30 rounded animate-pulse" />
        <div className="h-4 w-96 bg-muted/30 rounded animate-pulse mt-2" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-muted/30 animate-pulse" />
        ))}
      </div>
      <div className="h-96 rounded-2xl bg-muted/30 animate-pulse mt-6" />
    </main>
  )
}

async function InsightsContent() {
  await connection()
  const insights = await fetchSiftInsights()

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Content Insights
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Find opportunities: programs with high commissions but low content competition.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/explore"
            className="rounded-lg border border-border/50 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-colors"
          >
            Explore
          </Link>
          <Link
            href="/docs/sift-scoring"
            className="rounded-lg border border-border/50 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-colors"
          >
            How SIFT Works
          </Link>
        </div>
      </div>

      <SiftInsightsView insights={insights} />

      <p className="text-[10px] text-muted-foreground/40 mt-8 text-center">
        Insights powered by SIFT scoring across {insights.scoredContent.toLocaleString()} content items.{" "}
        <Link href="/docs/sift-scoring" className="underline hover:text-muted-foreground">
          Learn more
        </Link>
      </p>
    </main>
  )
}

export default function InsightsPage() {
  return (
    <Suspense fallback={<InsightsShell />}>
      <InsightsContent />
    </Suspense>
  )
}
