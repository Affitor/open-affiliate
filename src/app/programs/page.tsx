"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProgramLogo } from "@/components/program-logo";
import { programs, categories, searchPrograms } from "@/lib/programs";

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

const SEARCH_SUGGESTIONS = [
  "email marketing",
  "database",
  "design",
  "AI tools",
  "hosting",
  "video",
  "SEO",
];

export default function ProgramsPage() {
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [searchFocused, setSearchFocused] = useState(false);

  const filtered = useMemo(
    () => searchPrograms(query, selectedCategory),
    [query, selectedCategory]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleSearch = (value: string) => {
    setQuery(value);
    setPage(1);
  };
  const handleCategory = (cat: string) => {
    setSelectedCategory(selectedCategory === cat ? "" : cat);
    setPage(1);
  };
  const handlePageSize = (size: number) => {
    setPageSize(size);
    setPage(1);
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      {/* Header + Search */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Programs</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {programs.length} affiliate programs — curated, verified, and
          agent-ready
        </p>

        {/* Search bar */}
        <div className="mt-6 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, category, or keyword..."
            className="w-full h-12 pl-12 pr-4 rounded-xl border border-border/50 bg-muted/30 text-sm focus:outline-none focus:border-border focus:bg-muted/50 transition-colors"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
          />

          {/* Keyword suggestions */}
          {searchFocused && !query && (
            <div className="absolute top-full left-0 right-0 mt-2 rounded-xl border border-border/50 bg-card p-3 z-10">
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide mb-2">
                Popular searches
              </p>
              <div className="flex flex-wrap gap-2">
                {SEARCH_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSearch(s);
                    }}
                    className="rounded-lg px-3 py-1.5 text-xs bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Category filters — wrapping grid */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => {
            setSelectedCategory("");
            setPage(1);
          }}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            !selectedCategory
              ? "bg-foreground text-background"
              : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => handleCategory(cat)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              selectedCategory === cat
                ? "bg-foreground text-background"
                : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Results count */}
      <p className="text-xs text-muted-foreground mb-4">
        {filtered.length === programs.length
          ? `${filtered.length} programs`
          : `${filtered.length} of ${programs.length} programs`}
      </p>

      {/* Results */}
      <div className="space-y-2">
        {paginated.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm text-muted-foreground">
              No programs found. Try a different search or category.
            </p>
            {query && (
              <button
                onClick={() => handleSearch("")}
                className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors underline"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          paginated.map((program) => (
            <Link
              key={program.slug}
              href={`/programs/${program.slug}`}
              className="glow-card group flex items-center gap-4 rounded-xl border border-border/40 bg-card/30 p-4 transition-all hover:border-border hover:bg-card/60"
            >
              <ProgramLogo
                slug={program.slug}
                name={program.name}
                size={44}
                className="shrink-0"
              />

              <div className="flex-1 min-w-0">
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
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {program.shortDescription}
                </p>
              </div>

              <div className="hidden sm:flex items-center gap-3 shrink-0">
                <Badge variant="secondary" className="text-[11px]">
                  {program.commission.rate}%{" "}
                  {program.commission.type === "recurring"
                    ? "recurring"
                    : "one-time"}
                </Badge>
                <Badge variant="outline" className="text-[11px]">
                  {program.cookieDays}d
                </Badge>
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Pagination + page size — together at bottom */}
      <div className="flex flex-col items-center gap-3 mt-8">
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
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

      {/* CLI hint */}
      <div className="mt-10 rounded-xl border border-border/40 bg-muted/20 p-6">
        <h3 className="text-sm font-semibold">Search from CLI</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Use the CLI to search and filter programs from your terminal or AI
          agent.
        </p>
        <div className="mt-3 overflow-x-auto rounded-lg bg-zinc-950 border border-border/50">
          <code className="block px-4 py-2.5 text-xs font-mono text-muted-foreground whitespace-nowrap">
            npx openaffiliate search &quot;database&quot; --min-commission 10 --type recurring
          </code>
        </div>
      </div>
    </div>
  );
}
