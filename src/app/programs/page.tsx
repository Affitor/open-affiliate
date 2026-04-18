"use client";

import { Suspense, useState, useMemo, useCallback, useEffect } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  X,
  ArrowRight,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProgramLogo } from "@/components/program-logo";
import { FilterSelect } from "@/components/filter-select";
import {
  programs,
  categories,
  searchPrograms,
  commissionTypes,
  categoryCounts,
  networks,
  networkCounts,
  affiliateScore,
  type SortOption,
  type Program,
  commissionLabel,
} from "@/lib/programs";
import { track } from "@/lib/track";
import { ImpressionTracker } from "@/components/impression-tracker";

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "relevance", label: "Relevance" },
  { value: "az", label: "A \u2192 Z" },
  { value: "za", label: "Z \u2192 A" },
  { value: "commission_desc", label: "Highest Commission" },
  { value: "newest", label: "Newest" },
];

const COMMISSION_TYPE_LABELS: Record<string, string> = {
  recurring: "Recurring",
  "one-time": "One-time",
  tiered: "Tiered",
  hybrid: "Hybrid",
};

type ViewMode = "grid" | "list";

function usePersistedView(): [ViewMode, (v: ViewMode) => void] {
  const [view, setViewState] = useState<ViewMode>("list");

  useEffect(() => {
    const stored = localStorage.getItem("oa-view") as ViewMode | null;
    if (stored === "grid" || stored === "list") setViewState(stored);
  }, []);

  const setView = useCallback((v: ViewMode) => {
    setViewState(v);
    localStorage.setItem("oa-view", v);
  }, []);

  return [view, setView];
}

