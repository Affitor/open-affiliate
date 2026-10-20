"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { ProgramLogo } from "@/components/program-logo";
import { OasGradeChip } from "@/components/oas-grade";

export type LeaderRow = {
  slug: string;
  name: string;
  domain: string;
  category: string;
  categorySlug: string;
  network: string;
  oas: number | null;
  /** Overall position, unique; null when not ranked. */
  rank: number | null;
  status: "checking" | "no-apply-link" | null;
  checked: string;
};

const HEAD = "py-3 px-3 font-mono text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground";

/**
 * The whole board, in /rankings order (compareBoard in src/lib/oas.ts: OAS,
 * Partner value, newest verification, name), then programs still scoring. A
 * category tab ranks within the category in the same order, as the boxes on
 * /rankings do; every position is unique. The tab lives in the URL
 * (?category=<slug>) so a category box links straight to it.
 */
export function LeaderboardTable({
  rows,
  tabs,
  basePath = "/rankings/leaderboard",
  search = true,
  limit,
}: {
  rows: LeaderRow[];
  tabs: { name: string; slug: string }[];
  /** Where the category tabs point: the full page, or /rankings to filter in place. */
  basePath?: string;
  /** /rankings has its own single input on top (Score your program), so its table has none. */
  search?: boolean;
  /** Show the first `limit` rows and a link to the full leaderboard. */
  limit?: number;
}) {
  const params = useSearchParams();
  const category = tabs.find((t) => t.slug === params.get("category"))?.slug ?? "";
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const inTab = category ? rows.filter((r) => r.categorySlug === category) : rows;
  const ranked = inTab.filter((r) => r.rank != null);
  // Within a category: the row's own position in the board's order (positions are unique).
  const rankOf = (r: LeaderRow) => (r.rank == null ? null : category ? ranked.indexOf(r) + 1 : r.rank);
  const matched = q ? inTab.filter((r) => r.name.toLowerCase().includes(q) || r.domain.includes(q)) : inTab;
  const shown = limit ? matched.slice(0, limit) : matched;
  const full = category ? `/rankings/leaderboard?category=${category}` : "/rankings/leaderboard";

  const tab = (slug: string, label: string, count: number) => (
    <Link
      key={slug || "all"}
      href={slug ? `${basePath}?category=${slug}` : basePath}
      scroll={false}
      aria-current={category === slug ? "page" : undefined}
      className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
        category === slug
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-line-strong"
      }`}
    >
      {label}
      <span className="ml-1.5 tabular-nums">{count}</span>
    </Link>
  );

  return (
    <div className="mt-8">
      <nav aria-label="Category" className="flex flex-wrap gap-2">
        {tab("", "All", rows.filter((r) => r.rank != null).length)}
        {tabs.map((t) => tab(t.slug, t.name, rows.filter((r) => r.categorySlug === t.slug && r.rank != null).length))}
      </nav>

      {search && <div className="relative mt-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search programs or domains..."
          aria-label="Search programs or domains"
          className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>}

      <div className="mt-4 rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-sunk">
                <th className={`w-12 text-center ${HEAD}`}>#</th>
                <th className={`text-left ${HEAD}`}>Program</th>
                <th className={`text-left hidden md:table-cell ${HEAD}`}>Category</th>
                <th className={`text-left hidden sm:table-cell ${HEAD}`}>Network</th>
                <th className={`text-right ${HEAD}`}>OAS</th>
                <th className={`text-left hidden md:table-cell ${HEAD}`}>Verified</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const rank = rankOf(r);
                return (
                  <tr key={r.slug} className="border-t border-border hover:bg-sunk transition-colors">
                    <td className="py-3 px-3 text-center font-mono text-meta text-muted-foreground tabular-nums">{rank ?? "–"}</td>
                    <td className="w-full max-w-0 py-3 px-3">
                      <Link href={`/programs/${r.slug}/oas`} className="flex min-w-0 items-center gap-2.5 hover:underline underline-offset-2">
                        <ProgramLogo slug={r.slug} name={r.name} size={24} className="shrink-0 rounded-md border border-border bg-white" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{r.name}</span>
                          {r.domain && <span className="block truncate text-meta text-muted-foreground">{r.domain}</span>}
                          {/* The Verified column is hidden on narrow screens; the date stays on every row. */}
                          {r.checked && <span className="block text-meta text-muted-foreground md:hidden">Verified <time dateTime={r.checked}>{r.checked}</time></span>}
                        </span>
                      </Link>
                    </td>
                    <td className="py-3 px-3 hidden md:table-cell whitespace-nowrap text-muted-foreground">
                      <Link href={`/rankings/leaderboard?category=${r.categorySlug}`} scroll={false} className="hover:text-foreground hover:underline underline-offset-2">
                        {r.category}
                      </Link>
                    </td>
                    <td className="py-3 px-3 hidden sm:table-cell whitespace-nowrap text-muted-foreground">{r.network}</td>
                    <td className="py-3 px-3 text-right whitespace-nowrap font-mono tabular-nums">
                      {rank != null ? <span className="inline-flex items-center gap-1.5">{r.oas}<OasGradeChip score={r.oas!} /></span> : <span className="text-muted-foreground">{r.status === "checking" ? "In progress" : "Not ranked"}</span>}
                    </td>
                    <td className="py-3 px-3 hidden md:table-cell whitespace-nowrap font-mono text-sm tabular-nums text-muted-foreground">
                      {r.checked ? <time dateTime={r.checked}>{r.checked}</time> : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {shown.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">No scored program matches.</p>}
      </div>
      {limit && matched.length > limit && (
        <Link href={full} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 text-sm font-medium hover:bg-sunk transition-colors">
          View full leaderboard <span aria-hidden>→</span>
        </Link>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        {ranked.length} ranked{inTab.length > ranked.length ? `, ${inTab.length - ranked.length} still scoring or without a public application link` : ""}.
        Ranking needs a score, a public application link and terms verified in the last 90 days.
      </p>
    </div>
  );
}
