import { FaqAccordion } from "@/components/faq-accordion";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import type { BlogEntry } from "@/lib/blog";
import { ProgramLogo } from "@/components/program-logo";
import { serializeJsonLd } from "@/lib/json-ld";
import { networkName, IN_HOUSE, livePrograms, termsConfirmed } from "@/lib/programs";
import { applyButton } from "@/lib/apply-cta";
import { AffitorLink } from "@/components/affitor-link";
import { ReadMore, Tinted, linkClass, prose } from "@/components/best-post-standard";
import { AFFITOR_LINE, listCampaign, listReadMoreLinks } from "@/lib/best-standard";
import { AFFITOR_MARKETPLACE, affitorUrl } from "@/lib/affitor-link";
import { NETWORKS_POST_PATH, networkPostTitle } from "@/lib/networks-post";
import {
  BEST_INDEX,
  BEST_LISTS,
  MIN_SAMPLE,
  SHARED_RULES,
  bestListCopy,
  VERIFIED_NOTE,
  bestPath,
  indexable,
  otherLists,
  buildBestList,
  childLists,
  listCommissionText,
  listPageTitle,
  nounOf,
  updatedText,
  type BestList,
} from "@/lib/best-lists";

const SITE = "https://openaffiliate.dev";

/** `path` is the page's own path; its markdown twin is the same path plus ".md". */
export function bestListMetadata(list: BestList, path: string): Metadata {
  // Absolute: listPageTitle is the whole tag, so the layout adds no suffix.
  const title = listPageTitle(list);
  return {
    title: { absolute: title },
    description: list.description,
    ...(indexable(list) ? {} : { robots: { index: false, follow: true } }),
    alternates: {
      canonical: path,
      types: { "text/markdown": `${SITE}${path}.md` },
    },
    openGraph: {
      title,
      description: list.description,
      url: `${SITE}${path}`,
      siteName: "OpenAffiliate",
      // Nested metadata is replaced, not merged, so the root image is named here.
      images: ["/opengraph-image"],
    },
  };
}

const th = "py-2.5 px-3 text-left oa-label font-medium";

