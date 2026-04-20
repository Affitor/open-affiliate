"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import Link from "next/link";
import {
  Trophy,
  Medal,
  Award,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  ExternalLink,
  Search,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProgramLogo } from "@/components/program-logo";
import { FilterSelect } from "@/components/filter-select";
import { track } from "@/lib/track";
import {
  programs,
  categories,
  commissionTypes,
  categoryCounts,
  parseCommissionRate,
  getCategoryStats,
  getNetworkStats,
  type Program,
  commissionLabel,
  affiliateScore,
} from "@/lib/programs";

type Tab = "programs" | "networks" | "categories";

const COMMISSION_TYPE_LABELS: Record<string, string> = {
  recurring: "Recurring",
  "one-time": "One-time",
  tiered: "Tiered",
  hybrid: "Hybrid",
};

const PLATFORM_OPTIONS = [
  { value: "", label: "All Platforms" },
  { value: "youtube", label: "YouTube" },
  { value: "tiktok", label: "TikTok" },
  { value: "reddit", label: "Reddit" },
  { value: "blog", label: "Blog" },
];

const FORMAT_OPTIONS = [
  { value: "", label: "All Formats" },
  { value: "review", label: "Review" },
  { value: "tutorial", label: "Tutorial" },
  { value: "comparison", label: "Comparison" },
  { value: "affiliate_content", label: "Affiliate Content" },
  { value: "related", label: "Related" },
];

// ── Content data from API ───────────────────────────────────────

interface ContentData {
  slug: string;
  verifiedContent: number;
  totalContent: number;
  avgSiftScore: number;
  topTag: string;
  topPlatform: string;
}

function useContentData() {
  const [data, setData] = useState<Map<string, ContentData>>(new Map());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/sift-rankings")
      .then((r) => r.json())
      .then((items: ContentData[]) => {
        const map = new Map<string, ContentData>();
        for (const item of items) {
          map.set(item.slug, item);
        }
        setData(map);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  return { data, loaded };
}

// ── Shared components ───────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/15 text-amber-500 text-xs font-bold">
        1
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-400/15 text-zinc-400 text-xs font-bold">
        2
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-500/15 text-orange-500 text-xs font-bold">
        3
      </span>
    );
  }
  return (
    <span className="flex h-7 w-7 items-center justify-center text-xs text-muted-foreground font-medium">
      {rank}
    </span>
  );
}

