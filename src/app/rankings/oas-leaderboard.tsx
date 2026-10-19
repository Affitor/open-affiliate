import Link from "next/link";
import { ProgramLogo } from "@/components/program-logo";
import { TEAM_DISCLOSURE, type BoardRow } from "@/lib/oas";

const TOP = 5;

function Row({ r, rank }: { r: BoardRow; rank: number | null }) {
  return (
    <li className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 py-2.5 border-b border-border">
      <span className="font-mono text-meta text-muted-foreground">{rank ?? "–"}</span>
      <Link href={`/programs/${r.program.slug}/oas`} className="flex min-w-0 items-center gap-2.5 hover:underline underline-offset-2">
        <ProgramLogo slug={r.program.slug} name={r.program.name} size={24} className="shrink-0 rounded-md border border-border bg-white" />
        <span className="truncate">{r.program.name}</span>
      </Link>
      <span className={`font-mono text-sm ${r.rank == null ? "text-muted-foreground" : ""}`}>{r.rank != null ? r.oas : r.unranked === "checking" ? "In progress" : "Not ranked"}</span>
    </li>
  );
}

/** OAS leaderboard by category: top 5 ranked, then programs still scoring. */
export function OasLeaderboard({ board }: { board: BoardRow[] }) {
  if (board.length === 0) return null;
  const listed = board;
  const ranked = listed.filter((r) => r.rank != null);
  const scoring = listed.filter((r) => r.unranked === "checking");
  const latest = board.map((r) => r.score.checked_at).sort().at(-1)!;
  const categories = [...new Set(listed.map((r) => r.program.category))]
    .map((c) => ({ name: c, rows: listed.filter((r) => r.program.category === c) }))
    .map((c) => ({ ...c, ranked: c.rows.filter((r) => r.rank != null) }))
    .sort((a, b) => b.ranked.length - a.ranked.length || a.name.localeCompare(b.name));

  return (
    <section aria-labelledby="oas-h" className="mb-12">
      <p className="oa-label">OAS leaderboard</p>
      <h2 id="oas-h" className="text-title font-semibold tracking-[-0.02em] mt-1.5">Ranked by OAS</h2>
      <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
        OAS, the OpenAffiliate Score: how clearly a program publishes its terms and protects its partners, from the terms we verified on its own page. Nobody pays to rank.
      </p>
      <dl className="mt-5 inline-grid grid-cols-3 rounded-xl border border-border bg-card divide-x divide-border">
        <div className="px-4 py-3"><dt className="oa-label">Ranked</dt><dd className="font-mono text-subtitle mt-0.5">{ranked.length}</dd></div>
        <div className="px-4 py-3"><dt className="oa-label">Scoring in progress</dt><dd className="font-mono text-subtitle mt-0.5">{scoring.length}</dd></div>
        <div className="px-4 py-3"><dt className="oa-label">Last verified</dt><dd className="font-mono text-subtitle mt-0.5">{new Date(latest).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</dd></div>
      </dl>

      <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 mt-8">
        {categories.map((c) => {
          const rows = [...c.ranked.slice(0, TOP), ...c.rows.filter((r) => r.rank == null)].slice(0, TOP);
          return (
            <div key={c.name}>
              <div className="flex items-baseline justify-between border-b border-line-strong pb-2">
                <h3 className="oa-label">{c.name}</h3>
                <span className="oa-label">{c.ranked.length} ranked</span>
              </div>
              {/* Rank within the category: equal OAS share it, as on the report. */}
              <ol>{rows.map((r) => <Row key={r.program.slug} r={r} rank={r.rank == null ? null : c.ranked.findIndex((x) => x.oas === r.oas) + 1} />)}</ol>
              {c.ranked.length < TOP && <p className="text-meta text-muted-foreground mt-2">Fewer than {TOP} ranked, so no &ldquo;top {TOP}&rdquo; claim yet.</p>}
            </div>
          );
        })}
      </div>

      <p className="text-meta text-muted-foreground mt-6 max-w-3xl">
        Ranking needs a score, a public application link and terms verified in the last 90 days; equal scores share a rank. A term that is not published scores 0 until it is. Not scored: commission size, recurring or one-time, popularity or payment to OpenAffiliate. {TEAM_DISCLOSURE}
      </p>
    </section>
  );
}
