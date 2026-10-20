import { FaqAccordion } from "@/components/faq-accordion";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { PostProgramBlock } from "@/components/post-program-block";
import { serializeJsonLd } from "@/lib/json-ld";
import { getProgram } from "@/lib/programs";
import { BEST_LISTS, bestPath } from "@/lib/best-lists";
import { DISCLOSURE, type PostSelection } from "@/lib/best-posts";
import { DISCLOSURE_SOURCE, guideTitle, registryFacts, type GuidePost } from "@/lib/guides";

const SITE = "https://openaffiliate.dev";

export function guideMetadata(guide: GuidePost, path: string): Metadata {
  const title = guideTitle(guide);
  return {
    title,
    description: guide.description,
    alternates: { canonical: path, types: { "text/markdown": `${SITE}${path}.md` } },
    openGraph: {
      title: `${title} | OpenAffiliate`,
      description: guide.description,
      url: `${SITE}${path}`,
      siteName: "OpenAffiliate",
      type: "article",
      images: ["/opengraph-image"],
    },
  };
}

/** "Recurring 304 of 442": the registry's verified programs, from structured fields only. */
function RegistryFacts() {
  const f = registryFacts();
  const recurring = f.byType.find((t) => t.type === "recurring")?.count ?? 0;
  const oneTime = f.byType.find((t) => t.type === "one-time")?.count ?? 0;
  const rows: [string, string][] = [
    ["Pay a recurring commission", `${recurring} of ${f.verified}`],
    ["Pay for the customer's lifetime", `${f.lifetime} of ${f.verified}`],
    ["Pay once per sale", `${oneTime} of ${f.verified}`],
    ...(f.cookie
      ? ([
          ["Publish a cookie window", `${f.cookie.published} of ${f.verified}`],
          ["Median cookie window", `${f.cookie.median} days`],
          ["Middle half of cookie windows", `${f.cookie.p25} to ${f.cookie.p75} days`],
        ] as [string, string][])
      : []),
    ["Approve every applicant automatically", `${f.approval.auto} of ${f.verified}`],
    ["Review applications by hand", `${f.approval.manual} of ${f.verified}`],
    ["Pay by PayPal", `${f.payout.paypal} of ${f.verified}`],
  ];
  return (
    <section className="oa-band" aria-labelledby="registry-facts-h">
      <div className="mx-auto max-w-[760px]">
        <h2 id="registry-facts-h" className="text-lg font-semibold">What the registry shows</h2>
        <p className="text-meta text-muted-foreground mt-1">
          Verified programs in the OpenAffiliate registry, terms checked up to {f.asOf}.
        </p>
        <dl data-registry-facts className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
          {rows.map(([dt, dd]) => (
            <div key={dt} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-t border-border px-4 py-2.5 first:border-t-0">
              <dt className="text-sm text-foreground/80">{dt}</dt>
              <dd className="whitespace-nowrap font-mono text-sm tabular-nums">{dd}</dd>
            </div>
          ))}
        </dl>
        <p className="text-meta text-muted-foreground mt-2">
          <Link href="/programs?type=recurring" prefetch={false} className="underline underline-offset-4">Browse recurring programs</Link>
          {" · "}
          <Link href="/programs?cookie=90" prefetch={false} className="underline underline-offset-4">Programs with a long cookie</Link>
        </p>
      </div>
    </section>
  );
}

