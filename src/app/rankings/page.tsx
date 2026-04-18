"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { Trophy, Medal, Award, ArrowUpDown, ArrowUp, ArrowDown, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProgramLogo } from "@/components/program-logo";
import { FilterSelect } from "@/components/filter-select";
import { VoteButton, useVoteCounts } from "@/components/vote-button";
import {
  programs,
  categories,
  commissionTypes,
  categoryCounts,
  parseCommissionRate,
  getNetworkStats,
  getCategoryStats,
  type Program,
} from "@/lib/programs";

type Tab = "programs" | "networks" | "categories";

const COMMISSION_TYPE_LABELS: Record<string, string> = {
  recurring: "Recurring",
  "one-time": "One-time",
  tiered: "Tiered",
  hybrid: "Hybrid",
};

function formatNetworkName(name: string): string {
  if (!name || name === "In-house") return "In-house";
  return name
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function affiliateScore(p: Program): number {
  const commRate = parseCommissionRate(p.commission.rate);
  const commScore = Math.min(commRate / 50, 1) * 50;
  const cookieScore = Math.min(p.cookieDays / 90, 1) * 20;
  const recurringScore = p.commission.type === "recurring" ? 20 : p.commission.type === "tiered" ? 10 : 0;
  const verifiedScore = p.verified ? 10 : 0;
  return Math.round(commScore + cookieScore + recurringScore + verifiedScore);
}

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
                Score: {affiliateScore(program)}
              </Badge>
              <Badge variant="secondary" className="text-[11px]">
                {program.commission.rate}{" "}
                {program.commission.type === "recurring"
                  ? "recurring"
                  : program.commission.type}
              </Badge>
              <Badge variant="outline" className="text-[11px]">
                {program.cookieDays}d cookie
              </Badge>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

type ColumnSort = "score" | "commission" | "cookie" | "category" | "name";
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

function ProgramsTable({
  rankedPrograms,
}: {
  rankedPrograms: Program[];
}) {
  const [sortCol, setSortCol] = useState<ColumnSort>("score");
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
    const list = [...rankedPrograms];
    const dir = sortDir === "desc" ? -1 : 1;
    list.sort((a, b) => {
      switch (sortCol) {
        case "score":
          return (affiliateScore(a) - affiliateScore(b)) * dir;
        case "commission":
          return (parseCommissionRate(a.commission.rate) - parseCommissionRate(b.commission.rate)) * dir;
        case "cookie":
          return (a.cookieDays - b.cookieDays) * dir;
        case "category":
          return a.category.localeCompare(b.category) * dir;
        case "name":
          return a.name.localeCompare(b.name) * dir;
        default:
          return 0;
      }
    });
    return list;
  }, [rankedPrograms, sortCol, sortDir]);

  const slugs = useMemo(() => sorted.map((p) => p.slug), [sorted]);
  const { counts } = useVoteCounts(slugs);

  return (
    <div className="rounded-xl border border-border/40 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 bg-muted/30">
              <th className="w-12 py-3 px-3 text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                #
              </th>
              <SortHeader label="Program" column="name" activeColumn={sortCol} activeDir={sortDir} onSort={handleSort} className="text-left" />
              <SortHeader label="Commission" column="commission" activeColumn={sortCol} activeDir={sortDir} onSort={handleSort} className="w-28 text-left hidden sm:table-cell" />
              <SortHeader label="Cookie" column="cookie" activeColumn={sortCol} activeDir={sortDir} onSort={handleSort} className="w-20 text-center hidden sm:table-cell" />
              <SortHeader label="Category" column="category" activeColumn={sortCol} activeDir={sortDir} onSort={handleSort} className="w-28 text-left hidden md:table-cell" />
              <SortHeader label="Score" column="score" activeColumn={sortCol} activeDir={sortDir} onSort={handleSort} className="w-16 text-center" />
              <th className="w-16 py-3 px-2 text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Votes
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((program, i) => (
              <tr
                key={program.slug}
                className="border-t border-border/20 hover:bg-muted/20 transition-colors group"
              >
                <td className="py-3 px-3 text-center">
                  <RankBadge rank={i + 1} />
                </td>
                <td className="py-3 px-3">
                  <Link
                    href={`/programs/${program.slug}`}
                    className="flex items-center gap-3"
                  >
                    <ProgramLogo
                      slug={program.slug}
                      name={program.name}
                      size={32}
                      className="shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                          {program.name}
                        </span>
                        {program.verified && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {program.category}
                        <span className="mx-1 text-border">&middot;</span>
                        {COMMISSION_TYPE_LABELS[program.commission.type] ?? program.commission.type}
                      </span>
                    </div>
                  </Link>
                </td>
                <td className="py-3 px-3 hidden sm:table-cell">
                  <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    {program.commission.rate}
                  </span>
                </td>
                <td className="py-3 px-3 text-center hidden sm:table-cell">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {program.cookieDays}d
                  </span>
                </td>
                <td className="py-3 px-3 hidden md:table-cell">
                  <span className="text-xs text-muted-foreground">
                    {program.category}
                  </span>
                </td>
                <td className="py-3 px-3 text-center">
                  <span className="text-sm font-semibold tabular-nums">
                    {affiliateScore(program)}
                  </span>
                </td>
                <td className="py-3 px-2 text-center">
                  <VoteButton
                    slug={program.slug}
                    initialCount={counts[program.slug] ?? 0}
                  />
                </td>
              </tr>
            ))}
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
    </div>
  );
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
                className="border-t border-border/20 hover:bg-muted/20 transition-colors"
              >
                <td className="py-3 px-3 text-center">
                  <RankBadge rank={i + 1} />
                </td>
                <td className="py-3 px-3">
                  <span className="text-sm font-medium">
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
                    {row.avgCommission.toFixed(1)}%
                  </span>
                </td>
                <td className="py-3 px-3 text-center hidden sm:table-cell">
                  <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {row.bestCommission}%
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
                    {row.avgCommission.toFixed(1)}%
                  </span>
                </td>
                <td className="py-3 px-3 text-center hidden sm:table-cell">
                  <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {row.highestCommission}%
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

