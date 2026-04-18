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

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  )
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  )
}

function RedditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
    </svg>
  )
}

function BlogIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
      <path d="M8 7h6"/>
      <path d="M8 11h8"/>
    </svg>
  )
}

const PLATFORM_ICONS: Record<string, ({ className }: { className?: string }) => React.JSX.Element> = {
  youtube: YouTubeIcon,
  tiktok: TikTokIcon,
  x: XIcon,
  reddit: RedditIcon,
  blog: BlogIcon,
}

const PLATFORM_CONFIG: Record<string, { label: string; color: string; viewLabel: string; hasMedia: boolean }> = {
  youtube: { label: "YouTube", color: "text-red-500", viewLabel: "views", hasMedia: true },
  tiktok: { label: "TikTok", color: "text-foreground", viewLabel: "plays", hasMedia: true },
  x: { label: "X", color: "text-foreground", viewLabel: "likes", hasMedia: false },
  reddit: { label: "Reddit", color: "text-orange-500", viewLabel: "upvotes", hasMedia: false },
  blog: { label: "Blog", color: "text-blue-500", viewLabel: "", hasMedia: false },
}

/** Video/media card — YouTube, TikTok */
function MediaCard({ item, isTop }: { item: SocialItem; isTop: boolean }) {
  const platform = PLATFORM_CONFIG[item.platform]
  const Icon = PLATFORM_ICONS[item.platform]
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex gap-3 rounded-lg border border-border/40 bg-card/30 p-3 transition-all hover:border-border hover:bg-card/60 relative"
    >
      {isTop && <TopBadge />}
      {item.thumbnail ? (
        <img
          src={item.thumbnail}
          alt=""
          className="h-16 w-28 rounded object-cover shrink-0 bg-muted"
          loading="lazy"
        />
      ) : (
        <div className="h-16 w-28 rounded bg-muted/50 flex items-center justify-center shrink-0">
          {Icon && <Icon className={`w-8 h-8 ${platform.color}`} />}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium line-clamp-2 text-foreground/90 group-hover:text-foreground">
          {item.title}
        </p>
        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
          <span>@{item.author}</span>
          {(item.views ?? 0) > 0 && (
            <span>{formatViews(item.views!)} {platform.viewLabel}</span>
          )}
          {item.publishedAt && <span>{timeAgo(item.publishedAt)}</span>}
        </div>
      </div>
    </a>
  )
}

/** Text card — X, Reddit, Blog (no thumbnail, compact) */
function TextCard({ item, isTop }: { item: SocialItem; isTop: boolean }) {
  const platform = PLATFORM_CONFIG[item.platform]
  const engagement = item.views ?? item.likes ?? 0
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-lg border border-border/40 bg-card/30 p-3 transition-all hover:border-border hover:bg-card/60 relative"
    >
      {isTop && <TopBadge />}
      <p className="text-xs font-medium line-clamp-2 text-foreground/90 group-hover:text-foreground">
        {item.title}
      </p>
      {item.snippet && (
        <p className="text-[10px] text-muted-foreground/60 line-clamp-1 mt-1">
          {item.snippet}
        </p>
      )}
      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
        <span>{item.platform === "blog" ? item.author : `@${item.author}`}</span>
        {engagement > 0 && platform.viewLabel && (
          <span>{formatViews(engagement)} {platform.viewLabel}</span>
        )}
        {item.publishedAt && <span>{timeAgo(item.publishedAt)}</span>}
      </div>
    </a>
  )
}

function TopBadge() {
  return (
    <span className="absolute -top-2 right-2 rounded-full bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[9px] font-medium text-amber-600 dark:text-amber-400">
      Top
    </span>
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
  const Icon = PLATFORM_ICONS[platform]
  const topScore = Math.max(...items.map((i) => i.qualityScore ?? 0))
  const CardComponent = config.hasMedia ? MediaCard : TextCard

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        {Icon && <Icon className={`w-4 h-4 ${config.color}`} />}
        <span className="text-xs font-medium text-muted-foreground">{config.label}</span>
        <span className="text-[10px] text-muted-foreground/60">({items.length})</span>
      </div>
      <div className={`grid gap-2 ${config.hasMedia ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`}>
        {items.map((item) => (
          <CardComponent
            key={item.url}
            item={item}
            isTop={(item.qualityScore ?? 0) === topScore && topScore > 0}
          />
        ))}
      </div>
    </div>
  )
}

export function SocialListen({ slug }: { slug: string }) {
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

  const grouped = new Map<string, SocialItem[]>()
  for (const item of items) {
    if (!grouped.has(item.platform)) grouped.set(item.platform, [])
    grouped.get(item.platform)!.push(item)
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-base font-semibold">Social Listen</h2>
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
          Live
        </span>
        <span className="text-[10px] text-muted-foreground ml-auto">
          Sorted by engagement × recency
        </span>
      </div>
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="space-y-4">
          {["youtube", "tiktok", "x", "reddit", "blog"].map((platform) => (
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
