"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

/** One program row: what each cell shows, and the key it sorts by (null sorts last either way). */
export interface TermsRow {
  slug: string;
  name: string;
  logo: React.ReactNode;
  cells: { text: string; sort: string | number | null }[];
}

export interface TermsColumn {
  name: string;
  /** Mono for figures and dates. */
  mono?: boolean;
  /** Shown in the stacked mobile row too; the rest stay in the program's section. */
  mobile?: boolean;
}

/**
 * The standard post's side-by-side table. Desktop: a table whose headers
 * sort it (the page order first, then by the column, then reversed). Mobile:
 * the same rows stacked, each linking to the program's section on the page.
 * Rendered on the server with the page order, so it works without script.
 */
export function SortableTermsTable({ columns, rows }: { columns: TermsColumn[]; rows: TermsRow[] }) {
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const sorted = sort
    ? [...rows].sort((a, b) => {
        const x = sort.col < 0 ? a.name : a.cells[sort.col].sort;
        const y = sort.col < 0 ? b.name : b.cells[sort.col].sort;
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "en", { sensitivity: "base" });
        return c * sort.dir;
      })
    : rows;
  const next = (col: number) => setSort((s) => (s && s.col === col ? (s.dir === 1 ? { col, dir: -1 } : null) : { col, dir: 1 }));
  const header = (name: string, col: number) => {
    const active = sort?.col === col;
    const Icon = !active ? ArrowUpDown : sort!.dir === 1 ? ArrowUp : ArrowDown;
    return (
      <th key={name} scope="col" aria-sort={active ? (sort!.dir === 1 ? "ascending" : "descending") : "none"} className="oa-label bg-sunk px-3 py-2.5 text-left font-medium whitespace-nowrap">
        <button type="button" onClick={() => next(col)} className="inline-flex items-center gap-1 hover:text-foreground">
          {name}
          <Icon className="size-3" aria-hidden />
        </button>
      </th>
    );
  };

  return (
    <>
      <div className="mt-4 hidden overflow-x-auto rounded-xl border border-border bg-card md:block" tabIndex={0} aria-label="Programs side by side">
        <table data-terms-table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {header("Program", -1)}
              {columns.map((c, i) => header(c.name, i))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.slug} className="border-t border-border align-top hover:bg-sunk transition-colors">
                <th scope="row" className="px-3 py-3 text-left font-normal">
                  <a href={`#${r.slug}`} className="flex items-center gap-2 text-sm font-medium hover:underline underline-offset-4">
                    {r.logo}
                    {r.name}
                  </a>
                </th>
                {r.cells.map((cell, i) => (
                  <td key={columns[i].name} className={`px-3 py-3 text-sm text-foreground/80 ${columns[i].mono ? "font-mono text-meta whitespace-nowrap" : ""}`}>
                    {cell.text}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul data-terms-stack className="mt-4 overflow-hidden rounded-xl border border-border bg-card md:hidden">
        {rows.map((r) => (
          <li key={r.slug} className="border-t border-border first:border-t-0">
            <a href={`#${r.slug}`} className="block px-4 py-3 hover:bg-sunk transition-colors">
              <span className="flex items-center gap-2 text-sm font-semibold">
                {r.logo}
                {r.name}
              </span>
              <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                {r.cells.map((cell, i) =>
                  columns[i].mobile ? (
                    <div key={columns[i].name} className="contents">
                      <dt className="text-muted-foreground">{columns[i].name}</dt>
                      <dd className="text-foreground/80">{cell.text}</dd>
                    </div>
                  ) : null,
                )}
              </dl>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
