"use client"

import { useEffect, useState } from "react"
import type { SocialItem } from "@/app/api/social/[slug]/route"

function formatViews(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M"
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K"
  return String(n)
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days < 1) return "today"
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

const PLATFORM_CONFIG: Record<string, { label: string; color: string; icon: string; viewLabel: string }> = {
  youtube: { label: "YouTube", color: "text-red-500", icon: "▶", viewLabel: "views" },
  tiktok: { label: "TikTok", color: "text-foreground", icon: "♪", viewLabel: "plays" },
  x: { label: "X", color: "text-foreground", icon: "𝕏", viewLabel: "likes" },
}

function SocialCard({ item, isTop }: { item: SocialItem; isTop: boolean }) {
  const platform = PLATFORM_CONFIG[item.platform] ?? PLATFORM_CONFIG.x
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex gap-3 rounded-lg border border-border/40 bg-card/30 p-3 transition-all hover:border-border hover:bg-card/60 relative"
    >
      {isTop && (
        <span className="absolute -top-2 right-2 rounded-full bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[9px] font-medium text-amber-600 dark:text-amber-400">
          Top
        </span>
      )}
      {item.thumbnail ? (
        <img
          src={item.thumbnail}
          alt=""
          className="h-16 w-28 rounded object-cover shrink-0 bg-muted"
          loading="lazy"
        />
      ) : (
        <div className="h-16 w-28 rounded bg-muted/50 flex items-center justify-center shrink-0">
          <span className={`text-2xl ${platform.color}`}>{platform.icon}</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium line-clamp-2 text-foreground/90 group-hover:text-foreground">
          {item.title}
        </p>
        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
          <span>@{item.author}</span>
          {item.views != null && item.views > 0 && (
            <span>{formatViews(item.views)} {platform.viewLabel}</span>
          )}
          {item.publishedAt && <span>{timeAgo(item.publishedAt)}</span>}
        </div>
      </div>
    </a>
  )
}

function SkeletonCard() {
  return (
    <div className="flex gap-3 rounded-lg border border-border/40 bg-card/30 p-3 animate-pulse">
      <div className="h-16 w-28 rounded bg-muted/50 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-full rounded bg-muted/50" />
        <div className="h-3 w-3/4 rounded bg-muted/50" />
        <div className="h-2.5 w-24 rounded bg-muted/50" />
      </div>
    </div>
  )
}

function PlatformSection({ platform, items }: { platform: string; items: SocialItem[] }) {
  if (items.length === 0) return null
  const config = PLATFORM_CONFIG[platform] ?? PLATFORM_CONFIG.x
  const topScore = Math.max(...items.map((i) => i.qualityScore ?? 0))

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`text-sm ${config.color}`}>{config.icon}</span>
        <span className="text-xs font-medium text-muted-foreground">{config.label}</span>
        <span className="text-[10px] text-muted-foreground/60">({items.length})</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {items.map((item) => (
          <SocialCard
            key={item.url}
            item={item}
            isTop={(item.qualityScore ?? 0) === topScore && topScore > 0}
          />
        ))}
      </div>
    </div>
  )
}

export function SocialBuzz({ slug }: { slug: string }) {
  const [items, setItems] = useState<SocialItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/social/${slug}`)
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data) => {
        if (!cancelled) setItems(data.items ?? [])
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [slug])

  if (!loading && items.length === 0) return null

  // Group items by platform (already sorted by platform from API)
  const grouped = new Map<string, SocialItem[]>()
  for (const item of items) {
    if (!grouped.has(item.platform)) grouped.set(item.platform, [])
    grouped.get(item.platform)!.push(item)
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-base font-semibold">Social Buzz</h2>
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
          Live
        </span>
        <span className="text-[10px] text-muted-foreground ml-auto">
          Sorted by engagement × recency
        </span>
      </div>
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="space-y-4">
          {["youtube", "tiktok", "x"].map((platform) => (
            <PlatformSection
              key={platform}
              platform={platform}
              items={grouped.get(platform) ?? []}
            />
          ))}
        </div>
      )}
    </div>
  )
}
