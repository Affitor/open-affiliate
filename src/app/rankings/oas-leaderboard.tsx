import Link from "next/link";
import { ProgramLogo } from "@/components/program-logo";
import { categoryToSlug } from "@/lib/programs";
import type { BoardRow } from "@/lib/oas";
import { OasGradeChip } from "@/components/oas-grade";
import { ShareButton } from "@/components/share-button";

const TOP = 5;

function Row({ r, rank }: { r: BoardRow; rank: number | null }) {
  return (
    <li className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 py-2.5 border-b border-border">
      <span className="font-mono text-meta text-muted-foreground">{rank ?? "–"}</span>
      <Link href={`/programs/${r.program.slug}/oas`} className="flex min-w-0 items-center gap-2.5 hover:underline underline-offset-2">
        <ProgramLogo slug={r.program.slug} name={r.program.name} size={24} className="shrink-0 rounded-md border border-border bg-white" />
        <span className="truncate">{r.program.name}</span>
      </Link>
      <span className={`inline-flex items-center gap-1.5 font-mono text-sm ${r.rank == null ? "text-muted-foreground" : ""}`}>{r.rank != null ? <>{r.oas}<OasGradeChip score={r.oas!} /></> : r.unranked === "checking" ? "In progress" : "Not ranked"}</span>
    </li>
  );
}

/**
 * OAS by category: each category's top 5 ranked, then programs still scoring; `limit` keeps
 * the categories with the most ranked programs (Sơn 19/10 13:1x: six cards on /rankings). The
 * category name opens its tab of the full leaderboard. Every program is ranked by the
 * same rules, whoever runs it.
 */
export function OasLeaderboard({ board, limit }: { board: BoardRow[]; limit?: number }) {
  if (board.length === 0) return null;
  const categories = [...new Set(board.map((r) => r.program.category))]
    .map((c) => ({ name: c, rows: board.filter((r) => r.program.category === c) }))
    .map((c) => ({ ...c, ranked: c.rows.filter((r) => r.rank != null) }))
    .sort((a, b) => b.ranked.length - a.ranked.length || a.name.localeCompare(b.name))
    .slice(0, limit);

  return (
    <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((c) => {
          const rows = [...c.ranked.slice(0, TOP), ...c.rows.filter((r) => r.rank == null)].slice(0, TOP);
          return (
            <div key={c.name}>
              <div className="flex items-baseline justify-between border-b border-line-strong pb-2">
                <h3 className="oa-label">
                  <Link href={`/rankings/leaderboard?category=${categoryToSlug(c.name)}`} className="hover:text-foreground hover:underline underline-offset-2">{c.name}</Link>
                </h3>
                <span className="inline-flex items-center gap-1.5">
                  <span className="oa-label">{c.ranked.length} ranked</span>
                  <ShareButton iconOnly path={`/rankings/leaderboard?category=${categoryToSlug(c.name)}`} title={`${c.name} affiliate programs by OAS`} />
                </span>
              </div>
              {/* Rank within the category: equal OAS share it, as on the report. */}
              <ol>{rows.map((r) => <Row key={r.program.slug} r={r} rank={r.rank == null ? null : c.ranked.findIndex((x) => x.oas === r.oas) + 1} />)}</ol>
              {c.ranked.length < TOP && <p className="text-meta text-muted-foreground mt-2">Fewer than {TOP} ranked, so no &ldquo;top {TOP}&rdquo; claim yet.</p>}
            </div>
          );
        })}
    </div>
  );
}
