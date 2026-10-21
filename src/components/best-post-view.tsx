import { FaqAccordion } from "@/components/faq-accordion";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { ProgramLogo } from "@/components/program-logo";
import { AffitorLink } from "@/components/affitor-link";
import { PostProgramBlock } from "@/components/post-program-block";
import { serializeJsonLd } from "@/lib/json-ld";
import { livePrograms, categoryToSlug } from "@/lib/programs";
import { AFFITOR_MARKETPLACE, affitorUrl } from "@/lib/affitor-link";
import { BEST_LISTS, bestPath, updatedText, type BestList } from "@/lib/best-lists";
import { ChildLists } from "@/components/best-list-view";
import {
  DISCLOSURE,
  FRESHNESS_RULE,
  checkedRange,
  checkedText,
  cookieText,
  earnText,
  payoutText,
  postFaq,
  postPageTitle,
  postTitle,
  type BestPost,
  type PostSelection,
} from "@/lib/best-posts";

const SITE = "https://openaffiliate.dev";

export function bestPostMetadata(post: BestPost, selection: PostSelection, path: string): Metadata {
  // Absolute: postPageTitle is the whole tag, so the layout adds no suffix.
  const title = postPageTitle(post, selection);
  return {
    title: { absolute: title },
    description: post.description,
    alternates: { canonical: path, types: { "text/markdown": `${SITE}${path}.md` } },
    openGraph: {
      title,
      description: post.description,
      url: `${SITE}${path}`,
      siteName: "OpenAffiliate",
      type: "article",
      images: ["/opengraph-image"],
    },
  };
}

const th = "oa-label py-2.5 px-3 text-left font-medium bg-sunk";
const td = "py-3 px-3 text-sm text-foreground/80";

