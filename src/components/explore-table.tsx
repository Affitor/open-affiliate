import Link from "next/link";
import { ExternalLink, Play, FileText, MessageCircle } from "lucide-react";
import { ProgramLogo } from "@/components/program-logo";
import { ExploreThumbnail } from "@/components/explore-thumbnail";
import type { ExploreItem } from "@/lib/social-explore";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "today";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function PlatformBadge({ platform }: { platform: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    youtube: { bg: "bg-red-500/10", text: "text-red-500", label: "YouTube" },
    tiktok: { bg: "bg-gray-500/10", text: "text-foreground", label: "TikTok" },
    x: { bg: "bg-blue-500/10", text: "text-blue-500", label: "X" },
    reddit: { bg: "bg-orange-500/10", text: "text-orange-500", label: "Reddit" },
    blog: { bg: "bg-emerald-500/10", text: "text-emerald-500", label: "Blog" },
  };
  const c = config[platform] ?? config.blog;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${c.bg} ${c.text}`}
    >
      {platform === "youtube" && <Play className="h-2.5 w-2.5" />}
      {platform === "blog" && <FileText className="h-2.5 w-2.5" />}
      {platform === "reddit" && <MessageCircle className="h-2.5 w-2.5" />}
      {c.label}
    </span>
  );
}

interface ExploreTableProps {
  items: ExploreItem[];
}

export function ExploreTable({ items }: ExploreTableProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm text-muted-foreground">
          No content found. Try adjusting your filters.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/40 text-xs text-muted-foreground">
            <th className="py-3 pr-4 text-left font-medium">Content</th>
            <th className="py-3 px-3 text-left font-medium hidden md:table-cell">
              Program
            </th>
            <th className="py-3 px-3 text-right font-medium">Views</th>
            <th className="py-3 px-3 text-right font-medium">
              Score
            </th>
            <th className="py-3 pl-3 text-left font-medium hidden md:table-cell">
              Tag
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className="border-b border-border/20 hover:bg-muted/30 transition-colors"
            >
              {/* Content: thumbnail + title + author + date */}
              <td className="py-3 pr-4">
                <div className="flex items-start gap-3">
                  {/* Thumbnail */}
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 hidden sm:block"
                  >
                    <ExploreThumbnail
                      src={item.thumbnail}
                      placeholder={<PlatformBadge platform={item.platform} />}
                    />
                  </a>
                  <div className="min-w-0 flex-1">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-foreground hover:text-foreground/80 line-clamp-2 leading-snug"
                    >
                      {item.title}
                      <ExternalLink className="inline-block ml-1 h-3 w-3 text-muted-foreground/50" />
                    </a>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <PlatformBadge platform={item.platform} />
                      <span className="truncate max-w-[120px]">
                        {item.author}
                      </span>
                      {item.published_at && (
                        <span>{timeAgo(item.published_at)}</span>
                      )}
                    </div>
                  </div>
                </div>
              </td>

              {/* Program */}
              <td className="py-3 px-3 hidden md:table-cell">
                <Link
                  href={`/programs/${item.program_slug}`}
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                >
                  <ProgramLogo slug={item.program_slug} name={item.program_slug} size={20} />
                  <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                    {item.program_slug.replace(/-/g, " ")}
                  </span>
                </Link>
              </td>

              {/* Views */}
              <td className="py-3 px-3 text-right tabular-nums text-sm font-medium">
                {formatNumber(item.views)}
              </td>

              {/* SIFT Score */}
              <td className="py-3 px-3 text-right">
                {item.sift_score != null ? (
                  <span
                    className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${
                      item.sift_score >= 7
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : item.sift_score >= 5
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          : item.sift_score >= 3
                            ? "bg-orange-500/10 text-orange-600 dark:text-orange-400"
                            : "bg-red-500/10 text-red-500"
                    }`}
                  >
                    {item.sift_score}
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground/40">—</span>
                )}
              </td>

              {/* SIFT Tag */}
              <td className="py-3 pl-3 hidden md:table-cell">
                {item.sift_tag ? (
                  <span className="text-[10px] text-muted-foreground">
                    {item.sift_tag.replace(/_/g, " ")}
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
