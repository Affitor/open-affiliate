"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import Link from "next/link";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  X,
} from "lucide-react";
import { ProgramLogo } from "@/components/program-logo";
import { FilterSelect } from "@/components/filter-select";
import { track } from "@/lib/track";
import {
  programs,
  categories,
  commissionTypes,
  categoryCounts,
  compareText,
  type Program,
  commissionDisplay
} from "@/lib/client-programs";
import { networkName } from "@/lib/network-meta";
import { UNCONFIRMED } from "@/lib/confirmed-terms";
// Types only: the rows are built on the server (groupRow), never the registry.
import type { GroupRow, PaidFigure } from "@/lib/programs";
import { commissionGroup, compareCommissionFigure, recurringMonths, recurringText, type CommissionGroup } from "@/lib/rankings-terms";

type Tab = "programs" | "networks" | "categories";

const COMMISSION_TYPE_LABELS: Record<string, string> = {
  recurring: "Recurring",
  "one-time": "One-time",
  tiered: "Tiered",
  hybrid: "Hybrid",
};

/** Terms the browser registry leaves out, sent by the server for each verified program. */
export interface TermFacts {
  slug: string;
  payoutMin: number | null;
  payoutMinText: string | null;
  /** "2026-10-13", the date the terms were last checked. */
  checked: string;
}

// ── Shared components ───────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-line-strong font-mono text-xs font-semibold text-foreground">
        1
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-line-strong font-mono text-xs font-semibold text-foreground">
        2
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-line-strong font-mono text-xs font-semibold text-foreground">
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

// ── Sort header ─────────────────────────────────────────────────

type ColumnSort = "name" | "commission" | "recurring" | "cookie" | "payout" | "checked";
type SortDir = "asc" | "desc";

