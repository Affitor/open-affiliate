import type { Metadata } from "next";
import { programs, livePrograms } from "@/lib/programs";
import { directoryGroups } from "@/lib/programs-directory";
import { LetterBar } from "./letter-bar";

export const metadata: Metadata = {
  title: "All Affiliate Programs A to Z",
  description: `Every one of the ${livePrograms.length.toLocaleString("en-US")} live affiliate programs on OpenAffiliate, by name from A to Z, each linking its terms page.`,
  alternates: {
    canonical: "/programs/a-z",
    types: { "text/markdown": "https://openaffiliate.dev/programs/a-z.md" },
  },
  openGraph: {
    title: "All Affiliate Programs A to Z | OpenAffiliate",
    url: "https://openaffiliate.dev/programs/a-z",
    siteName: "OpenAffiliate",
    images: ["/opengraph-image"],
  },
};

const letterId = (letter: string) => `letter-${letter === "#" ? "0" : letter}`;

/**
 * Every live program as a plain link a crawler can follow, in directory
 * order (programs-directory.ts). Plain <a>, not <Link>: no hydration and no
 * viewport prefetch of ~1,100 program pages. The section holds no other
 * <section>: verify-machine-surfaces reads it up to its first </section>.
 */
export default function ProgramsAzPage() {
  const groups = directoryGroups(programs);
  return (
    <div className="oa-frame">
      <header className="oa-band !py-8 md:!py-10">
        <p className="oa-label">Directory</p>
        <h1 id="all-programs-h" className="mt-2 text-title md:text-display font-semibold tracking-[-0.03em]">All affiliate programs A–Z</h1>
        <p className="mt-1 font-mono text-meta text-muted-foreground tabular-nums">{livePrograms.length.toLocaleString("en-US")} programs on one page</p>
        <div className="mt-5">
          <LetterBar letters={groups.map((g) => ({ id: letterId(g.letter), label: g.letter === "#" ? "0–9" : g.letter }))} />
        </div>
      </header>
      <section id="all-programs" aria-labelledby="all-programs-h" className="oa-band">
        <div className="space-y-8">
          {groups.map((g) => (
            <div key={g.letter}>
              <h2 id={letterId(g.letter)} tabIndex={-1} className="oa-label scroll-mt-20 border-b border-line-strong pb-2 focus:outline-none">
                {g.letter === "#" ? "0–9 and other" : g.letter.toUpperCase()}
              </h2>
              <ul className="mt-2 columns-2 gap-6 text-sm text-foreground/80 sm:columns-3 lg:columns-4 [&_a:hover]:text-foreground [&_a:hover]:underline [&_li]:break-inside-avoid [&_li]:py-1">
                {g.programs.map((p) => (
                  <li key={p.slug}>
                    <DirectoryEntry slug={p.slug} name={p.name} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * One A–Z link. Its own component so the page payload carries only what it
 * renders: a tag slot in every row added a null to each of the 1,100 entries.
 */
function DirectoryEntry({ slug, name }: { slug: string; name: string }) {
  return <a href={`/programs/${slug}`}>{name}</a>;
}
