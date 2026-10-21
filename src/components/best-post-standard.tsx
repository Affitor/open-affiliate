import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ChevronDown, ExternalLink } from "lucide-react";
import { FaqAccordion } from "@/components/faq-accordion";
import { ProgramLogo } from "@/components/program-logo";
import { PostApplyLink } from "@/components/post-apply-link";
import { MonthChanges } from "@/components/best-post-view";
import { ChildLists } from "@/components/best-list-view";
import { SortableTermsTable, type TermsColumn, type TermsRow } from "@/components/sortable-terms-table";
import { serializeJsonLd } from "@/lib/json-ld";
import { livePrograms, type Program } from "@/lib/programs";
import { applyButton, blogApplyHref } from "@/lib/apply-cta";
import { BEST_LISTS, bestPath, type BestList } from "@/lib/best-lists";
import { DISCLOSURE, FRESHNESS_RULE, NOT_STATED, checkedRange, checkedText, cookieText, earnText, payoutText, postTitle, type BestPost, type PostProgram, type PostSelection } from "@/lib/best-posts";
import {
  alsoConsidered,
  approvalShort,
  approvalText,
  dateText,
  goodWatch,
  methodsText,
  picksSentence,
  rangeText,
  runsOnText,
  standardFaq,
  typeSplit,
  typeText,
  type TypeSplit,
} from "@/lib/best-standard";
import { CAPTURES, CAPTURE_SKIPPED, captureHost } from "@/lib/best-captures";
import { leadReceipt, termReceipts } from "@/lib/term-receipts";

const SITE = "https://openaffiliate.dev";

/**
 * The post's byline. Today it reads "By the OpenAffiliate team"; an `editor`
 * (a named person with a bio page) replaces the team once one is named.
 */
export function PostByline({ editor, updated, checked }: { editor?: { name: string; href: string }; updated?: string; checked?: [string, string] | null }) {
  return (
    <p data-post-byline className="text-meta text-muted-foreground mt-3">
      By {editor ? <Link href={editor.href} className="text-foreground underline underline-offset-4">{editor.name}</Link> : "the OpenAffiliate team"}
      {updated && <> · Updated <time dateTime={updated}>{dateText(updated)}</time></>}
      {checked && <> · Terms checked <span className="whitespace-nowrap">{rangeText(checked)}</span></>}
    </p>
  );
}

const FIELD_LABEL = { commission: "You earn", cookie: "Cookie", payout: "Payout", approval: "Approval" } as const;

