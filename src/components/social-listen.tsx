import type { SocialItem } from "@/lib/social"

function formatViews(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M"
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K"
  return String(n)
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" })
  } catch {
    return ""
  }
}

const PLATFORM_CONFIG: Record<string, { label: string; color: string; icon: string; viewLabel: string; hasMedia: boolean }> = {
  youtube: { label: "YouTube", color: "text-red-500", icon: "▶", viewLabel: "views", hasMedia: true },
  tiktok: { label: "TikTok", color: "text-foreground", icon: "♪", viewLabel: "plays", hasMedia: true },
  x: { label: "X", color: "text-foreground", icon: "𝕏", viewLabel: "likes", hasMedia: false },
  reddit: { label: "Reddit", color: "text-orange-500", icon: "⬆", viewLabel: "upvotes", hasMedia: false },
  blog: { label: "Blog", color: "text-blue-500", icon: "✎", viewLabel: "", hasMedia: false },
}

/** Video/media card — YouTube, TikTok */
function MediaCard({ item, isTop }: { item: SocialItem; isTop: boolean }) {
  const platform = PLATFORM_CONFIG[item.platform]
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
          <span className={`text-2xl ${platform.color}`}>{platform.icon}</span>
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
          {item.publishedAt && <span>{formatDate(item.publishedAt)}</span>}
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
        {item.publishedAt && <span>{formatDate(item.publishedAt)}</span>}
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

function PlatformSection({ platform, items }: { platform: string; items: SocialItem[] }) {
  if (items.length === 0) return null
  const config = PLATFORM_CONFIG[platform] ?? PLATFORM_CONFIG.x
  const topScore = Math.max(...items.map((i) => i.qualityScore ?? 0))
  const CardComponent = config.hasMedia ? MediaCard : TextCard

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`text-sm ${config.color}`}>{config.icon}</span>
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

export function SocialListen({ items }: { items?: SocialItem[] }) {
  if (!items || items.length === 0) return null

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
      <div className="space-y-4">
        {["youtube", "tiktok", "x", "reddit", "blog"].map((platform) => (
          <PlatformSection
            key={platform}
            platform={platform}
            items={grouped.get(platform) ?? []}
          />
        ))}
      </div>
    </div>
  )
}
