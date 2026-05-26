"use client"

import Link from "next/link"
import type { SiftInsights, Opportunity, CategoryInsight, PlatformInsight } from "@/lib/sift-stats"

// ── Stat Cards ──────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  href,
}: {
  label: string
  value: string | number
  sub?: string
  href?: string
}) {
  const inner = (
    <>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums mt-1">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{sub}</p>}
    </>
  )
  if (href) {
    return (
      <Link href={href} className="rounded-2xl border border-border/50 p-4 hover:border-border hover:bg-muted/20 transition-all">
        {inner}
      </Link>
    )
  }
  return <div className="rounded-2xl border border-border/50 p-4">{inner}</div>
}

// ── Opportunity Card ────────────────────────────────────────────

function OpportunityRow({ item }: { item: Opportunity }) {
  return (
    <Link
      href={`/programs/${item.slug}`}
      className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-muted/30 transition-colors group"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground group-hover:text-foreground/80 truncate">
            {item.name}
          </span>
          <span className="text-[10px] text-muted-foreground/60 shrink-0">
            {item.category}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
          {item.reason}
        </p>
      </div>
      <div className="text-right shrink-0">
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {item.commission}
        </span>
        <p className="text-[10px] text-muted-foreground">
          {item.commissionType} &middot; {item.cookieDays}d cookie
        </p>
      </div>
    </Link>
  )
}

function OpportunitySection({
  title,
  description,
  items,
}: {
  title: string
  description: string
  items: Opportunity[]
}) {
  if (items.length === 0) return null
  return (
    <section className="rounded-2xl border border-border/50 p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-[10px] text-muted-foreground/60 mb-2">{description}</p>
      <div className="divide-y divide-border/20">
        {items.map((item) => (
          <OpportunityRow key={item.slug} item={item} />
        ))}
      </div>
    </section>
  )
}

// ── Category Insights Table ─────────────────────────────────────