function SortHeader({
  label,
  column,
  activeColumn,
  activeDir,
  onSort,
  className,
  sortable = true,
}: {
  label: string;
  column: ColumnSort;
  activeColumn: ColumnSort;
  activeDir: SortDir;
  onSort: (col: ColumnSort) => void;
  className?: string;
  sortable?: boolean;
}) {
  const isActive = activeColumn === column;
  if (!sortable) {
    return (
      <th className={`py-3 px-3 font-mono text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground ${className ?? ""}`}>
        {label}
      </th>
    );
  }
  return (
    <th
      aria-sort={isActive ? (activeDir === "desc" ? "descending" : "ascending") : "none"}
      className={`py-3 px-3 font-mono text-xs font-medium uppercase tracking-[0.08em] ${className ?? ""}`}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-1 uppercase tracking-[0.08em] transition-colors hover:text-foreground ${
          isActive ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {label}
        {isActive ? (
          activeDir === "desc" ? (
            <ArrowDown className="h-3 w-3" aria-hidden />
          ) : (
            <ArrowUp className="h-3 w-3" aria-hidden />
          )
        ) : (
          <ArrowUpDown className="h-2.5 w-2.5 opacity-30" aria-hidden />
        )}
      </button>
    </th>
  );
}

// ── Verified Programs Table ─────────────────────────────────────

interface Row {
  program: Program;
  group: CommissionGroup;
  months: number | null | undefined;
  facts: TermFacts;
}

/** Rows rendered before the reader asks for the rest. */
const DEFAULT_VISIBLE = 50;

/** Numbers in `dir` order, a missing figure last either way. */
function compareFigure(a: number | null | undefined, b: number | null | undefined, dir: number): number {
  if (a == null || b == null) return Number(a == null) - Number(b == null);
  return a === b ? 0 : (a < b ? -1 : 1) * dir;
}

const CELL_MUTED = "text-muted-foreground";

const GROUPS: { value: CommissionGroup; label: string }[] = [
  { value: "percent", label: "Percentage of sale" },
  { value: "flat", label: "Flat amount" },
  { value: "other", label: "Tiered and other" },
];

const GROUP_NOTE: Record<CommissionGroup, string> = {
  percent: "Programs that pay a percentage of each sale, highest first. When two pay the same, the one that recurs longer comes first.",
  flat: "Programs that pay a fixed US-dollar amount per referral, highest first. When two pay the same, the one that recurs longer comes first.",
  other: "Tiered, hybrid and unpublished rates, and rewards in credits or other currencies, have no single figure to compare, so this list runs A to Z.",
};

function ProgramsTable({ items, filterKey, group }: { items: Row[]; filterKey: string; group: CommissionGroup }) {
  // Remounted per group (key): percent and flat open by commission, "other" A to Z.
  const [sortCol, setSortCol] = useState<ColumnSort>(group === "other" ? "name" : "commission");
  const [sortDir, setSortDir] = useState<SortDir>(group === "other" ? "asc" : "desc");
  const [pagination, setPagination] = useState({ filterKey, page: 0 });
  const page = pagination.filterKey === filterKey ? pagination.page : 0;
  const setPage = useCallback(
    (nextPage: number) => setPagination({ filterKey, page: nextPage }),
    [filterKey]
  );

  const handleSort = useCallback(
    (col: ColumnSort) => {
      setPage(0);
      if (sortCol === col) {
        setSortDir((d) => (d === "desc" ? "asc" : "desc"));
      } else {
        setSortCol(col);
        // A low payout minimum is the better one, so it starts low to high.
        setSortDir(col === "name" || col === "payout" ? "asc" : "desc");
      }
    },
    [sortCol, setPage]
  );

  const sorted = useMemo(() => {
    const list = [...items];
    const dir = sortDir === "desc" ? -1 : 1;
    list.sort((a, b) => {
      const byName = compareText(a.program.name, b.program.name);
      switch (sortCol) {
        case "commission":
          return compareCommissionFigure(a.program, b.program, dir);
        case "recurring":
          return compareFigure(a.months, b.months, dir) || byName;
        case "cookie":
          return compareFigure(a.program.cookieDays, b.program.cookieDays, dir) || byName;
        case "payout":
          return compareFigure(a.facts.payoutMin, b.facts.payoutMin, dir) || byName;
        case "checked":
          return compareFigure(a.facts.checked ? Date.parse(a.facts.checked) : null, b.facts.checked ? Date.parse(b.facts.checked) : null, dir) || byName;
        default:
          return byName * dir;
      }
    });
    return list;
  }, [items, sortCol, sortDir]);

  // Keep every interaction bounded to 50 rows: rendering every stateful logo
  // row at once is the long task the 50-row page exists to avoid.
  const pageCount = Math.max(1, Math.ceil(sorted.length / DEFAULT_VISIBLE));
  const activePage = Math.min(page, pageCount - 1);
  const visible = useMemo(
    () =>
      sorted.slice(
        activePage * DEFAULT_VISIBLE,
        (activePage + 1) * DEFAULT_VISIBLE
      ),
    [sorted, activePage]
  );

  const head = { activeColumn: sortCol, activeDir: sortDir, onSort: handleSort };

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-sunk">
        <p className="text-xs text-muted-foreground">
          Verified programs only, every figure checked on the brand&apos;s own terms page. {GROUP_NOTE[group]}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-sunk">
              <th className="w-10 py-3 px-3 text-center font-mono text-xs font-medium text-muted-foreground uppercase tracking-[0.08em]">
                #
              </th>
              <SortHeader label="Program" column="name" {...head} className="text-left" />
              <SortHeader label="Commission" column="commission" {...head} className="text-left" sortable={group !== "other"} />
              <SortHeader label="Recurring" column="recurring" {...head} className="text-left hidden sm:table-cell" />
              <SortHeader label="Cookie" column="cookie" {...head} className="text-left hidden sm:table-cell" />
              <SortHeader label="Payout min" column="payout" {...head} className="text-left hidden md:table-cell" />
              <SortHeader label="Checked" column="checked" {...head} className="text-left hidden md:table-cell" />
            </tr>
          </thead>
          <tbody>
            {visible.map((item, i) => {
              const p = item.program;
              return (
                <tr
                  key={p.slug}
                  className="border-t border-border hover:bg-sunk transition-colors group"
                >
                  <td className="py-3 px-3 text-center">
                    <RankBadge rank={activePage * DEFAULT_VISIBLE + i + 1} />
                  </td>
                  {/* w-full + max-w-0: the name column takes the room left and truncates, so Commission stays on screen at 390px. */}
                  <td className="w-full max-w-0 py-3 px-3">
                    <Link
                      href={`/programs/${p.slug}`}
                      className="flex min-w-0 items-center gap-3"
                    >
                      <ProgramLogo
                        slug={p.slug}
                        name={p.name}
                        size={32}
                        className="shrink-0"
                      />
                      <div className="min-w-0">
                        <span className="block text-sm font-medium truncate group-hover:underline underline-offset-4 transition-colors">
                          {p.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{p.category}</span>
                      </div>
                    </Link>
                  </td>
                  <td className="py-3 px-3">
                    {/* Tiered and hybrid rates are sentences ("50% for six months, then 25% for life"): two lines at most. */}
                    <span className="block w-max max-w-[128px] sm:max-w-[220px] line-clamp-2 font-mono text-sm font-medium text-foreground" title={commissionDisplay(p.commission)}>
                      {commissionDisplay(p.commission)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {COMMISSION_TYPE_LABELS[p.commission.type] ?? p.commission.type}
                      {/* The Recurring column is hidden below sm; its length rides here instead. */}
                      {item.months ? <span className="sm:hidden"> · {recurringText(item.months)}</span> : null}
                    </span>
                  </td>
                  <td className={`py-3 px-3 hidden sm:table-cell whitespace-nowrap text-sm ${item.months ? "" : CELL_MUTED}`}>
                    {recurringText(item.months)}
                  </td>
                  <td className={`py-3 px-3 hidden sm:table-cell whitespace-nowrap font-mono text-sm tabular-nums ${p.cookieDays != null ? "" : CELL_MUTED}`}>
                    {p.cookieDays != null ? `${p.cookieDays} days` : "Not published"}
                  </td>
                  <td className={`py-3 px-3 hidden md:table-cell whitespace-nowrap font-mono text-sm tabular-nums ${item.facts.payoutMinText ? "" : CELL_MUTED}`}>
                    {item.facts.payoutMinText ?? "Not published"}
                  </td>
                  <td className="py-3 px-3 hidden md:table-cell whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
                    {item.facts.checked ? <time dateTime={item.facts.checked}>{item.facts.checked}</time> : "—"}
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
            No verified programs match your filters.
          </p>
        </div>
      )}
      {sorted.length > DEFAULT_VISIBLE && (
        <div className="border-t border-border px-4 py-3 flex items-center justify-center gap-4">
          <button
            onClick={() => setPage(Math.max(0, activePage - 1))}
            disabled={activePage === 0}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
          >
            Previous
          </button>
          <span className="text-xs text-muted-foreground tabular-nums">
            Page {activePage + 1} of {pageCount}
          </span>
          <button
            onClick={() =>
              setPage(Math.min(pageCount - 1, activePage + 1))
            }
            disabled={activePage === pageCount - 1}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
      <div className="px-4 py-3 border-t border-border flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          showing {sorted.length === 0 ? 0 : activePage * DEFAULT_VISIBLE + 1}-
          {activePage * DEFAULT_VISIBLE + visible.length} of {sorted.length} verified programs
        </span>
        <Link
          href="/programs"
          prefetch={false}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          All programs
        </Link>
      </div>
    </div>
  );
}

// ── Networks and Categories Tables ──────────────────────────────

// Rows come from groupRow (src/lib/programs.ts): percentage rates and flat
// US-dollar payouts in separate columns, unconfirmed figures marked.

const GROUP_HEAD = "py-3 px-3 font-mono text-xs font-medium text-muted-foreground uppercase tracking-[0.08em]";

function GroupHead({ label }: { label: string }) {
  return (
    <thead>
      <tr className="border-b border-border/40 bg-muted/30">
        <th className={`w-12 text-center ${GROUP_HEAD}`}>#</th>
        <th className={`text-left ${GROUP_HEAD}`}>{label}</th>
        <th className={`w-24 text-center ${GROUP_HEAD}`}>Programs</th>
        <th className={`w-28 text-center hidden sm:table-cell ${GROUP_HEAD}`}>Avg Rate</th>
        <th className={`text-left hidden sm:table-cell ${GROUP_HEAD}`}>Top Rate</th>
        <th className={`text-left hidden md:table-cell ${GROUP_HEAD}`}>Top Flat Payout</th>
      </tr>
    </thead>
  );
}

function PaidCell({ paid, className }: { paid: PaidFigure | null; className: string }) {
  return (
    <td className={`py-3 px-3 ${className}`}>
      {paid ? (
        <Link
          href={`/programs/${paid.slug}`}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-2 hover:underline underline-offset-4 transition-colors"
        >
          <span className="font-mono text-sm font-medium text-foreground tabular-nums">
            {paid.display}
          </span>
          <ProgramLogo slug={paid.slug} name={paid.name} size={20} />
          <span className="text-xs font-medium truncate">{paid.name}</span>
          {paid.unconfirmed && (
            <span className="text-xs text-muted-foreground shrink-0">{UNCONFIRMED}</span>
          )}
        </Link>
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      )}
    </td>
  );
}

function GroupCells({ row }: { row: GroupRow }) {
  return (
    <>
      <td className="py-3 px-3 text-center">
        <span className="text-sm tabular-nums">{row.programCount}</span>
      </td>
      <td className="py-3 px-3 text-center hidden sm:table-cell">
        <span className="text-sm text-muted-foreground tabular-nums">{row.avgRate}</span>
        {row.avgBasis && (
          <span className="block text-xs leading-tight text-muted-foreground">{row.avgBasis}</span>
        )}
      </td>
      <PaidCell paid={row.topRate} className="hidden sm:table-cell" />
      <PaidCell paid={row.topFlatUsd} className="hidden md:table-cell" />
    </>
  );
}

function NetworksTable({ rows }: { rows: GroupRow[] }) {
  return (
    <div className="rounded-xl border border-border/40 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <GroupHead label="Network" />
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.name}
                className="border-t border-border/20 hover:bg-muted/20 transition-colors cursor-pointer group"
                onClick={() =>
                  (window.location.href = `/programs?network=${encodeURIComponent(row.name)}`)
                }
              >
                <td className="py-3 px-3 text-center">
                  <RankBadge rank={i + 1} />
                </td>
                <td className="py-3 px-3">
                  <span className="text-sm font-medium group-hover:underline underline-offset-4 transition-colors">
                    {networkName(row.name)}
                  </span>
                </td>
                <GroupCells row={row} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CategoriesTable({ rows }: { rows: GroupRow[] }) {
  return (
    <div className="rounded-xl border border-border/40 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <GroupHead label="Category" />
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.name}
                className="border-t border-border/20 hover:bg-muted/20 transition-colors"
              >
                <td className="py-3 px-3 text-center">
                  <RankBadge rank={i + 1} />
                </td>
                <td className="py-3 px-3">
                  <Link
                    href={`/programs?category=${encodeURIComponent(row.name)}`}
                    prefetch={false}
                    className="text-sm font-medium hover:underline underline-offset-4 transition-colors"
                  >
                    {row.name}
                  </Link>
                </td>
                <GroupCells row={row} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────

export default function RankingsClient({
  oas,
  facts,
  networkRows,
  categoryRows,
}: {
  /** The OAS leaderboard, server-rendered; null while oas-scores.json is empty. */
  oas: React.ReactNode | null;
  facts: TermFacts[];
  networkRows: GroupRow[];
  categoryRows: GroupRow[];
}) {
  const [activeTab, setActiveTab] = useState<Tab>("programs");
  const [group, setGroup] = useState<CommissionGroup>("percent");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    track("page_view");
  }, []);

  const rows: Row[] = useMemo(() => {
    const bySlug = new Map(facts.map((f) => [f.slug, f]));
    return programs.flatMap((program) => {
      const f = program.verified ? bySlug.get(program.slug) : undefined;
      return f ? [{ program, group: commissionGroup(program.commission), months: recurringMonths(program.commission), facts: f }] : [];
    });
  }, [facts]);

  const filteredRows = useMemo(() => {
    let result = rows;

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

    return result;
  }, [rows, searchQuery, selectedCategory, selectedType]);

  const hasFilters = selectedCategory || selectedType || searchQuery;

  const clearFilters = () => {
    setSelectedCategory("");
    setSelectedType("");
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
    { value: "programs", label: "Programs", count: rows.length },
    { value: "networks", label: "Networks", count: networkRows.length },
    { value: "categories", label: "Categories", count: categories.length },
  ];

  return (
    <div className="oa-frame px-4 py-10 sm:px-12">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <ArrowUpDown className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-title md:text-display font-semibold tracking-[-0.03em]">
            Affiliate Program Rankings
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {oas ? "Programs ranked by OAS, and " : ""}{rows.length} verified programs
          sorted by what they pay: commission, how long it recurs, cookie
          length and payout minimum.
        </p>
      </div>

      {oas && (
        <>
          {oas}
          <h2 className="text-title font-semibold tracking-[-0.02em] mb-4">By what they pay</h2>
        </>
      )}

      {/* Tab bar */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-sunk p-1 mb-6 w-fit">
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
            <span className="ml-1.5 text-xs text-muted-foreground">
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Filters (Programs tab only) */}
      {activeTab === "programs" && (
        <div className="space-y-3 mb-4">
          {/* A percentage and a dollar amount cannot be ranked against each other: one list each. */}
          <div role="group" aria-label="Commission paid as" className="flex flex-wrap gap-2">
            {GROUPS.map((g) => (
              <button
                key={g.value}
                type="button"
                aria-pressed={group === g.value}
                onClick={() => setGroup(g.value)}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  group === g.value
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-line-strong"
                }`}
              >
                {g.label}
                <span className="ml-1.5 tabular-nums">{filteredRows.filter((r) => r.group === g.value).length}</span>
              </button>
            ))}
          </div>
          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search verified programs..."
              aria-label="Search verified programs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-border bg-card pl-9 pr-8 py-2 text-xs font-medium text-foreground placeholder:text-muted-foreground hover:border-line-strong focus:outline-none focus:border-line-strong transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
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

            {hasFilters && (
              <>
                <div className="flex-1" />
                <span className="text-xs text-muted-foreground">
                  {filteredRows.length} of {rows.length}
                </span>
                <button
                  onClick={clearFilters}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
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
          key={group}
          group={group}
          filterKey={JSON.stringify([searchQuery, selectedCategory, selectedType])}
          items={filteredRows.filter((r) => r.group === group)}
        />
      )}
      {activeTab === "networks" && <NetworksTable rows={networkRows} />}
      {activeTab === "categories" && <CategoriesTable rows={categoryRows} />}
    </div>
  );
}