export default function RankingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("programs");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const top3 = useMemo(() => {
    return [...programs]
      .sort((a, b) => affiliateScore(b) - affiliateScore(a))
      .slice(0, 3);
  }, []);

  const rankedPrograms = useMemo(() => {
    let result = [...programs];
    if (selectedCategory)
      result = result.filter((p) => p.category === selectedCategory);
    if (selectedType)
      result = result.filter((p) => p.commission.type === selectedType);
    if (verifiedOnly) result = result.filter((p) => p.verified);
    result.sort((a, b) => affiliateScore(b) - affiliateScore(a));
    return result;
  }, [selectedCategory, selectedType, verifiedOnly]);

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
    {
      value: "networks",
      label: "Networks",
      count: getNetworkStats().length,
    },
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
          {programs.length} programs ranked by Affiliate Score across{" "}
          {categories.length} categories
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
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <FilterSelect
            label="Category"
            value={selectedCategory}
            onChange={(v) => {
              setSelectedCategory(v);
            }}
            options={categoryOptions}
          />
          <FilterSelect
            label="Commission Type"
            value={selectedType}
            onChange={(v) => {
              setSelectedType(v);
            }}
            options={typeOptions}
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
            Verified only
          </button>

          {(selectedCategory || selectedType || verifiedOnly) && (
            <>
              <div className="flex-1" />
              <span className="text-xs text-muted-foreground">
                {rankedPrograms.length} of {programs.length} programs
              </span>
              <button
                onClick={() => {
                  setSelectedCategory("");
                  setSelectedType("");
                  setVerifiedOnly(false);
                }}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
              >
                Clear all
              </button>
            </>
          )}
        </div>
      )}

      {/* Table content */}
      {activeTab === "programs" && (
        <ProgramsTable rankedPrograms={rankedPrograms} />
      )}
      {activeTab === "networks" && <NetworksTable />}
      {activeTab === "categories" && <CategoriesTable />}

      {/* CLI hint */}
      <div className="mt-10 rounded-xl border border-border/40 bg-muted/20 p-6">
        <h3 className="text-sm font-semibold">
          Compare from your terminal
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Use the CLI to find the highest-paying programs in any category.
        </p>
        <div className="mt-3 overflow-x-auto rounded-lg bg-muted/60 dark:bg-zinc-950 border border-border/50">
          <code className="block px-4 py-2.5 text-xs font-mono text-muted-foreground whitespace-nowrap">
            npx openaffiliate search --category &quot;AI&quot; --sort
            commission --json
          </code>
        </div>
      </div>
    </div>
  );
}
