import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PostApplyLink } from "@/components/post-apply-link";
import { AffitorLink } from "@/components/affitor-link";
import { PostByline, ReadMore, SHORT_DISCLOSURE, Tinted, linkClass, prose } from "@/components/best-post-standard";
import { serializeJsonLd } from "@/lib/json-ld";
import { getProgram, type Program } from "@/lib/programs";
import { blogApplyHref } from "@/lib/apply-cta";
import { AFFITOR_MARKETPLACE, affitorUrl } from "@/lib/affitor-link";
import { type PostProgram, type PostSelection } from "@/lib/best-posts";
import { AFFITOR_LINE, guideReadMoreLinks, programDetails, splitLink } from "@/lib/best-standard";
import { DISCLOSURE_SOURCE, guideTitle, registryFacts, type GuidePost } from "@/lib/guides";

const SITE = "https://openaffiliate.dev";
const h2 = "text-subtitle font-semibold tracking-[-0.02em]";

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

/** "Pay a recurring commission: 304 of 442": the registry's verified programs, from structured fields only. */
export function registryFactRows(): [string, string][] {
  const f = registryFacts();
  const recurring = f.byType.find((t) => t.type === "recurring")?.count ?? 0;
  const oneTime = f.byType.find((t) => t.type === "one-time")?.count ?? 0;
  return [
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
}

function RegistryFacts() {
  return (
    <section id="registry" className="scroll-mt-20 pt-12">
      <h2 className={h2}>What the registry shows</h2>
      <p className={`${prose} mt-4`}>Verified programs in the OpenAffiliate registry, terms checked up to {registryFacts().asOf}:</p>
      <ul data-registry-facts className={`${prose} mt-3 list-disc space-y-1.5 pl-5`}>
        {registryFactRows().map(([label, value]) => (
          <li key={label}>
            <strong className="font-semibold text-foreground">{label}:</strong> {value}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A program a guide names, compact: its name, the why with the affiliate page linked inline, and its details. */
function GuideProgram({ program, copy, campaign }: { program: Program; copy: PostProgram; campaign: string }) {
  const parts = splitLink(copy.why);
  return (
    <section id={program.slug} data-post-program={program.slug} className="scroll-mt-20 pt-8">
      <h3 className="text-lg font-semibold">{program.name}</h3>
      <p className={`${prose} mt-3`}>
        {parts ? (
          <>
            {parts[0]}
            <PostApplyLink href={blogApplyHref(program, campaign)} slug={program.slug} network={program.network} post={campaign} className={linkClass}>
              {parts[1]}
            </PostApplyLink>
            {parts[2]}
          </>
        ) : (
          copy.why
        )}
      </p>
      <ul data-details className={`${prose} mt-3 list-disc space-y-1.5 pl-5`}>
        {programDetails(program).map(([label, value]) => (
          <li key={label}>
            <strong className="font-semibold text-foreground">{label}:</strong> {value}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Lunacal: adding your coupon code …" → ["Lunacal", "adding your coupon code …"]. */
function ruleParts(text: string): [string, string] | null {
  const i = text.indexOf(": ");
  return i > 0 && i < 40 ? [text.slice(0, i), text.slice(i + 2)] : null;
}

/** A guide post on /blog/<slug>, in the visual language of the standard /best posts. */
export function GuideView({ guide, selection, path }: { guide: GuidePost; selection: PostSelection; path: string }) {
  const title = guideTitle(guide);
  const url = `${SITE}${path}`;
  // A rule quotes a program in the registry; one that left the registry is dropped with it.
  const rules = guide.rules.filter((r) => getProgram(r.slug));
  const [first, ...rest] = guide.sections;
  const readMore = guideReadMoreLinks(guide);

  const sectionBlock = (s: GuidePost["sections"][number]) => (
    <section key={s.heading} className="scroll-mt-20 pt-12">
      <h2 className={h2}>{s.heading}</h2>
      {s.paragraphs.map((p) => (
        <p key={p} className={`${prose} mt-4`}>{p}</p>
      ))}
      {s.steps && (
        <ol data-steps className={`${prose} mt-4 list-decimal space-y-3 pl-5`}>
          {s.steps.map((st) => (
            <li key={st.title}>
              <strong className="font-semibold text-foreground">{st.title}:</strong> {st.text}
              {st.link && (
                <>
                  {" "}
                  <Link href={st.link.href} prefetch={false} className={linkClass}>{st.link.label}</Link>.
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );

  return (
    <article className="oa-frame" data-post-layout="guide">
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
      <header className="oa-band pt-12 pb-8">
        <div className="mx-auto max-w-[760px]">
          <Link href="/blog" className="inline-flex items-center gap-1.5 text-meta text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="size-3.5" aria-hidden />
            Blog
          </Link>
          <h1 className="text-title md:text-display font-semibold tracking-[-0.03em] mt-4">{title}</h1>
          <PostByline updated={guide.checked} />
          <p data-post-intro className="text-lg leading-relaxed text-foreground/80 mt-5">{guide.answer}</p>
          <p data-post-disclosure className="text-sm text-muted-foreground mt-4">{SHORT_DISCLOSURE}</p>
        </div>
      </header>

      <div className="oa-band">
        <div className="mx-auto max-w-[760px]">
          <Tinted aria-labelledby="takeaways-title" data-takeaways>
            <h2 id="takeaways-title" className="text-subtitle font-semibold">Key takeaways</h2>
            <ul className={`${prose} mt-3 list-disc space-y-2 pl-5`}>
              {guide.takeaways.map((t) => <li key={t}>{t}</li>)}
            </ul>
          </Tinted>

          {first && sectionBlock(first)}
          <RegistryFacts />
          {rest.map(sectionBlock)}

          {selection.shown.length > 0 && (
            <section id="programs" className="scroll-mt-20 pt-12">
              <h2 className={h2}>Programs to start with</h2>
              <p className={`${prose} mt-4`}>{guide.programsIntro}</p>
              {selection.shown.map(({ program, copy }) => (
                <GuideProgram key={program.slug} program={program} copy={copy} campaign={guide.slug} />
              ))}
            </section>
          )}

          {rules.length > 0 && (
            <section id="rules" className="scroll-mt-20 pt-12">
              <h2 className={h2}>Rules that trip people up</h2>
              <p className={`${prose} mt-4`}>{guide.rulesIntro}</p>
              <ul data-rules className={`${prose} mt-3 list-disc space-y-2 pl-5`}>
                {rules.map((r) => {
                  const parts = ruleParts(r.text);
                  return (
                    <li key={r.text}>
                      {parts ? (
                        <>
                          <strong className="font-semibold text-foreground">{parts[0]}:</strong> {parts[1]}
                        </>
                      ) : (
                        r.text
                      )}{" "}
                      <Link href={`/programs/${r.slug}`} className={linkClass}>Terms</Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {guide.mistakes.length > 0 && (
            <section id="common-mistakes" className="scroll-mt-20 pt-12">
              <h2 className={h2}>Common mistakes</h2>
              <ul data-mistakes className={`${prose} mt-4 list-disc space-y-2 pl-5`}>
                {guide.mistakes.map((m) => (
                  <li key={m.lead}>
                    <strong className="font-semibold text-foreground">{m.lead}:</strong> {m.text}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section id="disclosure" className="scroll-mt-20 pt-12">
            <h2 className={h2}>Disclose every affiliate link</h2>
            <p className={`${prose} mt-4`}>
              {guide.disclosure} Source:{" "}
              <a href={DISCLOSURE_SOURCE.href} rel="noopener" className={linkClass}>{DISCLOSURE_SOURCE.label}</a>.
            </p>
          </section>

          <p data-affitor-line className={`${prose} mt-10 border-t border-border pt-6`}>
            {AFFITOR_LINE.before}
            <AffitorLink href={affitorUrl("blog", guide.slug, AFFITOR_MARKETPLACE)} source="blog" cta="marketplace" newTab className={linkClass}>
              {AFFITOR_LINE.anchor}
            </AffitorLink>
            {AFFITOR_LINE.after}
          </p>

          <ReadMore id="read-more" links={readMore} />

          {guide.faq.length > 0 && (
            <Tinted id="faq" aria-labelledby="faq-title" data-faq>
              <h2 id="faq-title" className="text-subtitle font-semibold">FAQ</h2>
              {guide.faq.map((f) => (
                <div key={f.q} className="mt-5">
                  <h3 className="text-base font-semibold">{f.q}</h3>
                  <p className={`${prose} mt-2`}>{f.a}</p>
                </div>
              ))}
            </Tinted>
          )}
        </div>
      </div>
    </article>
  );
}