/** One program's section: verdict, capture, why, six facts, Good / Watch out, the quote we checked, one Apply button. */
function ProgramSection({ program, copy, index, campaign }: { program: Program; copy: PostProgram; index: number; campaign: string }) {
  const capture = CAPTURES[program.slug];
  const receipt = leadReceipt(termReceipts(program.slug, program.url));
  const { good, watch } = goodWatch(program);
  const methods = methodsText(program);
  const payout = payoutText(program, NOT_STATED);
  const facts: [string, string][] = [
    ["You earn", earnText(program)],
    ["Type", typeText(program)],
    ["Cookie", cookieText(program, NOT_STATED)],
    ["Payout", methods ? (payout === NOT_STATED ? methods : `${payout} · ${methods}`) : payout],
    ["Approval", approvalText(program)],
    ["Runs on", runsOnText(program)],
  ];
  const label = program.network === "affitor" ? applyButton(program, "blog").label : `Apply on ${program.name}`;
  return (
    <section id={program.slug} data-post-program={program.slug} className="scroll-mt-20 border-t border-border py-10 first-of-type:border-t-0 first-of-type:pt-0">
      <div className="flex items-center gap-3">
        <span className="font-mono text-meta text-muted-foreground">{index + 1}</span>
        <ProgramLogo slug={program.slug} name={program.name} size={40} className="shrink-0" />
        <div>
          <h3 className="text-lg font-semibold">{program.name}</h3>
          <p className="text-sm text-muted-foreground">{copy.bestFor}</p>
        </div>
      </div>
      {copy.verdict && <p data-verdict className="mt-4 text-base font-medium">{copy.verdict}</p>}
      <figure className="mt-4">
        {capture ? (
          <Image
            src={capture.src}
            width={capture.width}
            height={capture.height}
            alt={`${program.name} affiliate page, captured ${dateText(capture.captured)}`}
            loading="lazy"
            sizes="(max-width: 760px) 100vw, 760px"
            className="h-auto max-h-[220px] w-full rounded-xl border border-border object-cover object-top sm:max-h-none"
          />
        ) : (
          <div data-capture-fallback className="flex items-center gap-4 rounded-xl border border-border bg-sunk px-5 py-6">
            <ProgramLogo slug={program.slug} name={program.name} size={56} className="shrink-0" />
            <p className="text-sm text-muted-foreground">
              No screenshot of {program.name}&apos;s affiliate page{CAPTURE_SKIPPED[program.slug] ? `: ${CAPTURE_SKIPPED[program.slug]}` : ""}.
            </p>
          </div>
        )}
        {capture && (
          <figcaption className="mt-2 text-meta text-muted-foreground">
            <a href={capture.url} rel="nofollow noopener" target="_blank" className="underline underline-offset-4 decoration-border hover:text-foreground">{captureHost(capture.url)}</a>, captured {dateText(capture.captured)}
          </figcaption>
        )}
      </figure>
      <p className="text-base leading-relaxed text-foreground/80 mt-4">{copy.why}</p>
      <dl className="mt-5 grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-3">
        {facts.map(([dt, dd], i) => (
          <div key={dt} className={`border-border px-3 py-2.5 ${i % 2 ? "border-l" : ""} ${i >= 2 ? "border-t" : ""} sm:border-l sm:border-t-0 sm:[&:nth-child(3n+1)]:border-l-0 sm:[&:nth-child(n+4)]:border-t`}>
            <dt className="oa-label">{dt}</dt>
            <dd className="mt-1 text-sm">{dd}</dd>
          </div>
        ))}
      </dl>
      {(good.length > 0 || watch.length > 0) && (
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {good.length > 0 && (
            <div>
              <p className="oa-label">Good</p>
              <ul data-good className="mt-2 space-y-1.5 text-sm text-foreground/80">
                {good.map((g) => <li key={g} className="flex gap-2"><span aria-hidden className="text-good">+</span>{g}</li>)}
              </ul>
            </div>
          )}
          {watch.length > 0 && (
            <div>
              <p className="oa-label">Watch out</p>
              <ul data-watch className="mt-2 space-y-1.5 text-sm text-foreground/80">
                {watch.map((w) => <li key={w} className="flex gap-2"><span aria-hidden className="text-muted-foreground">−</span>{w}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
      {receipt && (
        <blockquote data-receipt className="mt-5 border-l-2 border-line-strong pl-4 text-sm">
          <p className="text-foreground/80">&ldquo;{receipt.quote}&rdquo;</p>
          <footer className="mt-1 text-meta text-muted-foreground">
            {receipt.field !== "commission" && <>Source for {FIELD_LABEL[receipt.field]}: </>}
            {receipt.href ? <a href={receipt.href} rel="nofollow noopener" target="_blank" className="underline underline-offset-4 decoration-border hover:text-foreground">{receipt.source}</a> : receipt.source}, checked {dateText(receipt.checked)}
          </footer>
        </blockquote>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <PostApplyLink
          href={blogApplyHref(program, campaign)}
          slug={program.slug}
          network={program.network}
          post={campaign}
          className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {label}
          <ExternalLink className="size-3.5" aria-hidden />
        </PostApplyLink>
        <Link href={`/programs/${program.slug}`} className="underline underline-offset-4 decoration-border hover:decoration-foreground">Full terms</Link>
        <span className="text-meta text-muted-foreground">Checked {dateText(checkedText(program))}</span>
      </div>
    </section>
  );
}

/** Horizontal bars from the registry: one series, direct labels, counts in text. */
function TypeChart({ split, heading }: { split: TypeSplit; heading: string }) {
  const max = Math.max(...split.rows.map((r) => r.count), 1);
  const rowH = 34;
  const labelW = 80;
  const barMax = 400 - labelW - 36;
  const h = split.rows.length * rowH;
  return (
    <figure data-type-chart className="mt-6">
      <svg viewBox={`0 0 400 ${h}`} width="100%" role="img" aria-labelledby="type-chart-title type-chart-desc" className="block max-w-[480px]">
        <title id="type-chart-title">{heading}</title>
        <desc id="type-chart-desc">{split.rows.map((r) => `${r.label}: ${r.count}`).join(", ")}, of {split.total} verified programs.</desc>
        {split.rows.map((r, i) => {
          const w = Math.max(4, Math.round((r.count / max) * barMax));
          const y = i * rowH + 6;
          return (
            <g key={r.type}>
              <title>{`${r.label}: ${r.count} of ${split.total}`}</title>
              <text x={0} y={y + 15} fontSize={13} className="fill-foreground">{r.label}</text>
              <path d={`M${labelW},${y} h${w - 4} a4,4 0 0 1 4,4 v14 a4,4 0 0 1 -4,4 h-${w - 4} z`} className="fill-foreground/70" />
              <text x={labelW + w + 8} y={y + 15} fontSize={13} className="fill-muted-foreground font-mono">{r.count}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 text-meta text-muted-foreground">
        {heading}: {split.total} live verified programs, terms checked up to {dateText(split.asOf)}.
      </figcaption>
    </figure>
  );
}

/** A post on the standard "best X" structure (layout: "standard" on the post). */
export function BestPostStandard({
  post,
  list,
  selection,
  path,
  parent,
}: {
  post: BestPost;
  list: BestList;
  selection: PostSelection;
  path: string;
  parent: { name: string; href: string };
}) {
  const title = postTitle(post, selection);
  const range = checkedRange(selection);
  const split = typeSplit(post, selection);
  const faq = standardFaq(post, selection, split);
  const considered = alsoConsidered(post, selection);
  const url = `${SITE}${path}`;
  const { shown } = selection;
  const bySlug = new Map(shown.map((s) => [s.program.slug, s]));
  const picks = post.picks.flatMap((pick) => {
    const s = bySlug.get(pick.slug);
    return s ? [{ label: pick.label, ...s }] : [];
  });
  const related = post.related.flatMap((slug) => BEST_LISTS.filter((l) => l.slug === slug));
  const lede = picksSentence(post, selection);
  const chartHeading = `How ${list.query.toLowerCase()} pay`;

  const columns: TermsColumn[] = [
    { name: "Best for" },
    { name: "You earn", mobile: true },
    { name: "Type", mobile: true },
    { name: "Cookie", mobile: true },
    { name: "Approval", mobile: true },
    { name: "Payout" },
    { name: "Checked", mono: true },
  ];
  const rows: TermsRow[] = shown.map(({ program: p, copy }, i) => ({
    slug: p.slug,
    name: p.name,
    logo: <ProgramLogo slug={p.slug} name={p.name} size={24} className="shrink-0" />,
    cells: [
      { text: copy.bestFor.replace(/^best for\s+/i, ""), sort: copy.bestFor },
      // "You earn" sorts back to the page order: mixed flat, tiered and percentage figures have no one scale.
      { text: earnText(p), sort: i },
      { text: typeText(p), sort: typeText(p) },
      { text: cookieText(p, NOT_STATED), sort: p.cookieDays ?? null },
      { text: approvalShort(p), sort: p.approval === "auto" ? 0 : p.approval === "manual" ? 1 : null },
      { text: payoutText(p, NOT_STATED), sort: p.payout.minimum ?? null },
      { text: dateText(checkedText(p)), sort: checkedText(p) },
    ],
  }));

  const toc: { href: string; label: string }[] = [
    ...(picks.length ? [{ href: "#quick-picks", label: "Quick picks" }] : []),
    { href: "#side-by-side", label: "Side by side" },
    ...(post.lookFor ? [{ href: "#what-to-look-for", label: "What to look for" }] : []),
    ...shown.map(({ program }, i) => ({ href: `#${program.slug}`, label: `${i + 1} · ${program.name}` })),
    ...(considered.length ? [{ href: "#also-considered", label: "Also considered" }] : []),
    { href: "#how-we-chose", label: "How we chose" },
    { href: "#faq", label: "FAQ" },
  ];
  const tocList = (
    <ol className="space-y-1.5 text-sm">
      {toc.map((t) => (
        <li key={t.href}>
          <a href={t.href} className="text-muted-foreground hover:text-foreground transition-colors">{t.label}</a>
        </li>
      ))}
    </ol>
  );

  return (
    <article className="oa-frame" data-post-layout="standard">
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
                description: post.description,
                url,
                ...(range ? { dateModified: range[1] } : {}),
                author: { "@id": `${SITE}/#organization` },
                publisher: { "@id": `${SITE}/#organization` },
                isPartOf: { "@id": `${SITE}/#website` },
                mainEntity: { "@id": `${url}#list` },
              },
              {
                "@type": "ItemList",
                "@id": `${url}#list`,
                name: title,
                numberOfItems: shown.length,
                itemListElement: shown.map(({ program }, i) => ({
                  "@type": "ListItem",
                  position: i + 1,
                  url: `${SITE}/programs/${program.slug}`,
                  name: program.name,
                })),
              },
              {
                "@type": "FAQPage",
                mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
              },
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  { name: "OpenAffiliate", item: SITE },
                  { name: parent.name, item: `${SITE}${parent.href}` },
                  { name: list.h1 },
                ].map((crumb, i) => ({ "@type": "ListItem", position: i + 1, ...crumb })),
              },
            ],
          }),
        }}
      />
      <header className="oa-band pt-12 pb-10">
        <div className="mx-auto max-w-[760px]">
          <Link href={parent.href} className="inline-flex items-center gap-1.5 text-meta text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="size-3.5" aria-hidden />
            {parent.name}
          </Link>
          <h1 className="text-title md:text-display font-semibold tracking-[-0.03em] mt-4">{title}</h1>
          <PostByline updated={range?.[1]} checked={range} />
          <p data-post-intro className="text-lg leading-relaxed text-foreground/80 mt-5">
            {post.intro}
            {lede && <> {lede}</>}
          </p>
          <p data-post-disclosure className="text-sm text-muted-foreground mt-5 rounded-xl border border-border bg-sunk px-4 py-3">
            {DISCLOSURE}
          </p>
        </div>
      </header>

      {picks.length > 0 && (
        <section id="quick-picks" className="oa-band scroll-mt-20">
          <div className="mx-auto max-w-[760px]">
            <h2 className="text-lg font-semibold">Quick picks</h2>
            <ul className="mt-4 grid overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-2">
              {picks.map(({ label, program }) => (
                <li key={label} className="border-border border-t first:border-t-0 sm:[&:nth-child(2)]:border-t-0 sm:even:border-l sm:[&:last-child:nth-child(odd)]:col-span-2">
                  <a href={`#${program.slug}`} className="grid grid-cols-[36px_minmax(0,1fr)] gap-x-3 px-4 py-3.5 hover:bg-sunk transition-colors">
                    <span className="row-span-3" aria-hidden><ProgramLogo slug={program.slug} name={program.name} size={36} className="shrink-0" /></span>
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <span className="font-semibold">{program.name}</span>
                    <span className="font-mono text-meta text-foreground/80">{earnText(program)}</span>
                  </a>
                </li>
              ))}
            </ul>
            <details data-toc-mobile className="group mt-4 rounded-xl border border-border bg-card min-[1280px]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                On this page · {shown.length} programs
                <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-border px-4 py-3">{tocList}</div>
            </details>
          </div>
        </section>
      )}

      <div className="relative">
        <aside className="absolute inset-y-0 left-4 hidden w-28 min-[1280px]:block" aria-label="On this page">
          <nav data-toc-rail className="sticky top-20 pt-12">
            <p className="oa-label mb-3">On this page</p>
            {tocList}
          </nav>
        </aside>

        <section id="side-by-side" className="oa-band scroll-mt-20">
          <div className="mx-auto max-w-[760px] lg:max-w-[920px]">
            <h2 className="text-lg font-semibold">Side by side</h2>
            <SortableTermsTable columns={columns} rows={rows} />
            <p className="mt-2 text-meta text-muted-foreground">{NOT_STATED}: the brand does not publish it, and we never fill in a guess.</p>
          </div>
        </section>

        {post.lookFor && (
          <section id="what-to-look-for" className="oa-band scroll-mt-20">
            <div className="mx-auto max-w-[760px]">
              <h2 className="text-lg font-semibold">{post.lookFor.heading}</h2>
              <p className="text-base leading-relaxed text-foreground/80 mt-3">{post.lookFor.intro}</p>
              <dl className="mt-4 space-y-4">
                {post.lookFor.criteria.map((c) => (
                  <div key={c.name}>
                    <dt className="font-semibold">{c.name}</dt>
                    <dd className="mt-1 text-base leading-relaxed text-foreground/80">
                      {c.text}
                      {c.link && (
                        <>
                          {" "}
                          <Link href={c.link.href} prefetch={false} className="underline underline-offset-4">{c.link.label}</Link>
                        </>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              {split.total > 0 && <TypeChart split={split} heading={chartHeading} />}
            </div>
          </section>
        )}

        <section aria-label="Programs" className="oa-band">
          <div className="mx-auto max-w-[760px]">
            <h2 className="sr-only">The programs</h2>
            {shown.map(({ program, copy }, i) => (
              <ProgramSection key={program.slug} program={program} copy={copy} index={i} campaign={post.slug} />
            ))}
          </div>
        </section>

        {considered.length > 0 && (
          <section id="also-considered" className="oa-band scroll-mt-20">
            <div className="mx-auto max-w-[760px]">
              <h2 className="text-lg font-semibold">Also considered</h2>
              <p className="text-meta text-muted-foreground mt-1">Other {list.query.toLowerCase()} in the registry, and why each is not above.</p>
              <ul data-also-considered className="mt-4 border-t border-border">
                {considered.map((g) => (
                  <li key={g.reason + (g.link?.href ?? "")} className="border-b border-border py-3 text-sm">
                    <p className="font-medium">
                      {g.reason}
                      {g.link && <>: <Link href={g.link.href} className="underline underline-offset-4">{g.link.label}</Link></>}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {g.programs.map((p, i) => (
                        <span key={p.slug}>
                          {i > 0 && ", "}
                          <Link href={`/programs/${p.slug}`} className="hover:text-foreground hover:underline underline-offset-4">{p.name}</Link>
                        </span>
                      ))}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <section id="how-we-chose" className="oa-band scroll-mt-20">
          <div className="mx-auto max-w-[760px]">
            <div data-how-we-chose className="rounded-xl border border-border bg-card px-5 py-5">
              <h2 className="text-lg font-semibold">How we chose</h2>
              <dl className="mt-3 space-y-3 text-sm leading-relaxed">
                <div>
                  <dt className="oa-label">Data</dt>
                  <dd className="mt-1 text-foreground/80">
                    The OpenAffiliate registry, {livePrograms.length.toLocaleString("en-US")} live programs, each term read on the brand&apos;s own affiliate page or terms and stored with a quote and the day we read it.{" "}
                    <Link href="/programs" prefetch={false} className="underline underline-offset-4">Browse the directory</Link>
                    {list.filter && (
                      <>
                        {" "}or{" "}
                        <Link href={`/programs?${list.filter}`} prefetch={false} className="underline underline-offset-4">filter it the same way</Link>
                      </>
                    )}
                    .
                  </dd>
                </div>
                <div>
                  <dt className="oa-label">Criteria and order</dt>
                  <dd className="mt-1 text-foreground/80">{post.howWeChose}</dd>
                </div>
                <div>
                  <dt className="oa-label">Freshness</dt>
                  <dd className="mt-1 text-foreground/80">{FRESHNESS_RULE}</dd>
                </div>
                <div>
                  <dt className="oa-label">Money</dt>
                  <dd className="mt-1 text-foreground/80">Some links are tracked so we can see which programs readers choose. Rankings are never paid for.</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        <section id="faq" className="oa-band scroll-mt-20">
          <div className="mx-auto max-w-[760px]">
            <h2 className="text-lg font-semibold">FAQ</h2>
            <div className="mt-2">
              <FaqAccordion items={faq} />
            </div>
          </div>
        </section>
      </div>

      <ChildLists list={list} narrow />

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

      <MonthChanges post={post} list={list} until={range?.[1]} />
    </article>
  );
}
