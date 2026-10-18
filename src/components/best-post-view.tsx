import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { ProgramLogo } from "@/components/program-logo";
import { AffitorLink } from "@/components/affitor-link";
import { PostApplyLink } from "@/components/post-apply-link";
import { serializeJsonLd } from "@/lib/json-ld";
import { networkName, IN_HOUSE } from "@/lib/programs";
import { AFFITOR_MARKETPLACE, affitorUrl } from "@/lib/affitor-link";
import { applyButton, blogApplyHref } from "@/lib/apply-cta";
import { BEST_LISTS, bestPath, type BestList } from "@/lib/best-lists";
import {
  DISCLOSURE,
  SAME_TEAM,
  checkedRange,
  checkedText,
  cookieText,
  earnText,
  payoutText,
  postFaq,
  postTitle,
  sameTeam,
  type BestPost,
  type PostSelection,
} from "@/lib/best-posts";

const SITE = "https://openaffiliate.dev";

export function bestPostMetadata(post: BestPost, selection: PostSelection, path: string): Metadata {
  const title = postTitle(post, selection);
  return {
    title,
    description: post.description,
    alternates: { canonical: path, types: { "text/markdown": `${SITE}${path}.md` } },
    openGraph: {
      title: `${title} | OpenAffiliate`,
      description: post.description,
      url: `${SITE}${path}`,
      siteName: "OpenAffiliate",
      type: "article",
      images: ["/opengraph-image"],
    },
  };
}

const th = "py-3 px-3 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wide";
const td = "py-3 px-3 text-xs text-muted-foreground";

/** An editorial post on a list URL. Styling stays in the current system; the redesign restyles it. */
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

  return (
    <article className="mx-auto max-w-3xl px-6 py-10">
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
      <Link
        href={parent.href}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {parent.name}
      </Link>

      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-xs text-muted-foreground mt-3">
          By the OpenAffiliate team{range && <> · Terms checked between {range[0]} and {range[1]}</>}
        </p>
        <p className="text-base text-muted-foreground mt-5 leading-relaxed">{post.intro}</p>
        <p data-post-disclosure className="text-xs text-muted-foreground mt-4 rounded-lg border border-border/40 p-3">
          {DISCLOSURE}
          {sameTeam(post, selection) && <> {SAME_TEAM}</>}
        </p>
      </header>

      {picks.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">Quick picks</h2>
          <ul className="space-y-2 text-sm">
            {picks.map(({ label, program }) => (
              <li key={label} className="flex flex-wrap gap-x-2">
                <span className="font-medium">{label}:</span>
                <a href={`#${program.slug}`} className="underline underline-offset-4">{program.name}</a>
                <span className="text-muted-foreground">· {earnText(program)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-3">Side by side</h2>
        <div className="rounded-xl border border-border/40 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className={th}>Program</th>
                <th className={th}>You earn</th>
                <th className={th}>Cookie</th>
                <th className={th}>Payout</th>
                <th className={th}>Terms checked</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ program }) => (
                <tr key={program.slug} className="border-t border-border/20">
                  <td className="py-3 px-3">
                    <Link href={`/programs/${program.slug}`} className="flex items-center gap-2 font-medium">
                      <ProgramLogo slug={program.slug} name={program.name} size={24} className="shrink-0" />
                      {program.name}
                    </Link>
                  </td>
                  <td className={td}>{earnText(program)}</td>
                  <td className={td}>{cookieText(program)}</td>
                  <td className={td}>{payoutText(program)}</td>
                  <td className={td}>{checkedText(program)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="space-y-10">
        {shown.map(({ program, copy }, i) => (
          <section key={program.slug} id={program.slug} data-post-program={program.slug} className="scroll-mt-20">
            <div className="flex items-center gap-3 mb-2">
              <ProgramLogo slug={program.slug} name={program.name} size={40} className="shrink-0" />
              <div>
                <h2 className="text-xl font-semibold">{i + 1}. {program.name}</h2>
                <p className="text-sm text-muted-foreground">{copy.bestFor}</p>
              </div>
            </div>
            <p className="text-sm leading-relaxed">{copy.why}</p>
            {copy.notFor && <p className="text-sm text-muted-foreground mt-2"><span className="font-medium text-foreground">Not for:</span> {copy.notFor}</p>}
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-sm">
              {[
                ["You earn", earnText(program)],
                ["Cookie", cookieText(program)],
                ["Payout", payoutText(program)],
                ["Runs on", program.network && program.network !== IN_HOUSE ? networkName(program.network) : "Its own program"],
              ].map(([dt, dd]) => (
                <div key={dt} className="rounded-lg border border-border/40 p-3">
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{dt}</dt>
                  <dd className="mt-1">{dd}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap items-center gap-4 mt-4 text-sm">
              <Link href={`/programs/${program.slug}`} className="underline underline-offset-4">Full terms</Link>
              <PostApplyLink
                href={blogApplyHref(program, post.slug)}
                slug={program.slug}
                post={post.slug}
                className="inline-flex items-center gap-1.5 rounded-lg bg-foreground text-background px-4 py-2 text-xs font-medium hover:bg-foreground/90"
              >
                {applyButton(program, "blog").label}
                <ExternalLink className="h-3 w-3" />
              </PostApplyLink>
              <span className="text-xs text-muted-foreground">Terms checked {checkedText(program)}</span>
            </div>
          </section>
        ))}
      </div>

      {post.affitor && (
        <p className="mt-10 text-sm">
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

      <section className="mt-10">
        <h2 className="text-lg font-semibold mb-3">How we chose</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">{post.howWeChose}</p>
        {(post.leftOut ?? []).map((l) => (
          <p key={l.name} className="text-sm text-muted-foreground mt-2">
            <span className="font-medium text-foreground">Left out: {l.name}</span>, {l.reason}
          </p>
        ))}
      </section>

      {faq.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold mb-3">FAQ</h2>
          <dl className="space-y-4">
            {faq.map((f) => (
              <div key={f.q}>
                <dt className="text-sm font-medium">{f.q}</dt>
                <dd className="text-sm text-muted-foreground mt-1">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <nav className="mt-10">
        <h2 className="text-lg font-semibold mb-3">Keep reading</h2>
        <div className="flex flex-col sm:flex-row flex-wrap gap-3">
          {related.map((l) => (
            <Link
              key={l.slug}
              href={bestPath(l)}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border/60 px-5 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
            >
              {l.h1}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ))}
        </div>
      </nav>
    </article>
  );
}