function ProgramCardGrid({ program }: { program: Program }) {
  return (
    <Link
      href={`/programs/${program.slug}`}
      className="group relative flex flex-col gap-3 rounded-xl border border-border/40 bg-card/30 p-5 transition-all hover:border-emerald-500/30 hover:bg-card/60 hover:shadow-[0_0_15px_rgba(34,197,94,0.06)]"
    >
      <ImpressionTracker slug={program.slug} />
      <div className="flex items-start gap-3">
        <ProgramLogo slug={program.slug} name={program.name} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold truncate">{program.name}</h3>
            {program.verified && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 border-emerald-600/30 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 shrink-0"
              >
                verified
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {program.shortDescription}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge className="text-[11px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
          Score: {affiliateScore(program)}
        </Badge>
        <Badge variant="secondary" className="text-[11px]">
          {program.commission.rate}{" "}
          {commissionLabel(program.commission)}
        </Badge>
        <Badge variant="outline" className="text-[11px]">
          {program.cookieDays}d cookie
        </Badge>
        <Badge variant="outline" className="text-[11px]">
          {program.category}
        </Badge>
      </div>
    </Link>
  );
}

function ProgramRowList({ program }: { program: Program }) {
  return (
    <Link
      href={`/programs/${program.slug}`}
      className="glow-card group relative flex items-center gap-4 rounded-xl border border-border/40 bg-card/30 p-4 transition-all hover:border-border hover:bg-card/60"
    >
      <ImpressionTracker slug={program.slug} />
      <ProgramLogo
        slug={program.slug}
        name={program.name}
        size={44}
        className="shrink-0"
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold truncate">{program.name}</h3>
          {program.verified && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 border-emerald-600/30 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 shrink-0"
            >
              verified
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {program.shortDescription}
        </p>
      </div>

      <div className="hidden sm:flex items-center gap-3 shrink-0">
        <Badge className="text-[11px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
          {affiliateScore(program)}
        </Badge>
        <Badge variant="secondary" className="text-[11px]">
          {program.commission.rate}{" "}
          {commissionLabel(program.commission)}
        </Badge>
        <Badge variant="outline" className="text-[11px]">
          {program.cookieDays}d
        </Badge>
        <span className="hidden lg:inline text-[11px] text-muted-foreground">
          {program.category}
        </span>
      </div>

      <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-foreground/60 transition-colors shrink-0 hidden sm:block" />
    </Link>
  );
}

export default function ProgramsPage() {
  return (
    <Suspense>
      <ProgramsContent />
    </Suspense>
  );
}

function ProgramsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Read initial state from URL
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [selectedCategory, setSelectedCategory] = useState(
    searchParams.get("category") ?? ""
  );
  const [selectedType, setSelectedType] = useState(
    searchParams.get("type") ?? ""
  );
  const [selectedNetwork, setSelectedNetwork] = useState(
    searchParams.get("network") ?? ""
  );
  const [sort, setSort] = useState<SortOption>(
    (searchParams.get("sort") as SortOption) ?? "relevance"
  );
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [view, setView] = usePersistedView();

  // Sync state to URL
  const syncUrl = useCallback(
    (params: Record<string, string>) => {
      const url = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value) url.set(key, value);
      }
      const qs = url.toString();
      router.replace(`/programs${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router]
  );

  const updateFilters = useCallback(
    (updates: Partial<{ q: string; category: string; type: string; network: string; sort: string }>) => {
      const next = {
        q: updates.q ?? query,
        category: updates.category ?? selectedCategory,
        type: updates.type ?? selectedType,
        network: updates.network ?? selectedNetwork,
        sort: updates.sort ?? sort,
      };
      // Don't include defaults in URL
      if (next.sort === "relevance") next.sort = "";
      syncUrl(next);
    },
    [query, selectedCategory, selectedType, selectedNetwork, sort, syncUrl]
  );

  const filtered = useMemo(
    () =>
      searchPrograms({
        query: query || undefined,
        category: selectedCategory || undefined,
        commissionType: selectedType || undefined,
        network: selectedNetwork || undefined,
        sort,
        verified: verifiedOnly || undefined,
      }),
    [query, selectedCategory, selectedType, selectedNetwork, sort, verifiedOnly]
  );

  // Debounced search tracking
  useEffect(() => {
    if (!query) return;
    const timer = setTimeout(() => {
      track("search", { metadata: { query, resultCount: filtered.length } });
    }, 800);
    return () => clearTimeout(timer);
  }, [query, filtered.length]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleSearch = (value: string) => {
    setQuery(value);
    setPage(1);
    updateFilters({ q: value });
  };
  const handleCategory = (cat: string) => {
    setSelectedCategory(cat);
    setPage(1);
    updateFilters({ category: cat });
    if (cat) track("filter", { metadata: { filter: "category", value: cat } });
  };
  const handleType = (type: string) => {
    setSelectedType(type);
    setPage(1);
    updateFilters({ type });
    if (type) track("filter", { metadata: { filter: "type", value: type } });
  };
  const handleSort = (s: string) => {
    setSort(s as SortOption);
    setPage(1);
    updateFilters({ sort: s });
  };
  const handlePageSize = (size: number) => {
    setPageSize(size);
    setPage(1);
  };
  const handleNetwork = (net: string) => {
    setSelectedNetwork(net);
    setPage(1);
    updateFilters({ network: net });
    if (net) track("filter", { metadata: { filter: "network", value: net } });
  };
  const clearAll = () => {
    setQuery("");
    setSelectedCategory("");
    setSelectedType("");
    setSelectedNetwork("");
    setVerifiedOnly(false);
    setSort("relevance");
    setPage(1);
    syncUrl({});
  };

  const hasActiveFilters = !!(query || selectedCategory || selectedType || selectedNetwork || verifiedOnly);

  // Category options with counts
  const categoryOptions = [
    { value: "", label: "All Categories" },
    ...categories.map((cat) => ({
      value: cat,
      label: cat,
      count: categoryCounts[cat] ?? 0,
    })),
  ];

  // Commission type options
  const typeOptions = [
    { value: "", label: "All Types" },
    ...commissionTypes.map((t) => ({
      value: t,
      label: COMMISSION_TYPE_LABELS[t] ?? t,
    })),
  ];

  // Network options with counts
  const NETWORK_LABELS: Record<string, string> = {
    "In-house": "In-house",
    partnerstack: "PartnerStack",
    impact: "Impact",
    rewardful: "Rewardful",
    "cj-affiliate": "CJ Affiliate",
    firstpromoter: "FirstPromoter",
    awin: "Awin",
    dub: "Dub",
  };
  const networkOptions = [
    { value: "", label: "All Networks" },
    ...networks.map((n) => ({
      value: n,
      label: NETWORK_LABELS[n] ?? n.charAt(0).toUpperCase() + n.slice(1),
      count: networkCounts[n] ?? 0,
    })),
  ];

  // Sort options
  const sortOptions = SORT_OPTIONS.map((o) => ({
    value: o.value,
    label: o.label,
  }));

  // Pagination range — show max 7 pages
  const pageRange = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const start = Math.max(1, currentPage - 3);
    const end = Math.min(totalPages, start + 6);
    const adjusted = Math.max(1, end - 6);
    return Array.from({ length: end - adjusted + 1 }, (_, i) => adjusted + i);
  }, [totalPages, currentPage]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Programs</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {programs.length} affiliate programs — curated, verified, and
          agent-ready
        </p>
      </div>


      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search programs..."
            className="rounded-lg border border-border/50 bg-card/50 pl-8 pr-3 py-2 text-xs w-44 focus:outline-none focus:border-border transition-colors placeholder:text-muted-foreground/60"
          />
        </div>
        <FilterSelect
          label="Category"
          value={selectedCategory}
          onChange={handleCategory}
          options={categoryOptions}
        />
        <FilterSelect
          label="Commission Type"
          value={selectedType}
          onChange={handleType}
          options={typeOptions}
        />
        <FilterSelect
          label="Network"
          value={selectedNetwork}
          onChange={handleNetwork}
          options={networkOptions}
        />
        <FilterSelect
          label="Sort"
          value={sort}
          onChange={handleSort}
          options={sortOptions}
        />

        {/* Verified toggle */}
        <button
          onClick={() => { setVerifiedOnly(!verifiedOnly); setPage(1); }}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
            verifiedOnly
              ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "border-border/50 bg-card/50 text-muted-foreground hover:border-border"
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Verified
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* View toggle */}
        <div className="flex items-center rounded-lg border border-border/50 overflow-hidden">
          <button
            onClick={() => setView("list")}
            className={`flex items-center justify-center h-8 w-8 transition-colors ${
              view === "list"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
            aria-label="List view"
          >
            <List className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setView("grid")}
            className={`flex items-center justify-center h-8 w-8 transition-colors ${
              view === "grid"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
            aria-label="Grid view"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Active filters + results count */}
      <div className="flex items-center gap-2 flex-wrap mb-6">
        <span className="text-xs text-muted-foreground">
          {filtered.length === programs.length
            ? `${filtered.length} programs`
            : `${filtered.length} of ${programs.length} programs`}
        </span>

        {hasActiveFilters && (
          <>
            <span className="text-border">|</span>
            {query && (
              <button
                onClick={() => handleSearch("")}
                className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                &ldquo;{query}&rdquo;
                <X className="h-3 w-3" />
              </button>
            )}
            {selectedCategory && (
              <button
                onClick={() => handleCategory("")}
                className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                {selectedCategory}
                <X className="h-3 w-3" />
              </button>
            )}
            {selectedType && (
              <button
                onClick={() => handleType("")}
                className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                {COMMISSION_TYPE_LABELS[selectedType] ?? selectedType}
                <X className="h-3 w-3" />
              </button>
            )}
            {selectedNetwork && (
              <button
                onClick={() => handleNetwork("")}
                className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                {selectedNetwork}
                <X className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={clearAll}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
            >
              Clear all
            </button>
          </>
        )}
      </div>

      {/* Results */}
      {paginated.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm text-muted-foreground">
            No programs found. Try a different search or category.
          </p>
          {hasActiveFilters && (
            <button
              onClick={clearAll}
              className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors underline"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginated.map((program) => (
            <ProgramCardGrid key={program.slug} program={program} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {paginated.map((program) => (
            <ProgramRowList key={program.slug} program={program} />
          ))}
        </div>
      )}

      {/* Pagination + page size */}
      <div className="flex flex-col items-center gap-3 mt-8">
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {pageRange[0] > 1 && (
              <>
                <button
                  onClick={() => setPage(1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  1
                </button>
                {pageRange[0] > 2 && (
                  <span className="text-xs text-muted-foreground/50 px-1">&hellip;</span>
                )}
              </>
            )}
            {pageRange.map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition-colors ${
                  p === currentPage
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {p}
              </button>
            ))}
            {pageRange[pageRange.length - 1] < totalPages && (
              <>
                {pageRange[pageRange.length - 1] < totalPages - 1 && (
                  <span className="text-xs text-muted-foreground/50 px-1">&hellip;</span>
                )}
                <button
                  onClick={() => setPage(totalPages)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  {totalPages}
                </button>
              </>
            )}
            <button
              onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage >= totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-1">Show</span>
          {PAGE_SIZE_OPTIONS.map((size) => (
            <button
              key={size}
              onClick={() => handlePageSize(size)}
              className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                pageSize === size
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}
