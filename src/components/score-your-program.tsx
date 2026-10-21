"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search } from "lucide-react";
import { ProgramLogo } from "@/components/program-logo";
import { OasGradeChip } from "@/components/oas-grade";
import { matchPrograms, type ScoreEntry } from "@/lib/score-index";

/** Where a match leads: its OAS report, or the program page while it has none. */
const hrefOf = ([slug, , , oas]: ScoreEntry) => (oas === null ? `/programs/${slug}` : `/programs/${slug}/oas`);

/**
 * "Score your program": a brand name or domain, matched against the registry
 * the server sent. Nothing is fetched and nothing is scored on demand; a
 * program that is not listed is pointed to /submit.
 */
export function ScoreYourProgram({ index, compact = false, className = "" }: { index: ScoreEntry[]; compact?: boolean; className?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const matches = matchPrograms(index, query);
  const typed = query.trim().length >= 2;

  return (
    <div className={compact ? className : `rounded-xl border border-border bg-card p-4 sm:p-5 ${className}`}>
      {!compact && <h2 className="text-subtitle font-semibold">Score your program</h2>}
      {!compact && <p className="text-sm text-muted-foreground mt-1">Type your brand or domain to see its OAS and how to raise it.</p>}
      <form
        role="search"
        className={compact ? "relative" : "relative mt-3"}
        onSubmit={(e) => {
          e.preventDefault();
          if (matches[0]) router.push(hrefOf(matches[0]));
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={compact ? "Score your program: type a brand or domain" : "e.g. Cal.com or cal.com"}
          aria-label="Score your program: brand name or domain"
          autoComplete="off"
          className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </form>
      {typed && (
        <div aria-live="polite">
          {matches.length > 0 ? (
            <ul className="mt-2 divide-y divide-border">
              {matches.map((m) => {
                const [slug, name, domain, oas] = m;
                return (
                  <li key={slug}>
                    <Link href={hrefOf(m)} className="flex items-center gap-3 py-2.5 hover:bg-sunk rounded-md px-1">
                      <ProgramLogo slug={slug} name={name} size={24} className="shrink-0 rounded-md border border-border bg-white" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{name}</span>
                        {domain && <span className="block truncate text-meta text-muted-foreground">{domain}</span>}
                      </span>
                      <span className="shrink-0 font-mono text-sm">
                        {typeof oas === "number" ? <span className="inline-flex items-center gap-1.5">OAS {oas}<OasGradeChip score={oas} /></span> : <span className="text-muted-foreground">{oas === "scoring" ? "Scoring in progress" : "Not scored yet"}</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Not listed yet.{" "}
              <Link href="/submit" className="underline underline-offset-2 hover:text-foreground">
                Submit your program
              </Link>{" "}
              and it is scored once its terms are verified.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