/** Programs on this list added or re-checked in the 30 days up to the post's newest check (inclusive). */
function monthChanges(list: BestList, until: string | undefined) {
  if (!until) return null;
  const from = new Date(Date.parse(`${until}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
  const inWindow = (d?: string | null) => Boolean(d && d.slice(0, 10) >= from && d.slice(0, 10) <= until);
  const on = livePrograms.filter(list.qualifies);
  const newest = (a: { d: string }, b: { d: string }) => b.d.localeCompare(a.d);
  return {
    from,
    total: on.length,
    added: on.filter((p) => inWindow(p.createdAt)).map((p) => ({ slug: p.slug, name: p.name, d: p.createdAt.slice(0, 10) })).sort(newest),
    // A re-check is a check after the day the program was added; the add-day check is not one.
    rechecked: on.filter((p) => p.verified && inWindow(p.lastVerifiedAt) && (p.lastVerifiedAt ?? "").slice(0, 10) > p.createdAt.slice(0, 10)).map((p) => ({ slug: p.slug, name: p.name, d: (p.lastVerifiedAt ?? "").slice(0, 10) })).sort(newest),
  };
}

function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** An editorial post on a list URL, in the redesign's framed layout. */
export function BestPostView({
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
  const faq = postFaq(post, selection);
  const range = checkedRange(selection);
  const url = `${SITE}${path}`;
  const { shown } = selection;
  const bySlug = new Map(shown.map((s) => [s.program.slug, s]));
  const picks = post.picks.flatMap((pick) => {
    const s = bySlug.get(pick.slug);
    return s ? [{ label: pick.label, ...s }] : [];
  });
  const related = post.related.flatMap((slug) => BEST_LISTS.filter((l) => l.slug === slug));
  const month = monthChanges(list, range?.[1]);
  // A post tied to a registry category links "more" to that category; a cross-category list has no such page.
  const moreHref = post.category ? `/categories/${categoryToSlug(post.category)}` : null;
  type Change = { slug: string; name: string; d: string };
  const columns: { name: string; rows: Change[] }[] = month ? [{ name: "Added", rows: month.added }, { name: "Terms re-checked", rows: month.rechecked }] : [];
  const changeList = (rows: Change[]) => (
    <ul className="mt-2 border-t border-border">
      {rows.slice(0, 6).map((r) => (
        <li key={r.slug} className="flex justify-between gap-3 border-b border-border py-2 text-sm">
          <Link href={`/programs/${r.slug}`} className="hover:underline underline-offset-4">{r.name}</Link>
          <span className="font-mono text-meta text-muted-foreground">{shortDate(r.d)}</span>
        </li>
      ))}
    </ul>
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
          <p className="text-meta text-muted-foreground mt-3">
            By the OpenAffiliate team{range && <> · Updated <time dateTime={range[1]}>{updatedText(range[1])}</time> · Terms checked between <span className="whitespace-nowrap">{range[0]}</span> and <span className="whitespace-nowrap">{range[1]}</span></>}
          </p>
          <p className="text-lg leading-relaxed text-foreground/80 mt-5">{post.intro}</p>
          <p data-post-disclosure className="text-sm text-muted-foreground mt-5 rounded-xl border border-border bg-sunk px-4 py-3">
            {DISCLOSURE}
          </p>
        </div>
      </header>

      {picks.length > 0 && (
        <section className="oa-band">
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
          </div>
        </section>
      )}

      {month && (month.added.length > 0 || month.rechecked.length > 0) && (
        <section className="oa-band">
          <div className="mx-auto max-w-[760px]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">What changed this month</h2>
              <span className="text-meta text-muted-foreground">{shortDate(month.from)} to {shortDate(range![1])}</span>
            </div>
            <p className="text-meta text-muted-foreground mt-1">Across all {month.total} live programs {post.category ? "in this category" : "that fit this list"} on OpenAffiliate, not only the ones above.</p>
            <div className="mt-3 grid gap-6 sm:grid-cols-2 sm:gap-8">
              {columns.map(({ name, rows }) => (
                <div key={name}>
                  <p className="oa-label">{name} · {rows.length}</p>
                  {changeList(rows)}
                  {rows.length > 6 && (moreHref
                    ? <Link href={moreHref} className="mt-2 inline-block text-meta text-muted-foreground underline underline-offset-4 decoration-border hover:text-foreground">and {rows.length - 6} more</Link>
                    : <p className="mt-2 text-meta text-muted-foreground">and {rows.length - 6} more</p>)}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="oa-band">
        <div className="mx-auto max-w-[760px]">
          <h2 className="text-lg font-semibold">Side by side</h2>
          <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card" tabIndex={0} aria-label="Programs side by side">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className={th}>Program</th>
                  <th className={th}>You earn</th>
                  <th className={`${th} hidden sm:table-cell`}>Cookie</th>
                  <th className={`${th} hidden sm:table-cell`}>Payout</th>
                  <th className={`${th} hidden whitespace-nowrap sm:table-cell`}>Terms checked</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ program }) => (
                  <tr key={program.slug} className="border-t border-border hover:bg-sunk transition-colors">
                    <th scope="row" className="py-3 px-3 text-left font-normal">
                      <Link href={`/programs/${program.slug}`} className="flex items-center gap-2 text-sm font-medium">
                        <ProgramLogo slug={program.slug} name={program.name} size={24} className="shrink-0" />
                        {program.name}
                      </Link>
                    </th>
                    <td className={td}>{earnText(program)}</td>
                    <td className={`${td} hidden sm:table-cell`}>{cookieText(program)}</td>
                    <td className={`${td} hidden sm:table-cell`}>{payoutText(program)}</td>
                    <td className={`${td} hidden whitespace-nowrap font-mono text-meta sm:table-cell`}>{checkedText(program)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="oa-band">
        <div className="mx-auto max-w-[760px]">
          {shown.map(({ program, copy }, i) => (
            <PostProgramBlock key={program.slug} program={program} copy={copy} index={i} campaign={post.slug} />
          ))}
          {post.affitor && (
            <p className="mt-2 text-sm">
              {post.affitor.before}
              <AffitorLink
                href={affitorUrl("blog", post.slug, AFFITOR_MARKETPLACE)}
                source="blog"
                cta="marketplace"
                newTab
                className="underline underline-offset-4"
              >
                {post.affitor.anchor}
              </AffitorLink>
              {post.affitor.after}
            </p>
          )}
        </div>
      </section>

      <section className="oa-band">
        <div className="mx-auto max-w-[760px]">
          <h2 className="text-lg font-semibold">How we chose</h2>
          <p className="text-base leading-relaxed text-foreground/80 mt-3">
            {post.howWeChose} {FRESHNESS_RULE} Every program here is also in the OpenAffiliate{" "}
            <Link href="/programs" prefetch={false} className="underline underline-offset-4">affiliate program directory</Link>, with{" "}
            {livePrograms.length.toLocaleString("en-US")} programs in all.
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
          {(post.leftOut ?? []).map((l) => (
            <p key={l.name} className="text-sm text-muted-foreground mt-2">
              <span className="font-medium text-foreground">Left out: {l.name}</span>, {l.reason}
            </p>
          ))}
          {faq.length > 0 && (
            <>
              <h2 className="text-lg font-semibold mt-10">FAQ</h2>
              <div className="mt-2">
                <FaqAccordion items={faq} />
              </div>
            </>
          )}
        </div>
      </section>

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
    </article>
  );
}
