import Link from "next/link";
import { OasGradeChip } from "@/components/oas-grade";
import { commissionChip, cookieChip } from "@/lib/program-chips";
import type { ProgramsHub } from "@/lib/programs-directory";

/**
 * The top programs by OAS as a server-rendered table, so each row is a plain
 * link in the page's raw HTML. Plain <a>, not <Link>: no viewport prefetch of
 * 100 program pages. Commission and cookie come from the structured fields
 * through the chips every list uses (cookie stays unconfirmed when unverified).
 */
export function TopPrograms({ rows }: { rows: ProgramsHub["top"] }) {
  if (rows.length === 0) return null;
  return (
    <section id="top-programs" aria-labelledby="top-programs-h" className="oa-band">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="top-programs-h" className="text-title font-semibold tracking-[-0.02em]">Top {rows.length} affiliate programs by OAS</h2>
        <Link href="/rankings/leaderboard" className="text-meta text-muted-foreground underline underline-offset-2 hover:text-foreground">
          Full leaderboard
        </Link>
      </div>
      <p className="mt-1 max-w-3xl text-meta text-muted-foreground">
        OAS, the OpenAffiliate Score, rates how clearly each program publishes its terms and protects its partners.{" "}
        <Link href="/methodology#oas" className="underline underline-offset-2 hover:text-foreground">How OAS works</Link>
      </p>
      <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-sunk text-left">
            <tr className="[&_th]:oa-label [&_th]:px-3 [&_th]:py-2">
              <th scope="col" className="w-10">#</th>
              <th scope="col">Program</th>
              <th scope="col">Commission</th>
              <th scope="col" className="hidden sm:table-cell">Cookie</th>
              <th scope="col">OAS</th>
              <th scope="col" className="hidden md:table-cell">Verified</th>
            </tr>
          </thead>
          <tbody className="[&_td]:px-3 [&_td]:py-2.5 [&_tr]:border-t [&_tr]:border-border">
            {rows.map(({ program: p, rank, oas, checked }) => (
              <tr key={p.slug}>
                <td className="font-mono text-meta text-muted-foreground tabular-nums">{rank}</td>
                <td>
                  <ProgramLink slug={p.slug} name={p.name} />
                </td>
                <td className="text-foreground/80">{commissionChip(p.commission)}</td>
                <td className="hidden whitespace-nowrap text-foreground/80 sm:table-cell">{cookieChip(p)}</td>
                <td>
                  <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                    {oas}
                    <OasGradeChip score={oas} />
                  </span>
                </td>
                <td className="hidden whitespace-nowrap font-mono text-meta text-muted-foreground tabular-nums md:table-cell">
                  {p.verified && checked ? <time dateTime={checked}>{checked}</time> : "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProgramLink({ slug, name }: { slug: string; name: string }) {
  return <a href={`/programs/${slug}`} className="font-medium hover:underline underline-offset-2">{name}</a>;
}
