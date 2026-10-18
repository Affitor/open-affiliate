import { programs } from "@/lib/programs";
import { directoryGroups } from "@/lib/programs-directory";
import { ProgramsView } from "./programs-view";
import { SameTeamTag } from "@/components/same-team-tag";
import { isSameTeam } from "@/lib/same-team";

/**
 * The interactive list renders in the browser (it reads the URL inside its
 * own Suspense), so its programs are not in the prerendered HTML. The A–Z
 * directory is a server-rendered sibling outside that Suspense: every live
 * program gets a plain link a crawler can follow. Plain <a>, not <Link>: no
 * hydration and no viewport prefetch of ~1,000 dynamic program pages. No
 * #letter jump links: a hash entry has no Next history state, so jump, open a
 * program, Back left the program page on screen (measured on the preview).
 */
export default function ProgramsPage() {
  const groups = directoryGroups(programs);
  return (
    <>
      <ProgramsView />
      <section id="all-programs" aria-labelledby="all-programs-h" className="mx-auto max-w-6xl px-6 pb-16">
        <h2 id="all-programs-h" className="text-lg font-semibold tracking-tight">All affiliate programs A–Z</h2>
        <div className="mt-6 space-y-6 text-sm text-muted-foreground [&_a:hover]:text-foreground [&_h3]:mb-2 [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:uppercase [&_h3]:text-foreground [&_ul]:columns-2 sm:[&_ul]:columns-3 lg:[&_ul]:columns-4 [&_ul]:gap-6 [&_li]:break-inside-avoid [&_li]:py-0.5">
          {groups.map((g) => (
            <div key={g.letter}>
              <h3>{g.letter === "#" ? "0–9 and other" : g.letter.toUpperCase()}</h3>
              <ul>
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
    </>
  );
}

/**
 * One A–Z link. Its own component so the page payload carries only what it
 * renders: a tag slot in every row added a null to each of the 1,100 entries.
 */
function DirectoryEntry({ slug, name }: { slug: string; name: string }) {
  const link = <a href={`/programs/${slug}`}>{name}</a>;
  return isSameTeam(slug) ? (
    <>
      {link}
      <SameTeamTag slug={slug} className="ml-1" />
    </>
  ) : (
    link
  );
}
