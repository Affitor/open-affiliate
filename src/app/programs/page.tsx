import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { livePrograms, programs } from "@/lib/programs";
import { programsHub } from "@/lib/programs-directory";
import { serializeJsonLd } from "@/lib/json-ld";
import { FaqAccordion } from "@/components/faq-accordion";
import { ProgramsView } from "./programs-view";
import { TopPrograms } from "./top-programs";

// Hourly, like /rankings: the top rows are the OAS leaderboard, whose scores
// expire 90 days after their verification date (isStale reads today).
export const revalidate = 3600;

const SITE = "https://openaffiliate.dev";

/**
 * The directory hub. The H1, the count sentence, the top programs by OAS (plain
 * links) and the FAQ are server-rendered, so they are in the raw HTML a crawler
 * reads. The interactive list renders in the browser (it reads the URL inside
 * its own Suspense) and keeps its URL state. Every live program as a plain link
 * lives on /programs/a-z (redesign r3), linked from here and every footer.
 */
export default function ProgramsPage() {
  const hub = programsHub(programs);
  const url = `${SITE}/programs`;
  return (
    <div className="oa-frame">
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "CollectionPage",
                "@id": `${url}#page`,
                name: "Affiliate program directory",
                description: hub.sentence,
                url,
                ...(hub.checked ? { dateModified: hub.checked } : {}),
                isPartOf: { "@id": `${SITE}/#website` },
                about: { "@id": `${SITE}/#dataset` },
                publisher: { "@id": `${SITE}/#organization` },
                mainEntity: {
                  "@type": "ItemList",
                  name: "Affiliate programs by OAS",
                  numberOfItems: hub.total,
                  itemListElement: hub.top.map((r, i) => ({
                    "@type": "ListItem",
                    position: i + 1,
                    url: `${SITE}/programs/${r.program.slug}`,
                    name: r.program.name,
                  })),
                },
              },
              {
                "@type": "FAQPage",
                mainEntity: hub.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
              },
            ],
          }),
        }}
      />
      <header className="oa-band !py-8 md:!py-10">
        <p className="oa-label">Directory</p>
        <h1 className="mt-2 text-title md:text-display font-semibold tracking-[-0.03em]">Affiliate program directory</h1>
        <p className="mt-2 max-w-3xl text-sm text-foreground/80">{hub.sentence}</p>
        {hub.updated && (
          <p className="mt-1 font-mono text-meta text-muted-foreground tabular-nums">
            Updated <time dateTime={hub.checked!}>{hub.updated}</time> · {hub.verified.toLocaleString("en-US")} verified
          </p>
        )}
      </header>
      <ProgramsView />
      <TopPrograms rows={hub.top} />
      <section aria-labelledby="programs-faq-h" className="oa-band">
        <h2 id="programs-faq-h" className="text-title font-semibold tracking-[-0.02em] mb-4">Questions about affiliate programs</h2>
        <div className="max-w-3xl">
          <FaqAccordion items={hub.faq} />
        </div>
      </section>
      <div className="oa-band !py-6 flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href="/programs/a-z" prefetch={false} className="inline-flex items-center gap-1.5 underline decoration-line-strong underline-offset-4 hover:decoration-current">
          All programs A–Z <ArrowRight className="size-3.5" aria-hidden />
        </Link>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">{livePrograms.length.toLocaleString("en-US")} names on one page</span>
      </div>
    </div>
  );
}