function TopThreeCards({ top3 }: { top3: Program[] }) {
  const medals = [
    {
      icon: Trophy,
      border: "border-amber-500/30",
      bg: "bg-amber-500/5",
      text: "text-amber-500",
      label: "1st",
    },
    {
      icon: Medal,
      border: "border-zinc-400/30",
      bg: "bg-zinc-400/5",
      text: "text-zinc-400",
      label: "2nd",
    },
    {
      icon: Award,
      border: "border-orange-500/30",
      bg: "bg-orange-500/5",
      text: "text-orange-500",
      label: "3rd",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      {top3.map((program, i) => {
        const m = medals[i];
        return (
          <Link
            key={program.slug}
            href={`/programs/${program.slug}`}
            className={`group relative rounded-xl border ${m.border} ${m.bg} p-5 transition-all hover:shadow-lg hover:scale-[1.01]`}
          >
            <div className="flex items-center gap-2 mb-3">
              <m.icon className={`h-4 w-4 ${m.text}`} />
              <span className={`text-xs font-semibold ${m.text}`}>
                {m.label}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <ProgramLogo
                slug={program.slug}
                name={program.name}
                size={40}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold truncate">
                    {program.name}
                  </h3>
                  {program.verified && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 border-emerald-600/30 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 shrink-0"
                    >
                      verified
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {program.shortDescription}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <Badge className="text-[11px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                {program.commission.rate}{" "}
                {commissionLabel(program.commission)}
              </Badge>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// ── Sort header ─────────────────────────────────────────────────

type ColumnSort = "commission" | "verified" | "avg" | "total" | "name";
type SortDir = "asc" | "desc";

function SortHeader({
  label,
  column,
  activeColumn,
  activeDir,
  onSort,
  className,
}: {
  label: string;
  column: ColumnSort;
  activeColumn: ColumnSort;
  activeDir: SortDir;
  onSort: (col: ColumnSort) => void;
  className?: string;
}) {
  const isActive = activeColumn === column;
  return (
    <th
      className={`py-3 px-3 text-[11px] font-medium uppercase tracking-wide cursor-pointer select-none transition-colors hover:text-foreground ${
        isActive ? "text-foreground" : "text-muted-foreground"
      } ${className ?? ""}`}
      onClick={() => onSort(column)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          activeDir === "desc" ? (
            <ArrowDown className="h-3 w-3" />
          ) : (
            <ArrowUp className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-2.5 w-2.5 opacity-30" />
        )}
      </span>
    </th>
  );
}

// ── Merged Programs Table ───────────────────────────────────────

interface MergedProgram {
  program: Program;
  verifiedContent: number;
  totalContent: number;
  avgSiftScore: number;
  topTag: string;
  topPlatform: string;
}

function ProgramsTable({
  items,
  contentLoaded,
}: {
  items: MergedProgram[];
  contentLoaded: boolean;
}) {
  const [sortCol, setSortCol] = useState<ColumnSort>("verified");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = useCallback(
    (col: ColumnSort) => {
      if (sortCol === col) {
        setSortDir((d) => (d === "desc" ? "asc" : "desc"));
      } else {
        setSortCol(col);
        setSortDir(col === "name" ? "asc" : "desc");
      }
    },
    [sortCol]
  );

  const sorted = useMemo(() => {
    const list = [...items];
    const dir = sortDir === "desc" ? -1 : 1;
    list.sort((a, b) => {
      switch (sortCol) {
        case "commission":
          return (
            parseCommissionRate(a.program.commission.rate) -
            parseCommissionRate(b.program.commission.rate)
          ) * dir;
        case "verified":
          return (a.verifiedContent - b.verifiedContent) * dir;
        case "avg":
          return (a.avgSiftScore - b.avgSiftScore) * dir;
        case "total":
          return (a.totalContent - b.totalContent) * dir;
        case "name":
          return a.program.name.localeCompare(b.program.name) * dir;
        default:
          return 0;
      }
    });
    return list;
  }, [items, sortCol, sortDir]);

  return (
    <div className="rounded-xl border border-border/40 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border/20 bg-muted/10">
        <p className="text-[10px] text-muted-foreground/70">
          Content data from AI-scored reviews, tutorials, and affiliate posts across YouTube, TikTok, Reddit, and blogs.{" "}
          <Link href="/docs/sift-scoring" className="underline hover:text-foreground">How scoring works</Link>
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 bg-muted/30">
              <th className="w-10 py-3 px-3 text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                #
              </th>
              <SortHeader
                label="Program"
                column="name"
                activeColumn={sortCol}
                activeDir={sortDir}
                onSort={handleSort}
                className="text-left"
              />
              <SortHeader
                label="Commission"
                column="commission"
                activeColumn={sortCol}
                activeDir={sortDir}
                onSort={handleSort}
                className="hidden sm:table-cell"
              />
              <SortHeader
                label="Reviews"
                column="verified"
                activeColumn={sortCol}
                activeDir={sortDir}
                onSort={handleSort}
                className="text-center"
              />
              <SortHeader
                label="Quality"
                column="avg"
                activeColumn={sortCol}
                activeDir={sortDir}
                onSort={handleSort}
                className="text-center hidden sm:table-cell"
              />
              <SortHeader
                label="Posts"
                column="total"
                activeColumn={sortCol}
                activeDir={sortDir}
                onSort={handleSort}
                className="text-center hidden sm:table-cell"
              />
              <th className="py-3 px-3 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wide hidden md:table-cell">
                Format
              </th>
              <th className="py-3 px-3 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wide hidden md:table-cell">
                Platform
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item, i) => {
              const p = item.program;
              const hasContent = item.totalContent > 0;
              return (
                <tr
                  key={p.slug}
                  className="border-t border-border/20 hover:bg-muted/20 transition-colors group"
                >
                  <td className="py-3 px-3 text-center">
                    <RankBadge rank={i + 1} />
                  </td>
                  <td className="py-3 px-3">
                    <Link
                      href={`/programs/${p.slug}`}
                      className="flex items-center gap-3"
                    >
                      <ProgramLogo
                        slug={p.slug}
                        name={p.name}
                        size={32}
                        className="shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                            {p.name}
                          </span>
                          {p.verified && (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {p.category}
                          <span className="mx-1 text-border">&middot;</span>
                          {COMMISSION_TYPE_LABELS[p.commission.type] ??
                            p.commission.type}
                        </span>
                      </div>
                    </Link>
                  </td>
                  <td className="py-3 px-3 hidden sm:table-cell">
                    <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 line-clamp-2">
                      {p.commission.rate}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    {contentLoaded ? (
                      <span
                        className={`text-sm font-semibold tabular-nums ${
                          item.verifiedContent >= 10
                            ? "text-emerald-600 dark:text-emerald-400"
                            : item.verifiedContent >= 3
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-muted-foreground"
                        }`}
                      >
                        {hasContent ? item.verifiedContent : "—"}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/30">...</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center hidden sm:table-cell">
                    {contentLoaded && hasContent ? (
                      <span
                        className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${
                          item.avgSiftScore >= 7
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : item.avgSiftScore >= 5
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              : item.avgSiftScore >= 3
                                ? "bg-orange-500/10 text-orange-600 dark:text-orange-400"
                                : "bg-red-500/10 text-red-500"
                        }`}
                      >
                        {item.avgSiftScore}
                      </span>
                    ) : contentLoaded ? (
                      <span className="text-[10px] text-muted-foreground/30">—</span>
                    ) : (
                      <span className="text-xs text-muted-foreground/30">...</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center hidden sm:table-cell">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {hasContent ? item.totalContent : "—"}
                    </span>
                  </td>
                  <td className="py-3 px-3 hidden md:table-cell">
                    <span className="text-xs text-muted-foreground capitalize">
                      {hasContent
                        ? item.topTag.replace(/_/g, " ")
                        : "—"}
                    </span>
                  </td>
                  <td className="py-3 px-3 hidden md:table-cell">
                    <span className="text-xs text-muted-foreground capitalize">
                      {hasContent ? item.topPlatform : "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sorted.length === 0 && (
        <div className="text-center py-12">
          <p className="text-sm text-muted-foreground">
            No programs match your filters.
          </p>
        </div>
      )}
      <div className="px-4 py-3 border-t border-border/20 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground/60">
          {sorted.length} programs
        </span>
        <Link
          href="/explore"
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
        >
          Explore all content <ExternalLink className="h-2.5 w-2.5" />
        </Link>
      </div>
    </div>
  );
}

// ── Networks Table ──────────────────────────────────────────────

function formatNetworkName(name: string): string {
  if (!name || name === "In-house") return "In-house";
  return name
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function NetworksTable() {
  const stats = useMemo(() => getNetworkStats(), []);

  return (
    <div className="rounded-xl border border-border/40 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 bg-muted/30">
              <th className="w-12 py-3 px-3 text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                #
              </th>
              <th className="py-3 px-3 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Network
              </th>
              <th className="w-24 py-3 px-3 text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Programs
              </th>
              <th className="w-28 py-3 px-3 text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">
                Avg Commission
              </th>
              <th className="w-28 py-3 px-3 text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">
                Best
              </th>
              <th className="py-3 px-3 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wide hidden md:table-cell">
                Top Program
              </th>
            </tr>
          </thead>
          <tbody>
            {stats.map((row, i) => (
              <tr
                key={row.network}
                className="border-t border-border/20 hover:bg-muted/20 transition-colors cursor-pointer group"
                onClick={() =>
                  (window.location.href = `/programs?network=${encodeURIComponent(row.network)}`)
                }
              >
                <td className="py-3 px-3 text-center">
                  <RankBadge rank={i + 1} />
                </td>
                <td className="py-3 px-3">
                  <span className="text-sm font-medium group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                    {formatNetworkName(row.network)}
                  </span>
                </td>
                <td className="py-3 px-3 text-center">
                  <span className="text-sm tabular-nums">
                    {row.programCount}
                  </span>
                </td>
                <td className="py-3 px-3 text-center hidden sm:table-cell">
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {row.avgCommission > 0
                      ? `${row.avgCommission.toFixed(1)}%`
                      : "—"}
                  </span>
                </td>
                <td className="py-3 px-3 text-center hidden sm:table-cell">
                  <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {row.bestCommissionDisplay}
                  </span>
                </td>
                <td className="py-3 px-3 hidden md:table-cell">
                  <Link
                    href={`/programs/${row.topProgram.slug}`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-2 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                  >
                    <ProgramLogo
                      slug={row.topProgram.slug}
                      name={row.topProgram.name}
                      size={24}
                    />
                    <span className="text-xs font-medium truncate">
                      {row.topProgram.name}
                    </span>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Categories Table ────────────────────────────────────────────

function CategoriesTable() {
  const stats = useMemo(() => getCategoryStats(), []);

  return (
    <div className="rounded-xl border border-border/40 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 bg-muted/30">
              <th className="w-12 py-3 px-3 text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                #
              </th>
              <th className="py-3 px-3 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Category
              </th>
              <th className="w-24 py-3 px-3 text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Programs
              </th>
              <th className="w-28 py-3 px-3 text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">
                Avg Commission
              </th>
              <th className="w-28 py-3 px-3 text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">
                Highest
              </th>
              <th className="py-3 px-3 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wide hidden md:table-cell">
                Top Program
              </th>
            </tr>
          </thead>
          <tbody>
            {stats.map((row, i) => (
              <tr
                key={row.category}
                className="border-t border-border/20 hover:bg-muted/20 transition-colors"
              >
                <td className="py-3 px-3 text-center">
                  <RankBadge rank={i + 1} />
                </td>
                <td className="py-3 px-3">
                  <Link
                    href={`/programs?category=${encodeURIComponent(row.category)}`}
                    className="text-sm font-medium hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                  >
                    {row.category}
                  </Link>
                </td>
                <td className="py-3 px-3 text-center">
                  <span className="text-sm tabular-nums">
                    {row.programCount}
                  </span>
                </td>
                <td className="py-3 px-3 text-center hidden sm:table-cell">
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {row.avgCommission > 0
                      ? `${row.avgCommission.toFixed(1)}%`
                      : "—"}
                  </span>
                </td>
                <td className="py-3 px-3 text-center hidden sm:table-cell">
                  <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {row.highestCommissionDisplay}
                  </span>
                </td>
                <td className="py-3 px-3 hidden md:table-cell">
                  <Link
                    href={`/programs/${row.topProgram.slug}`}
                    className="flex items-center gap-2 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                  >
                    <ProgramLogo
                      slug={row.topProgram.slug}
                      name={row.topProgram.name}
                      size={24}
                    />
                    <span className="text-xs font-medium truncate">
                      {row.topProgram.name}
                    </span>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────

export default function RankingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("programs");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState("");
  const [selectedFormat, setSelectedFormat] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [hasContentOnly, setHasContentOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: contentData, loaded: contentLoaded } = useContentData();

  useEffect(() => {
    track("page_view");
  }, []);

  const top3 = useMemo(() => {
    return [...programs]
      .sort((a, b) => affiliateScore(b) - affiliateScore(a))
      .slice(0, 3);
  }, []);

  const mergedPrograms: MergedProgram[] = useMemo(() => {
    return programs.map((p) => {
      const content = contentData.get(p.slug);
      return {
        program: p,
        verifiedContent: content?.verifiedContent ?? 0,
        totalContent: content?.totalContent ?? 0,
        avgSiftScore: content?.avgSiftScore ?? 0,
        topTag: content?.topTag ?? "",
        topPlatform: content?.topPlatform ?? "",
      };
    });
  }, [contentData]);

  const filteredPrograms = useMemo(() => {
    let result = mergedPrograms;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (m) =>
          m.program.name.toLowerCase().includes(q) ||
          m.program.category.toLowerCase().includes(q) ||
          m.program.tags.some((t) => t.includes(q))
      );
    }
    if (selectedCategory) {
      result = result.filter((m) => m.program.category === selectedCategory);
    }
    if (selectedType) {
      result = result.filter(
        (m) => m.program.commission.type === selectedType
      );
    }
    if (verifiedOnly) {
      result = result.filter((m) => m.program.verified);
    }
    if (hasContentOnly) {
      result = result.filter((m) => m.totalContent >= 3);
    }
    if (selectedPlatform) {
      result = result.filter((m) => m.topPlatform === selectedPlatform);
    }
    if (selectedFormat) {
      result = result.filter((m) => m.topTag === selectedFormat);
    }

    return result;
  }, [
    mergedPrograms,
    searchQuery,
    selectedCategory,
    selectedType,
    verifiedOnly,
    hasContentOnly,
    selectedPlatform,
    selectedFormat,
  ]);

  const hasFilters =
    selectedCategory ||
    selectedType ||
    selectedPlatform ||
    selectedFormat ||
    verifiedOnly ||
    hasContentOnly ||
    searchQuery;

  const clearFilters = () => {
    setSelectedCategory("");
    setSelectedType("");
    setSelectedPlatform("");
    setSelectedFormat("");
    setVerifiedOnly(false);
    setHasContentOnly(false);
    setSearchQuery("");
  };

  const categoryOptions = [
    { value: "", label: "All Categories" },
    ...categories.map((cat) => ({
      value: cat,
      label: cat,
      count: categoryCounts[cat] ?? 0,
    })),
  ];

  const typeOptions = [
    { value: "", label: "All Types" },
    ...commissionTypes.map((t) => ({
      value: t,
      label: COMMISSION_TYPE_LABELS[t] ?? t,
    })),
  ];

  const tabs: { value: Tab; label: string; count: number }[] = [
    { value: "programs", label: "Programs", count: programs.length },
    { value: "networks", label: "Networks", count: getNetworkStats().length },
    { value: "categories", label: "Categories", count: categories.length },
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <ArrowUpDown className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          <h1 className="text-2xl font-bold tracking-tight">
            Affiliate Program Rankings
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {programs.length} programs ranked by content performance and
          commission across {categories.length} categories
        </p>
      </div>

      {/* Top 3 */}
      <TopThreeCards top3={top3} />

      {/* Tab bar */}
      <div className="flex items-center gap-1 rounded-lg border border-border/50 bg-muted/20 p-1 mb-6 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            <span className="ml-1.5 text-[10px] text-muted-foreground/60">
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Filters (Programs tab only) */}
      {activeTab === "programs" && (
        <div className="space-y-3 mb-4">
          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search programs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-border/50 bg-card/50 pl-9 pr-8 py-2 text-xs font-medium text-foreground placeholder:text-muted-foreground/50 hover:border-border focus:outline-none focus:border-border transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Filter row */}
          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect
              label="Category"
              value={selectedCategory}
              onChange={setSelectedCategory}
              options={categoryOptions}
            />
            <FilterSelect
              label="Commission Type"
              value={selectedType}
              onChange={setSelectedType}
              options={typeOptions}
            />
            <FilterSelect
              label="Platform"
              value={selectedPlatform}
              onChange={setSelectedPlatform}
              options={PLATFORM_OPTIONS}
            />
            <FilterSelect
              label="Format"
              value={selectedFormat}
              onChange={setSelectedFormat}
              options={FORMAT_OPTIONS}
            />

            <button
              onClick={() => setVerifiedOnly(!verifiedOnly)}
              className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                verifiedOnly
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "border-border/50 bg-card/50 text-muted-foreground hover:border-border"
              }`}
            >
              <CheckCircle2 className="h-3 w-3 inline mr-1" />
              Verified
            </button>

            <button
              onClick={() => setHasContentOnly(!hasContentOnly)}
              className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                hasContentOnly
                  ? "border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                  : "border-border/50 bg-card/50 text-muted-foreground hover:border-border"
              }`}
            >
              Has Content
            </button>

            {hasFilters && (
              <>
                <div className="flex-1" />
                <span className="text-xs text-muted-foreground">
                  {filteredPrograms.length} of {programs.length}
                </span>
                <button
                  onClick={clearFilters}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                >
                  Clear all
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Table content */}
      {activeTab === "programs" && (
        <ProgramsTable
          items={filteredPrograms}
          contentLoaded={contentLoaded}
        />
      )}
      {activeTab === "networks" && <NetworksTable />}
      {activeTab === "categories" && <CategoriesTable />}
    </div>
  );
}
