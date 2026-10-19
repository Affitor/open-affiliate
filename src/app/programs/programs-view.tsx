"use client";

import { Suspense, useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  X,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { ProgramCardGrid, ProgramRowList } from "@/components/program-card";
import { FilterSelect } from "@/components/filter-select";
import {
  programs,
  categories,
  searchPrograms,
  commissionTypes,
  categoryCounts,
  networks,
  networkCounts,
  type SortOption,
} from "@/lib/client-programs";
import { networkName } from "@/lib/network-meta";
import { track } from "@/lib/track";
import { LONG_COOKIE_DAYS, type PayoutMethodFilter } from "@/lib/payout-filters";

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

/** Payout and cookie filters: the facts the hub lists filter on (payout-filters.ts). */
const PAYOUT_OPTIONS = [
  { value: "", label: "Any Payout Method" },
  { value: "paypal", label: "PayPal" },
  { value: "bank", label: "Bank Transfer" },
];
const MIN_PAYOUT_OPTIONS = [
  { value: "", label: "Any Minimum" },
  { value: "0", label: "No Minimum Payout" },
];
const COOKIE_OPTIONS = [
  { value: "", label: "Any Cookie" },
  { value: String(LONG_COOKIE_DAYS), label: `${LONG_COOKIE_DAYS}+ Day Cookie` },
];
const optionValue = (options: { value: string }[], v: string | null) => (options.some((o) => o.value === v) ? v! : "");

type ViewMode = "grid" | "list";

function usePersistedView(): [ViewMode, (v: ViewMode) => void] {
  const [view, setViewState] = useState<ViewMode>("list");

  useEffect(() => {
    const stored = localStorage.getItem("oa-view") as ViewMode | null;
    if (stored === "grid" || stored === "list") {
      requestAnimationFrame(() => setViewState(stored));
    }
  }, []);

  const setView = useCallback((v: ViewMode) => {
    setViewState(v);
    localStorage.setItem("oa-view", v);
  }, []);

  return [view, setView];
}


// ProgramsContent reads useSearchParams, so the whole subtree bails out of
// prerendering. Without a fallback the served HTML had an empty <main>, which
// left the 430px footer sitting near the top of the viewport until the client
// filled the list in and shoved it down — 0.53 CLS. The skeleton mirrors the
// real layout and is a viewport tall, so the footer starts below the fold and
// the swap shifts nothing that is on screen.
function ProgramsSkeleton() {
  return (
    <div className="min-h-dvh">
      <div className="oa-band !py-8 md:!py-10">
        <p className="oa-label">Directory</p>
        <div className="mt-2 h-8 w-72 max-w-full animate-pulse rounded bg-sunk md:h-10" />
        <div className="mt-2 h-4 w-24 animate-pulse rounded bg-sunk" />
      </div>
      <div className="oa-band !py-4">
        <div className="h-10 animate-pulse rounded-lg bg-sunk md:h-8" />
      </div>
      <div className="oa-band !pt-5">
        <div className="mb-3 h-4 w-28 animate-pulse rounded bg-sunk" />
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="h-[57px] border-b border-border last:border-b-0" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ProgramsView() {
  return (
    <Suspense fallback={<ProgramsSkeleton />}>
      <ProgramsContent />
    </Suspense>
  );
}

function ProgramsContent() {
  const searchParams = useSearchParams();

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
  const [selectedPayout, setSelectedPayout] = useState(optionValue(PAYOUT_OPTIONS, searchParams.get("payout")));
  const [minPayout, setMinPayout] = useState(optionValue(MIN_PAYOUT_OPTIONS, searchParams.get("minpayout")));
  const [cookie, setCookie] = useState(optionValue(COOKIE_OPTIONS, searchParams.get("cookie")));
  const [sort, setSort] = useState<SortOption>(
    (searchParams.get("sort") as SortOption) ?? "relevance"
  );
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [view, setView] = usePersistedView();
  const [sheetOpen, setSheetOpen] = useState(false);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  // Pagination lives in the URL, not in React state.
  //
  // It used to be useState, so the URL never changed as you paged through.
  // Open a program from page 3, press back, and you landed on page 1 having
  // lost your place — with 760 programs over 31 pages that happens on every
  // single visit that goes past the first page. It showed up in analytics as
  // rageclicks on the pagination controls: 48 of the 70 recorded across the
  // whole site, all on this page.
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const sizeParam = Number(searchParams.get("size"));
  const pageSize = PAGE_SIZE_OPTIONS.includes(sizeParam as (typeof PAGE_SIZE_OPTIONS)[number])
    ? sizeParam
    : 25;

  // Sync state to URL
  const syncUrl = useCallback(
    (params: Record<string, string>) => {
      const url = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value) url.set(key, value);
      }
      const qs = url.toString();
      // history.replaceState, not the router: Next keeps useSearchParams in
      // sync without a server round trip, which would refetch the page's
      // server-rendered A–Z directory on every keystroke.
      window.history.replaceState(null, "", `/programs${qs ? `?${qs}` : ""}`);
    },
    []
  );

  /**
   * Same names and call signatures as the useState setters they replace, so
   * every existing call site keeps working — they now write the URL instead.
   * Filters are read from current state so paging never drops them.
   */
  const filterParams = useCallback(
    () => ({
      q: query,
      category: selectedCategory,
      type: selectedType,
      network: selectedNetwork,
      payout: selectedPayout,
      minpayout: minPayout,
      cookie,
      sort: sort === "relevance" ? "" : sort,
      size: pageSize === 25 ? "" : String(pageSize),
    }),
    [query, selectedCategory, selectedType, selectedNetwork, selectedPayout, minPayout, cookie, sort, pageSize]
  );

  const setPage = useCallback(
    (p: number) => syncUrl({ ...filterParams(), page: p <= 1 ? "" : String(p) }),
    [syncUrl, filterParams]
  );

  const setPageSize = useCallback(
    (size: number) =>
      syncUrl({ ...filterParams(), size: size === 25 ? "" : String(size), page: "" }),
    [syncUrl, filterParams]
  );

  const updateFilters = useCallback(
    (updates: Partial<{ q: string; category: string; type: string; network: string; payout: string; minpayout: string; cookie: string; sort: string }>) => {
      const next = {
        q: updates.q ?? query,
        category: updates.category ?? selectedCategory,
        type: updates.type ?? selectedType,
        network: updates.network ?? selectedNetwork,
        payout: updates.payout ?? selectedPayout,
        minpayout: updates.minpayout ?? minPayout,
        cookie: updates.cookie ?? cookie,
        sort: updates.sort ?? sort,
        // Keep the reader's page-size choice; drop page, since a changed
        // filter makes the old page number meaningless.
        size: pageSize === 25 ? "" : String(pageSize),
      };
      // Don't include defaults in URL
      if (next.sort === "relevance") next.sort = "";
      syncUrl(next);
    },
    [query, selectedCategory, selectedType, selectedNetwork, selectedPayout, minPayout, cookie, sort, pageSize, syncUrl]
  );

  const filtered = useMemo(
    () =>
      searchPrograms({
        query: query || undefined,
        category: selectedCategory || undefined,
        commissionType: selectedType || undefined,
        network: selectedNetwork || undefined,
        payout: (selectedPayout || undefined) as PayoutMethodFilter | undefined,
        noMinimum: minPayout === "0" || undefined,
        longCookie: cookie !== "" || undefined,
        sort,
        verified: verifiedOnly || undefined,
      }),
    [query, selectedCategory, selectedType, selectedNetwork, selectedPayout, minPayout, cookie, sort, verifiedOnly]
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
    updateFilters({ q: value });
  };
  const handleCategory = (cat: string) => {
    setSelectedCategory(cat);
    updateFilters({ category: cat });
    if (cat) track("filter", { metadata: { filter: "category", value: cat } });
  };
  const handleType = (type: string) => {
    setSelectedType(type);
    updateFilters({ type });
    if (type) track("filter", { metadata: { filter: "type", value: type } });
  };
  const handleSort = (s: string) => {
    setSort(s as SortOption);
    updateFilters({ sort: s });
  };
  // setPageSize already resets the page. Calling setPage(1) after it would
  // rebuild the query string from the pre-change pageSize and undo the choice.
  const handlePageSize = (size: number) => setPageSize(size);
  const handleNetwork = (net: string) => {
    setSelectedNetwork(net);
    updateFilters({ network: net });
    if (net) track("filter", { metadata: { filter: "network", value: net } });
  };
  const handlePayout = (v: string) => {
    setSelectedPayout(v);
    updateFilters({ payout: v });
    if (v) track("filter", { metadata: { filter: "payout", value: v } });
  };
  const handleMinPayout = (v: string) => {
    setMinPayout(v);
    updateFilters({ minpayout: v });
    if (v) track("filter", { metadata: { filter: "minpayout", value: v } });
  };
  const handleCookie = (v: string) => {
    setCookie(v);
    updateFilters({ cookie: v });
    if (v) track("filter", { metadata: { filter: "cookie", value: v } });
  };
  const clearAll = () => {
    setQuery("");
    setSelectedCategory("");
    setSelectedType("");
    setSelectedNetwork("");
    setSelectedPayout("");
    setMinPayout("");
    setCookie("");
    setVerifiedOnly(false);
    setSort("relevance");
    syncUrl({});
  };

  const hasActiveFilters = !!(query || selectedCategory || selectedType || selectedNetwork || selectedPayout || minPayout || cookie || verifiedOnly);
  // One chip per payout or cookie filter that is on, labelled as in its select.
  const termChips = [
    { value: selectedPayout, options: PAYOUT_OPTIONS, clear: () => handlePayout("") },
    { value: minPayout, options: MIN_PAYOUT_OPTIONS, clear: () => handleMinPayout("") },
    { value: cookie, options: COOKIE_OPTIONS, clear: () => handleCookie("") },
  ].filter((c) => c.value);

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
  const networkOptions = [
    { value: "", label: "All Networks" },
    ...networks.map((n) => ({
      value: n,
      label: networkName(n),
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

  // Every active filter as one removable chip, in the order of the filter row.
  const activeChips: { key: string; label: string; clear: () => void }[] = [
    ...(query ? [{ key: "q", label: `“${query}”`, clear: () => handleSearch("") }] : []),
    ...(selectedCategory ? [{ key: "category", label: selectedCategory, clear: () => handleCategory("") }] : []),
    ...(selectedType ? [{ key: "type", label: COMMISSION_TYPE_LABELS[selectedType] ?? selectedType, clear: () => handleType("") }] : []),
    ...(selectedNetwork ? [{ key: "network", label: networkName(selectedNetwork), clear: () => handleNetwork("") }] : []),
    ...termChips.map((c) => ({ key: c.options[0].label, label: c.options.find((o) => o.value === c.value)?.label ?? c.value, clear: c.clear })),
    ...(verifiedOnly ? [{ key: "verified", label: "Verified", clear: () => setVerifiedOnly(false) }] : []),
  ];
  // The Filters button counts what the sheet holds: everything but the search box.
  const filterCount = activeChips.filter((c) => c.key !== "q").length + (sort !== "relevance" ? 1 : 0);
  const verifiedTotal = programs.filter((p) => p.verified).length;

  return (
    // min-h-dvh as on the skeleton: a short filtered list does not pull the
    // footer up into view while the list is still loading.
    <div className="min-h-dvh">
      <header className="oa-band !py-8 md:!py-10">
        <p className="oa-label">Directory</p>
        <h1 className="mt-2 text-title md:text-display font-semibold tracking-[-0.03em]">{programs.length.toLocaleString("en-US")} affiliate programs</h1>
        <p className="mt-1 font-mono text-meta text-muted-foreground tabular-nums">{verifiedTotal.toLocaleString("en-US")} verified</p>
      </header>

      <div className="oa-band !py-4">
        {/* One search on this page: the nav hides its own here. */}
        <div className="flex items-center gap-2 md:items-start">
          <label className="relative flex-1 md:flex-none">
            <span className="sr-only">Search programs</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search programs"
              className="h-10 w-full rounded-lg border border-line-strong bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-foreground/40 md:h-8 md:w-60 md:text-meta"
            />
          </label>
          {/* Phones: one button opens every filter in a bottom sheet. */}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-line-strong bg-card px-3 text-sm font-medium md:hidden"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Filters
            {filterCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-foreground px-1 font-mono text-xs text-background">{filterCount}</span>}
          </button>
          {/* Desktop: the filter row. */}
          <div className="hidden flex-1 flex-wrap items-center gap-2 md:flex">
            <FilterSelect label="Category" value={selectedCategory} onChange={handleCategory} options={categoryOptions} />
            <FilterSelect label="Commission Type" value={selectedType} onChange={handleType} options={typeOptions} />
            <FilterSelect label="Network" value={selectedNetwork} onChange={handleNetwork} options={networkOptions} />
            <FilterSelect label="Payout Method" value={selectedPayout} onChange={handlePayout} options={PAYOUT_OPTIONS} />
            <FilterSelect label="Minimum Payout" value={minPayout} onChange={handleMinPayout} options={MIN_PAYOUT_OPTIONS} />
            <FilterSelect label="Cookie Window" value={cookie} onChange={handleCookie} options={COOKIE_OPTIONS} />
            <button
              type="button"
              aria-pressed={verifiedOnly}
              onClick={() => { setVerifiedOnly(!verifiedOnly); setPage(1); }}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-meta font-medium transition-colors ${
                verifiedOnly ? "border-good-line bg-good-bg text-good" : "border-line-strong bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              Verified
            </button>
            <div className="flex-1" />
            <FilterSelect label="Sort" value={sort} onChange={handleSort} options={sortOptions} />
            <div className="flex items-center overflow-hidden rounded-lg border border-line-strong">
              {(["list", "grid"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-label={v === "list" ? "List view" : "Grid view"}
                  aria-pressed={view === v}
                  className={`flex h-8 w-8 items-center justify-center transition-colors ${view === v ? "bg-sunk text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {v === "list" ? <List className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        {activeChips.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] md:flex-wrap">
            {activeChips.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={c.clear}
                aria-label={`Remove filter ${c.label}`}
                className="inline-flex h-[26px] shrink-0 items-center gap-1 rounded-md border border-line-strong bg-card px-2 text-xs text-foreground/80 hover:text-foreground"
              >
                {c.label}
                <X className="h-3 w-3" aria-hidden />
              </button>
            ))}
            <button type="button" onClick={clearAll} className="shrink-0 px-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
              Clear all
            </button>
          </div>
        )}
      </div>

      <section className="oa-band !pt-5" aria-label="Programs">
        <p className="mb-3 font-mono text-xs text-muted-foreground tabular-nums" aria-live="polite">
          {filtered.length === programs.length ? `${filtered.length.toLocaleString("en-US")} programs` : `${filtered.length.toLocaleString("en-US")} of ${programs.length.toLocaleString("en-US")} programs`}
        </p>

        {paginated.length === 0 ? (
          <div className="rounded-xl border border-border bg-card py-16 text-center">
            <p className="text-sm text-muted-foreground">No programs found. Try a different search or category.</p>
            {hasActiveFilters && (
              <button type="button" onClick={clearAll} className="mt-3 text-xs text-muted-foreground underline hover:text-foreground">
                Clear all filters
              </button>
            )}
          </div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {paginated.map((program) => (
              <ProgramCardGrid key={program.slug} program={program} />
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card [&>div:last-child]:border-b-0">
            <div className="hidden grid-cols-[32px_minmax(0,1fr)_130px_minmax(0,190px)_136px_44px_36px] gap-3 border-b border-border bg-sunk px-3 py-2 md:grid" aria-hidden>
              <span className="oa-label col-span-2">Program</span>
              <span className="oa-label">Category</span>
              <span className="oa-label">Commission</span>
              <span className="oa-label">Cookie</span>
              <span className="oa-label">Score</span>
              <span />
            </div>
            {paginated.map((program) => (
              <ProgramRowList key={program.slug} program={program} />
            ))}
          </div>
        )}

        {/* Pagination + page size */}
        <div className="mt-6 flex flex-col items-center gap-3">
          {totalPages > 1 && (
            <nav className="flex items-center gap-1" aria-label="Pages">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                aria-label="Previous page"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-line-strong text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {pageRange[0] > 1 && (
                <>
                  <button type="button" onClick={() => setPage(1)} className="flex h-8 w-8 items-center justify-center rounded-lg font-mono text-xs text-muted-foreground hover:bg-sunk hover:text-foreground">1</button>
                  {pageRange[0] > 2 && <span className="px-1 text-xs text-muted-foreground">&hellip;</span>}
                </>
              )}
              {pageRange.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  aria-current={p === currentPage ? "page" : undefined}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg font-mono text-xs transition-colors ${
                    p === currentPage ? "border border-line-strong bg-card text-foreground" : "text-muted-foreground hover:bg-sunk hover:text-foreground"
                  }`}
                >
                  {p}
                </button>
              ))}
              {pageRange[pageRange.length - 1] < totalPages && (
                <>
                  {pageRange[pageRange.length - 1] < totalPages - 1 && <span className="px-1 text-xs text-muted-foreground">&hellip;</span>}
                  <button type="button" onClick={() => setPage(totalPages)} className="flex h-8 w-8 items-center justify-center rounded-lg font-mono text-xs text-muted-foreground hover:bg-sunk hover:text-foreground">{totalPages}</button>
                </>
              )}
              <button
                type="button"
                onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage >= totalPages}
                aria-label="Next page"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-line-strong text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </nav>
          )}
          <div className="flex items-center gap-1">
            <span className="mr-1 text-xs text-muted-foreground">Show</span>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => handlePageSize(size)}
                aria-pressed={pageSize === size}
                className={`rounded px-2 py-0.5 font-mono text-xs transition-colors ${pageSize === size ? "bg-sunk text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      </section>

      {sheetOpen && (
        <FilterSheet
          onClose={closeSheet}
          resultCount={filtered.length}
          onClear={clearAll}
          sort={sort}
          onSort={handleSort}
          type={selectedType}
          onType={handleType}
          verifiedOnly={verifiedOnly}
          onVerified={(v) => { setVerifiedOnly(v); setPage(1); }}
          category={selectedCategory}
          onCategory={handleCategory}
          network={selectedNetwork}
          onNetwork={handleNetwork}
          networkOptions={networkOptions}
          payout={selectedPayout}
          onPayout={handlePayout}
          minPayout={minPayout}
          onMinPayout={handleMinPayout}
          cookie={cookie}
          onCookie={handleCookie}
        />
      )}
    </div>
  );
}

/** A pressed-state chip for the sheet: one tap sets or clears a value. */
function SheetChip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-meta transition-colors ${
        pressed ? "border-foreground bg-card text-foreground font-medium" : "border-line-strong bg-card text-foreground/80"
      }`}
    >
      {children}
    </button>
  );
}

function SheetGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-t border-border py-3">
      <legend className="sr-only">{label}</legend>
      <p className="oa-label mb-2" aria-hidden>{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  );
}

/**
 * Phones: every filter in a bottom sheet (redesign r3, D4). Filters apply as
 * they are tapped; the button only closes the sheet. Escape and the scrim close
 * it too, focus moves into it on open and back to the page on close.
 */
function FilterSheet(props: {
  onClose: () => void;
  resultCount: number;
  onClear: () => void;
  sort: SortOption;
  onSort: (v: string) => void;
  type: string;
  onType: (v: string) => void;
  verifiedOnly: boolean;
  onVerified: (v: boolean) => void;
  category: string;
  onCategory: (v: string) => void;
  network: string;
  onNetwork: (v: string) => void;
  networkOptions: { value: string; label: string; count?: number }[];
  payout: string;
  onPayout: (v: string) => void;
  minPayout: string;
  onMinPayout: (v: string) => void;
  cookie: string;
  onCookie: (v: string) => void;
}) {
  // A native modal dialog: showModal() keeps keyboard focus inside and makes the page behind
  // inert; Escape arrives as "cancel". Opened once on mount, so a filter change (a re-render
  // with new props) never moves focus. The latest onClose is read through a ref.
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(props.onClose);
  useEffect(() => { onCloseRef.current = props.onClose; }, [props.onClose]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!dialog.open) dialog.showModal();
    const onCancel = (e: Event) => { e.preventDefault(); onCloseRef.current(); };
    dialog.addEventListener("cancel", onCancel);
    return () => {
      dialog.removeEventListener("cancel", onCancel);
      if (dialog.open) dialog.close();
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, []);
  const onClose = props.onClose;
  const toggle = (current: string, value: string, set: (v: string) => void) => set(current === value ? "" : value);

  return (
    <dialog
        ref={dialogRef}
        aria-labelledby="filter-sheet-title"
        // A click on the backdrop lands on the dialog element itself.
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        className="md:hidden fixed inset-x-0 bottom-0 top-auto m-0 flex max-h-[85dvh] w-full max-w-none flex-col rounded-t-[14px] border-0 border-t border-line-strong bg-card p-0 text-foreground shadow-[0_-12px_40px_rgb(0_0_0/0.18)] backdrop:bg-black/35 focus:outline-none [&:not([open])]:hidden"
      >
        <div className="mx-auto mt-3 h-1 w-9 rounded-full bg-line-strong" aria-hidden />
        <div className="flex items-center justify-between px-4 pt-2 pb-3">
          <h2 id="filter-sheet-title" className="text-lg font-semibold">Filters</h2>
          <button type="button" onClick={onClose} aria-label="Close filters" className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4">
          <SheetGroup label="Sort by">
            {SORT_OPTIONS.map((o) => (
              <SheetChip key={o.value} pressed={props.sort === o.value} onClick={() => props.onSort(o.value)}>{o.label}</SheetChip>
            ))}
          </SheetGroup>
          <SheetGroup label="Commission">
            {commissionTypes.map((t) => (
              <SheetChip key={t} pressed={props.type === t} onClick={() => toggle(props.type, t, props.onType)}>{COMMISSION_TYPE_LABELS[t] ?? t}</SheetChip>
            ))}
          </SheetGroup>
          <SheetGroup label="Terms">
            <SheetChip pressed={props.verifiedOnly} onClick={() => props.onVerified(!props.verifiedOnly)}>Verified</SheetChip>
            {PAYOUT_OPTIONS.slice(1).map((o) => (
              <SheetChip key={o.value} pressed={props.payout === o.value} onClick={() => toggle(props.payout, o.value, props.onPayout)}>{o.label}</SheetChip>
            ))}
            {MIN_PAYOUT_OPTIONS.slice(1).map((o) => (
              <SheetChip key={o.value} pressed={props.minPayout === o.value} onClick={() => toggle(props.minPayout, o.value, props.onMinPayout)}>{o.label}</SheetChip>
            ))}
            {COOKIE_OPTIONS.slice(1).map((o) => (
              <SheetChip key={o.value} pressed={props.cookie === o.value} onClick={() => toggle(props.cookie, o.value, props.onCookie)}>{o.label}</SheetChip>
            ))}
          </SheetGroup>
          <SheetGroup label="Network">
            <FilterSelect label="Network" value={props.network} onChange={props.onNetwork} options={props.networkOptions} className="w-full [&_select]:h-10 [&_select]:w-full [&_select]:text-sm" />
          </SheetGroup>
          <SheetGroup label="Category">
            {categories.map((cat) => (
              <SheetChip key={cat} pressed={props.category === cat} onClick={() => toggle(props.category, cat, props.onCategory)}>
                {cat} <span className="font-mono text-xs text-muted-foreground">{categoryCounts[cat] ?? 0}</span>
              </SheetChip>
            ))}
          </SheetGroup>
        </div>
        <div className="flex gap-2 border-t border-border px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={props.onClear} className="h-11 rounded-lg border border-line-strong px-4 text-sm font-medium">Clear all</button>
          <button type="button" onClick={onClose} className="h-11 flex-1 rounded-lg bg-foreground text-sm font-medium text-background">
            Show {props.resultCount.toLocaleString("en-US")} programs
          </button>
        </div>
    </dialog>
  );
}