/** A guide post on /blog/<slug>, in the same frame as the /best posts. */
export function GuideView({ guide, selection, path }: { guide: GuidePost; selection: PostSelection; path: string }) {
  const title = guideTitle(guide);
  const url = `${SITE}${path}`;
  const related = guide.related.flatMap((slug) => BEST_LISTS.filter((l) => l.slug === slug));
  // A rule quotes a program in the registry; one that left the registry is dropped with it.
  const rules = guide.rules.filter((r) => getProgram(r.slug));
  const [first, ...rest] = guide.sections;

  const sectionBand = (s: GuidePost["sections"][number]) => (
    <section key={s.heading} className="oa-band">
      <div className="mx-auto max-w-[760px]">
        <h2 className="text-lg font-semibold">{s.heading}</h2>
        {s.paragraphs.map((p) => (
          <p key={p} className="text-base leading-relaxed text-foreground/80 mt-3">{p}</p>
        ))}
        {s.steps && (
          <ol className="mt-4 space-y-5">
            {s.steps.map((st, i) => (
              <li key={st.title} className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3">
                <span className="font-mono text-meta text-muted-foreground pt-0.5">{i + 1}</span>
                <div>
                  <h3 className="font-semibold">{st.title}</h3>
                  <p className="text-base leading-relaxed text-foreground/80 mt-1">{st.text}</p>
                  {st.link && (
                    <Link href={st.link.href} prefetch={false} className="mt-1 inline-flex items-center gap-1 text-sm underline underline-offset-4">
                      {st.link.label}
                      <ArrowRight className="size-3" aria-hidden />
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );

  return (
    <article className="oa-frame">
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Article",
                headline: title,
                description: guide.description,
                url,
                dateModified: guide.checked,
                author: { "@id": `${SITE}/#organization` },
                publisher: { "@id": `${SITE}/#organization` },
                isPartOf: { "@id": `${SITE}/#website` },
              },
              {
                "@type": "FAQPage",
                mainEntity: guide.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
              },
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  { name: "OpenAffiliate", item: SITE },
                  { name: "Blog", item: `${SITE}/blog` },
                  { name: title },
                ].map((crumb, i) => ({ "@type": "ListItem", position: i + 1, ...crumb })),
              },
            ],
          }),
        }}
      />
      <header className="oa-band pt-12 pb-10">
        <div className="mx-auto max-w-[760px]">
          <Link href="/blog" className="inline-flex items-center gap-1.5 text-meta text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="size-3.5" aria-hidden />
            Blog
          </Link>
          <h1 className="text-title md:text-display font-semibold tracking-[-0.03em] mt-4">{title}</h1>
          <p className="text-meta text-muted-foreground mt-3">By the OpenAffiliate team · Updated {guide.checked}</p>
          <p className="text-lg leading-relaxed text-foreground/80 mt-5">{guide.answer}</p>
          <p data-post-disclosure className="text-sm text-muted-foreground mt-5 rounded-xl border border-border bg-sunk px-4 py-3">
            {DISCLOSURE}
          </p>
        </div>
      </header>

      {first && sectionBand(first)}
      <RegistryFacts />
      {rest.map(sectionBand)}

      {selection.shown.length > 0 && (
        <section className="oa-band">
          <div className="mx-auto max-w-[760px]">
            <h2 className="text-lg font-semibold">Programs to start with</h2>
            <p className="text-base leading-relaxed text-foreground/80 mt-3 mb-6">{guide.programsIntro}</p>
            {selection.shown.map(({ program, copy }, i) => (
              <PostProgramBlock key={program.slug} program={program} copy={copy} index={i} campaign={guide.slug} />
            ))}
          </div>
        </section>
      )}

      {rules.length > 0 && (
        <section className="oa-band">
          <div className="mx-auto max-w-[760px]">
            <h2 className="text-lg font-semibold">Rules that trip people up</h2>
            <p className="text-base leading-relaxed text-foreground/80 mt-3">{guide.rulesIntro}</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-base text-foreground/80">
              {rules.map((r) => (
                <li key={r.text}>
                  {r.text}{" "}
                  <Link href={`/programs/${r.slug}`} className="text-sm underline underline-offset-4 decoration-border">Terms</Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="oa-band">
        <div className="mx-auto max-w-[760px]">
          <h2 className="text-lg font-semibold">Disclose every affiliate link</h2>
          <p className="text-base leading-relaxed text-foreground/80 mt-3">
            {guide.disclosure} Source:{" "}
            <a href={DISCLOSURE_SOURCE.href} rel="noopener" className="underline underline-offset-4">{DISCLOSURE_SOURCE.label}</a>.
          </p>
          {guide.faq.length > 0 && (
            <>
              <h2 className="text-lg font-semibold mt-10">FAQ</h2>
              <div className="mt-2">
                <FaqAccordion items={guide.faq} />
              </div>
            </>
          )}
        </div>
      </section>

      {related.length > 0 && (
        <nav className="oa-band" aria-label="Keep reading">
          <div className="mx-auto max-w-[760px]">
            <p className="oa-label">Keep reading</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {related.map((l) => (
                <Link
                  key={l.slug}
                  href={bestPath(l)}
                  className="inline-flex h-9 items-center justify-between gap-2 rounded-lg border border-line-strong bg-card px-3.5 text-sm font-medium hover:bg-sunk transition-colors"
                >
                  {l.h1}
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              ))}
            </div>
          </div>
        </nav>
      )}
    </article>
  );
}