/** One ranked list: the /best hub, a /best/<slug> list, or a category page. */
export function BestListView({
  list,
  path,
  parent,
  related,
}: {
  list: BestList;
  path: string;
  parent: { name: string; href: string };
  /** A category page: the posts and ranked lists about the category, in their own block (redesign r3). */
  related?: { category: string; entries: BlogEntry[] };
}) {
  const data = buildBestList(list);
  const { intro, faq } = bestListCopy(data);
  const url = `${SITE}${path}`;
  // Like the intro, no "top" out of fewer than MIN_SAMPLE verified programs.
  const stats = [
    { label: "Programs", value: String(data.total) },
    { label: "Verified", value: String(data.verified.length) },
    { label: "Top verified", value: data.verified.length >= MIN_SAMPLE ? data.verified[0].name : "—" },
    { label: "Median verified %", value: data.medianSinglePct != null ? `${data.medianSinglePct}%` : "—" },
  ];
  // Category pages link every list from their "Posts about" block and /blog; list pages keep their siblings.
  const siblings = related ? [] : otherLists(list);
  // A category page whose query a wider /best list answers links to it (SaaS: the category vs every saas-tagged program).
  const wider = related ? BEST_LISTS.find((l) => l.answersFor === related.category) : undefined;

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
                name: list.h1,
                description: intro,
                url,
                isPartOf: { "@id": `${SITE}/#website` },
                publisher: { "@id": `${SITE}/#organization` },
                mainEntity: { "@id": `${url}#list` },
              },
              {
                "@type": "ItemList",
                "@id": `${url}#list`,
                name: list.h1,
                url,
                numberOfItems: data.rows.length,
                itemListElement: data.rows.map((program, index) => ({
                  "@type": "ListItem",
                  position: index + 1,
                  url: `${SITE}/programs/${program.slug}`,
                  name: program.name,
                })),
              },
              {
                "@type": "FAQPage",
                mainEntity: faq.map((f) => ({
                  "@type": "Question",
                  name: f.q,
                  acceptedAnswer: { "@type": "Answer", text: f.a },
                })),
              },
              {
                "@type": "BreadcrumbList",
                // The hub sits directly under the home page; its back link to the
                // categories is navigation, not hierarchy.
                itemListElement: [
                  { name: "OpenAffiliate", item: SITE },
                  ...(list === BEST_INDEX ? [] : [{ name: parent.name, item: `${SITE}${parent.href}` }]),
                  { name: list.h1 },
                ].map((crumb, i) => ({ "@type": "ListItem", position: i + 1, ...crumb })),
              },
            ],
          }),
        }}
      />
      <header className="oa-band !py-8 md:!py-10">
        <nav aria-label="Breadcrumb" className="text-meta text-muted-foreground">
          <Link href={parent.href} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            {parent.name}
          </Link>
        </nav>
        <h1 className="mt-3 text-title md:text-display font-semibold tracking-[-0.03em]">{list.h1}</h1>
        {data.checked && (
          <p className="mt-2 font-mono text-meta text-muted-foreground tabular-nums">
            Updated <time dateTime={data.checked}>{updatedText(data.checked)}</time>
          </p>
        )}
        <dl className="mt-4 inline-grid max-w-full grid-cols-2 overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-4">
          {stats.map(({ label, value }, i) => (
            <div key={label} className={`min-w-0 px-4 py-2.5 ${i % 2 ? "border-l border-border" : ""} ${i > 1 ? "border-t border-border sm:border-t-0" : ""} ${i === 2 ? "sm:border-l" : ""}`}>
              <dt className="oa-label">{label}</dt>
              <dd className="mt-0.5 truncate font-mono text-lg font-medium tabular-nums" title={value}>{value}</dd>
            </div>
          ))}
        </dl>
      </header>

      {related && related.entries.length > 0 && (
        <section data-list-picks className="oa-band !py-8" aria-labelledby="related-h">
          <div className="mb-2 flex items-baseline justify-between gap-4 border-b border-line-strong pb-2">
            <h2 id="related-h" className="oa-label">Posts about {related.category}</h2>
            <Link href="/blog" className="text-meta text-muted-foreground underline decoration-line-strong underline-offset-4 hover:text-foreground">Blog</Link>
          </div>
          <ul>
            {related.entries.map((e) => (
              <li key={e.href} className="border-b border-border">
                <Link href={e.href} className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-3 py-2.5 text-sm hover:bg-sunk transition-colors">
                  <span className="font-mono text-xs text-muted-foreground">{e.kind === "post" ? "Post" : "Ranked list"}</span>
                  <span className="truncate">{e.title}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="oa-band" aria-label="Programs">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-sunk">
                  <th className={`w-10 text-center ${th}`}>#</th>
                  <th className={`min-w-[160px] ${th}`}>Program</th>
                  <th className={`min-w-[110px] ${th}`}>Commission</th>
                  <th className={`hidden sm:table-cell ${th}`}>Type</th>
                  <th className={`min-w-[90px] ${th}`}>Duration</th>
                  <th className={`hidden sm:table-cell ${th}`}>Cookie</th>
                  <th className={`hidden md:table-cell ${th}`}>Network</th>
                  <th className={th}>Sign up</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((program, i) => (
                  <tr key={program.slug} className="border-t border-border hover:bg-sunk transition-colors">
                    <td className="py-2.5 px-3 text-center font-mono text-xs text-muted-foreground">{i + 1}</td>
                    <td className="py-2.5 px-3">
                      <Link href={`/programs/${program.slug}`} className="flex items-center gap-3 hover:underline">
                        <ProgramLogo slug={program.slug} name={program.name} size={28} className="shrink-0" />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 font-medium">
                            {program.name}
                            {program.verified && <Check className="size-3.5 shrink-0 text-good" role="img" aria-label="Verified" />}
                          </span>
                          {!program.verified && <span className="block text-xs text-muted-foreground">Not verified</span>}
                        </span>
                      </Link>
                    </td>
                    <td className="py-2.5 px-3">
                      {/* Only a verified figure reads as confirmed; an unverified one is the submitter's claim. */}
                      <span className={program.verified ? "font-mono text-meta font-medium" : "font-mono text-meta text-muted-foreground"}>
                        {listCommissionText(program)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 hidden sm:table-cell whitespace-nowrap text-meta text-muted-foreground">{program.commission.type}</td>
                    <td className="py-2.5 px-3 text-meta text-muted-foreground">{program.commission.duration ?? "—"}</td>
                    <td className="py-2.5 px-3 hidden sm:table-cell font-mono text-xs text-muted-foreground">
                      {termsConfirmed(program) && program.cookieDays != null ? `${program.cookieDays}d` : "—"}
                    </td>
                    <td className="py-2.5 px-3 hidden md:table-cell text-meta text-muted-foreground">
                      {networkName(program.network ?? IN_HOUSE)}
                    </td>
                    <td className="py-2.5 px-3 text-meta">
                      {/* The program page's apply link with the list UTM, so both send readers to the same place. */}
                      <AffitorLink
                        href={applyButton(program, "list").href}
                        source="list"
                        slug={program.slug}
                        cta="sign_up"
                        applyNetwork={program.network ?? IN_HOUSE}
                        newTab
                        className="whitespace-nowrap underline decoration-line-strong underline-offset-4 hover:decoration-current"
                      >
                        Sign up
                      </AffitorLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <ChildLists list={list} />

      <section className="oa-band" aria-labelledby="about-list-h">
        <h2 id="about-list-h" className="oa-label mb-3 border-b border-line-strong pb-2">About this list</h2>
        <div className="max-w-3xl space-y-2 text-sm text-foreground/80">
          <p>{intro}</p>
          <p>
            {wider && (
              <>
                This category holds only the programs filed under {related!.category}. For {related!.category} tools in every
                category, see{" "}
                <Link href={bestPath(wider)} className="underline underline-offset-4">{nounOf(wider.query)}</Link>.{" "}
              </>
            )}
            Every program here is also in the OpenAffiliate{" "}
            <Link href="/programs" prefetch={false} className="underline underline-offset-4">affiliate program directory</Link>, with{" "}
            {livePrograms.length.toLocaleString("en-US")} programs in all.
          </p>
          <p className="text-meta text-muted-foreground">
            <span className="font-medium text-foreground">How we picked:</span> {list.criteria} {list.rules ?? SHARED_RULES}
            {list.filter && (
              <>
                {" "}
                <Link href={`/programs?${list.filter}`} prefetch={false} className="underline underline-offset-4">
                  Filter all programs the same way
                </Link>
                .
              </>
            )}
          </p>
          {data.checked && (
            <p className="text-meta text-muted-foreground">
              <span className="font-medium text-foreground">Verified {data.checked}:</span> {VERIFIED_NOTE}
            </p>
          )}
        </div>
      </section>

      {!related && (
        <div className="oa-band" data-list-end>
          <div className="mx-auto max-w-[760px]">
            {/* The hub is the parent of every list: it links each one, one line each (Read more alone would leave most out). */}
            {list === BEST_INDEX && (
              <section data-all-lists aria-labelledby="all-lists-h" className="mb-10">
                <h2 id="all-lists-h" className="text-subtitle font-semibold">All lists</h2>
                <ul className={`${prose} mt-3 list-disc space-y-1.5 pl-5`}>
                  {BEST_LISTS.filter((l) => l !== BEST_INDEX).map((l) => (
                    <li key={l.slug}>
                      <Link href={bestPath(l)} className={linkClass}>{l.h1}</Link>
                    </li>
                  ))}
                  <li>
                    <Link href={NETWORKS_POST_PATH} className={linkClass}>{networkPostTitle()}</Link>
                  </li>
                </ul>
              </section>
            )}
            <p data-affitor-line className={`${prose} border-t border-border pt-6`}>
              {AFFITOR_LINE.before}
              <AffitorLink href={affitorUrl("blog", listCampaign(list), AFFITOR_MARKETPLACE)} source="blog" cta="marketplace" newTab className={linkClass}>
                {AFFITOR_LINE.anchor}
              </AffitorLink>
              {AFFITOR_LINE.after}
            </p>
            <ReadMore id="read-more" links={listReadMoreLinks(list)} />
            <Tinted id="faq" aria-labelledby="list-faq-h" data-faq>
              <h2 id="list-faq-h" className="text-subtitle font-semibold">{list.h1} FAQ</h2>
              {faq.map((f) => (
                <div key={f.q} className="mt-5">
                  <h3 className="text-base font-semibold">{f.q}</h3>
                  <p className={`${prose} mt-2`}>{f.a}</p>
                </div>
              ))}
            </Tinted>
          </div>
        </div>
      )}

      {related && (
        <section className="oa-band" aria-labelledby="list-faq-h">
          <div className="max-w-3xl">
            <h2 id="list-faq-h" className="text-lg font-semibold mb-3">{list.h1} FAQ</h2>
            <FaqAccordion items={faq} />
          </div>
        </section>
      )}

      {related && (
      <nav className="oa-band" aria-label="More lists">
        {siblings.length > 0 && (
          <>
            <h2 className="oa-label mb-2 border-b border-line-strong pb-2">Other lists</h2>
            <ul className="mb-4 grid sm:grid-cols-2 sm:gap-x-8">
              {siblings.map((l) => (
                <li key={l.slug} className="border-b border-border">
                  <Link href={bestPath(l)} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:bg-sunk transition-colors">
                    <span className="truncate">{l.h1}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link href="/blog" className="underline decoration-line-strong underline-offset-4 hover:decoration-current">All posts and ranked lists</Link>
          <Link href="/categories" className="underline decoration-line-strong underline-offset-4 hover:decoration-current">Browse by category</Link>
        </div>
      </nav>
      )}
    </div>
  );
}

/** A list's per-category children ("AI Recurring Affiliate Programs" under the recurring list), as plain links. */
export function ChildLists({ list, narrow }: { list: BestList; narrow?: boolean }) {
  const children = childLists(list);
  if (children.length === 0) return null;
  return (
    <nav className="oa-band" aria-labelledby="child-lists-h">
      <div className={narrow ? "mx-auto max-w-[760px]" : undefined}>
        <h2 id="child-lists-h" className="oa-label mb-2 border-b border-line-strong pb-2">{list.h1} by category</h2>
        <ul className="grid sm:grid-cols-2 sm:gap-x-8">
          {children.map((l) => (
            <li key={l.slug} className="border-b border-border">
              <Link href={bestPath(l)} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:bg-sunk transition-colors">
                <span className="truncate">{l.h1}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