function CategoryInsightsTable({ data }: { data: CategoryInsight[] }) {
  return (
    <section className="rounded-2xl border border-border/50 overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <h3 className="text-sm font-semibold">Category Performance</h3>
        <p className="text-[10px] text-muted-foreground/60">Which niches produce the best affiliate content</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/30 bg-muted/20 text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">Category</th>
              <th className="px-3 py-2 text-right font-medium">Avg Score</th>
              <th className="px-3 py-2 text-right font-medium">Verified %</th>
              <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Best Format</th>
              <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Best Platform</th>
              <th className="px-3 py-2 text-right font-medium hidden lg:table-cell">Avg Commission</th>
              <th className="px-3 py-2 text-left font-medium hidden lg:table-cell">Top Program</th>
            </tr>
          </thead>
          <tbody>
            {data.map((cat) => (
              <tr key={cat.category} className="border-b border-border/10 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-2.5">
                  <Link href={`/explore?category=${encodeURIComponent(cat.category)}&sort=quality`} className="font-medium text-foreground hover:underline">
                    {cat.category}
                  </Link>
                  <span className="text-muted-foreground/50 ml-1">({cat.programCount})</span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  <span className={cat.avgSiftScore >= 5 ? "text-emerald-600 dark:text-emerald-400 font-medium" : cat.avgSiftScore >= 3 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>
                    {cat.avgSiftScore}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {cat.verifiedRate}%
                </td>
                <td className="px-3 py-2.5 hidden md:table-cell text-muted-foreground capitalize">
                  {cat.bestFormat}
                </td>
                <td className="px-3 py-2.5 hidden md:table-cell text-muted-foreground capitalize">
                  {cat.bestPlatform}
                </td>
                <td className="px-3 py-2.5 text-right hidden lg:table-cell tabular-nums font-medium">
                  {cat.avgCommission}
                </td>
                <td className="px-3 py-2.5 hidden lg:table-cell">
                  {cat.topProgram.slug ? (
                    <Link href={`/programs/${cat.topProgram.slug}`} className="text-muted-foreground hover:text-foreground transition-colors">
                      {cat.topProgram.name}
                      <span className="text-[10px] text-muted-foreground/50 ml-1">({cat.topProgram.avgScore})</span>
                    </Link>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ── Platform + Format Insights ──────────────────────────────────

function PlatformInsightsCards({ data }: { data: PlatformInsight[] }) {
  const platformEmoji: Record<string, string> = {
    youtube: "YouTube",
    tiktok: "TikTok",
    reddit: "Reddit",
    blog: "Blog",
    x: "X",
  }

  return (
    <section className="rounded-2xl border border-border/50 p-4">
      <h3 className="text-sm font-semibold">Platform Effectiveness</h3>
      <p className="text-[10px] text-muted-foreground/60 mb-3">Where to publish for best results</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {data.map((p) => (
          <Link
            key={p.platform}
            href={`/explore?platform=${p.platform}&quality=5&sort=quality`}
            className="rounded-xl border border-border/30 p-3 hover:border-border hover:bg-muted/20 transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold">{platformEmoji[p.platform] ?? p.platform}</span>
              <span className={`text-lg font-bold tabular-nums ${p.avgScore >= 5 ? "text-emerald-600 dark:text-emerald-400" : p.avgScore >= 3 ? "text-amber-600 dark:text-amber-400" : "text-red-500"}`}>
                {p.avgScore}
              </span>
            </div>
            <div className="space-y-1 text-[10px] text-muted-foreground">
              <div className="flex justify-between">
                <span>Content</span>
                <span className="tabular-nums">{p.count.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Verified rate</span>
                <span className="tabular-nums">{p.verifiedRate}%</span>
              </div>
              <div className="flex justify-between">
                <span>Best niche</span>
                <span className="truncate ml-1">{p.bestCategory}</span>
              </div>
              <div className="flex justify-between">
                <span>Top format</span>
                <span className="capitalize">{p.bestFormat}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

function FormatRanking({ data }: { data: { tag: string; avgScore: number; count: number }[] }) {
  const maxCount = Math.max(...data.map((d) => d.count))
  const TAG_COLORS: Record<string, string> = {
    review: "#10b981",
    tutorial: "#3b82f6",
    comparison: "#8b5cf6",
    "affiliate content": "#ec4899",
    related: "#f59e0b",
    tangential: "#f97316",
  }

  return (
    <section className="rounded-2xl border border-border/50 p-4">
      <h3 className="text-sm font-semibold">Content Format Effectiveness</h3>
      <p className="text-[10px] text-muted-foreground/60 mb-3">Which content types score highest</p>
      <div className="space-y-2.5">
        {data.map((item, i) => (
          <div key={item.tag} className="flex items-center gap-3">
            <span className="text-[10px] text-muted-foreground/50 w-3 tabular-nums">{i + 1}</span>
            <span className="text-xs font-medium w-28 capitalize">{item.tag}</span>
            <div className="flex-1 h-6 bg-muted/20 rounded-full overflow-hidden relative">
              <div
                className="h-full rounded-full transition-all flex items-center justify-end pr-2"
                style={{
                  width: `${Math.max((item.count / maxCount) * 100, 8)}%`,
                  backgroundColor: TAG_COLORS[item.tag] ?? "#6b7280",
                  opacity: 0.6,
                }}
              />
            </div>
            <div className="text-right shrink-0 w-20">
              <span className={`text-xs font-semibold tabular-nums ${item.avgScore >= 7 ? "text-emerald-600 dark:text-emerald-400" : item.avgScore >= 5 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                {item.avgScore}
              </span>
              <span className="text-[10px] text-muted-foreground/50 ml-1">
                ({item.count.toLocaleString()})
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Main View ───────────────────────────────────────────────────

export function SiftInsightsView({ insights }: { insights: SiftInsights }) {
  return (
    <div className="space-y-6">
      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Programs Tracked"
          value={insights.programsWithContent}
          sub={`${insights.scoredContent.toLocaleString()} content pieces scored`}
          href="/explore?quality=all&sort=quality"
        />
        <StatCard
          label="Verified Content"
          value={insights.verifiedContent.toLocaleString()}
          sub={`${Math.round((insights.verifiedContent / insights.scoredContent) * 100)}% of scored items`}
          href="/explore?quality=7&sort=quality"
        />
        <StatCard
          label="Best Platform"
          value={insights.platformInsights[0]?.platform ?? "—"}
          sub={`avg score ${insights.platformInsights[0]?.avgScore ?? 0}`}
          href={`/explore?platform=${insights.platformInsights[0]?.platform ?? ""}&sort=quality`}
        />
        <StatCard
          label="Best Format"
          value={insights.formatRanking[0]?.tag ?? "—"}
          sub={`avg score ${insights.formatRanking[0]?.avgScore ?? 0}`}
        />
      </div>

      {/* Platform + Format */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PlatformInsightsCards data={insights.platformInsights} />
        <FormatRanking data={insights.formatRanking} />
      </div>

      {/* Category insights */}
      <CategoryInsightsTable data={insights.categoryInsights} />

      {/* High value + rising */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <OpportunitySection
          title="Proven Winners"
          description="Programs with verified content AND strong commissions — replicate what works"
          items={insights.highValueVerified}
        />
        <OpportunitySection
          title="Rising Programs"
          description="Growing content coverage with high quality scores — get in early"
          items={insights.risingPrograms}
        />
      </div>
    </div>
  )
}
