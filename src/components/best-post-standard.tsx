import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProgramLogo } from "@/components/program-logo";
import { PostApplyLink } from "@/components/post-apply-link";
import { serializeJsonLd } from "@/lib/json-ld";
import { type Program } from "@/lib/programs";
import { blogApplyHref } from "@/lib/apply-cta";
import { type BestList } from "@/lib/best-lists";
import { FRESHNESS_RULE, checkedRange, postTitle, type BestPost, type PostProgram, type PostSelection } from "@/lib/best-posts";
import { AFFITOR_LINE, dateText, picksSentence, programDetails, prosCons, readMoreLinks, splitLink, standardFaq, tableRow, typeSplit } from "@/lib/best-standard";
import { CAPTURES } from "@/lib/best-captures";
import { AffitorLink } from "@/components/affitor-link";
import { AFFITOR_MARKETPLACE, affitorUrl } from "@/lib/affitor-link";

const SITE = "https://openaffiliate.dev";

/** The short disclosure under the intro. */
export const SHORT_DISCLOSURE = "Some links on this page are tracked so we can see which programs readers choose. Rankings are never paid for.";

/**
 * The post's byline: "By the OpenAffiliate team · Updated Oct 19, 2026". An
 * `editor` (a named person with a bio page) replaces the team once one is named.
 */
export function PostByline({ editor, updated }: { editor?: { name: string; href: string }; updated?: string }) {
  return (
    <p data-post-byline className="text-meta text-muted-foreground mt-3">
      By {editor ? <Link href={editor.href} className="text-foreground underline underline-offset-4">{editor.name}</Link> : "the OpenAffiliate team"}
      {updated && <> · Updated <time dateTime={updated}>{dateText(updated)}</time></>}
    </p>
  );
}

const prose = "text-base leading-relaxed text-foreground/80";
const linkClass = "font-medium text-foreground underline underline-offset-4";

/** A tinted box: "Read more" links and the FAQ. */
function Tinted({ children, ...rest }: { children: React.ReactNode } & React.HTMLAttributes<HTMLElement>) {
  return (
    <aside {...rest} className="my-10 border-t-2 border-good bg-sunk px-5 py-6 sm:px-7">
      {children}
    </aside>
  );
}

function ReadMore({ links, id }: { links: { href: string; label: string }[]; id: string }) {
  if (!links.length) return null;
  return (
    <Tinted aria-labelledby={id} data-read-more>
      <h2 id={id} className="text-subtitle font-semibold">Read more</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className={linkClass}>{l.label}</Link>
          </li>
        ))}
      </ul>
    </Tinted>
  );
}

/** One program: "N. Brand", the capture, the why with the brand's affiliate page linked inline, details, pros and cons. */
function ProgramSection({ program, copy, index, campaign }: { program: Program; copy: PostProgram; index: number; campaign: string }) {
  const capture = CAPTURES[program.slug];
  const parts = splitLink(copy.why);
  const { pros, cons } = prosCons(program);
  const applyLink = (text: string) => (
    <PostApplyLink href={blogApplyHref(program, campaign)} slug={program.slug} network={program.network} post={campaign} className={linkClass}>
      {text}
    </PostApplyLink>
  );
  return (
    <section id={program.slug} data-post-program={program.slug} className="scroll-mt-20 pt-10">
      <h2 className="text-subtitle font-semibold tracking-[-0.02em]">
        {index + 1}. {program.name}
      </h2>
      {capture ? (
        <Image
          src={capture.src}
          width={capture.width}
          height={capture.height}
          alt={`${program.name} affiliate page, captured ${dateText(capture.captured)}`}
          title={`${program.name} affiliate page, captured ${dateText(capture.captured)}`}
          loading="lazy"
          sizes="(max-width: 760px) 100vw, 760px"
          className="mt-5 h-auto w-full rounded-lg border border-border"
        />
      ) : (
        <div data-capture-fallback className="mt-5 flex items-center gap-4 rounded-lg border border-border bg-sunk px-5 py-6">
          <ProgramLogo slug={program.slug} name={program.name} size={48} className="shrink-0" />
          <span className="text-lg font-semibold">{program.name}</span>
        </div>
      )}
      <p className={`${prose} mt-5`}>
        {parts ? (
          <>
            {parts[0]}
            {applyLink(parts[1])}
            {parts[2]}
          </>
        ) : (
          copy.why
        )}
      </p>
      {copy.verdict && <p className={`${prose} mt-4`}>{copy.verdict}</p>}
      <p className={`${prose} mt-4`}>Affiliate program details:</p>
      <ul data-details className={`${prose} mt-2 list-disc space-y-1.5 pl-5`}>
        {programDetails(program).map(([label, value]) => (
          <li key={label}>
            <strong className="font-semibold text-foreground">{label}:</strong> {value}
          </li>
        ))}
      </ul>
      {pros.length > 0 && (
        <>
          <p className="mt-5 font-semibold">Pros:</p>
          <ul data-pros className={`${prose} mt-2 list-disc space-y-1 pl-5`}>
            {pros.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </>
      )}
      {cons.length > 0 && (
        <>
          <p className="mt-4 font-semibold">Cons:</p>
          <ul data-cons className={`${prose} mt-2 list-disc space-y-1 pl-5`}>
            {cons.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </>
      )}
    </section>
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
  const faq = standardFaq(post, selection, typeSplit(post, selection));
  const url = `${SITE}${path}`;
  const { shown } = selection;
  const lede = picksSentence(post, selection);
  const readMore = readMoreLinks(post);
  const th = "border border-border bg-sunk px-3 py-2.5 text-left text-sm font-semibold";
  const td = "border border-border px-3 py-2.5 text-sm text-foreground/80 align-top";

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
      <header className="oa-band pt-12 pb-8">
        <div className="mx-auto max-w-[760px]">
          <Link href={parent.href} className="inline-flex items-center gap-1.5 text-meta text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="size-3.5" aria-hidden />
            {parent.name}
          </Link>
          <h1 className="text-title md:text-display font-semibold tracking-[-0.03em] mt-4">{title}</h1>
          <PostByline updated={range?.[1]} />
          <p data-post-intro className="text-lg leading-relaxed text-foreground/80 mt-5">
            {post.intro}
            {lede && <> {lede}</>}
          </p>
          <p data-post-disclosure className="text-sm text-muted-foreground mt-4">{SHORT_DISCLOSURE}</p>
        </div>
      </header>

      <div className="oa-band">
        <div className="mx-auto max-w-[760px]">
          <table data-terms-table className="hidden w-full border-collapse sm:table">
            <thead>
              <tr>
                {["Program", "Commission", "Cookie", "Payout"].map((h) => (
                  <th key={h} scope="col" className={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map(({ program: p }) => {
                const row = tableRow(p);
                return (
                  <tr key={p.slug}>
                    <th scope="row" className={`${td} text-left font-medium text-foreground`}>
                      <a href={`#${p.slug}`} className="flex items-center gap-2 hover:underline underline-offset-4">
                        <ProgramLogo slug={p.slug} name={p.name} size={24} className="shrink-0" />
                        {p.name}
                      </a>
                    </th>
                    <td className={td}>{row.commission}</td>
                    <td className={td}>{row.cookie}</td>
                    <td className={td}>{row.payout}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <ul data-terms-stack className="border-t border-border sm:hidden">
            {shown.map(({ program: p }) => {
              const row = tableRow(p);
              return (
                <li key={p.slug} className="border-b border-border py-3 text-sm">
                  <a href={`#${p.slug}`} className="flex items-center gap-2 font-semibold underline underline-offset-4">
                    <ProgramLogo slug={p.slug} name={p.name} size={24} className="shrink-0" />
                    {p.name}
                  </a>
                  <p className="mt-1 text-foreground/80">{row.commission}</p>
                  <p className="text-muted-foreground">Cookie: {row.cookie} · Payout: {row.payout}</p>
                </li>
              );
            })}
          </ul>

          {post.lookFor && (
            <section id="how-to-choose" className="scroll-mt-20 pt-12">
              <h2 className="text-subtitle font-semibold tracking-[-0.02em]">{post.lookFor.heading}</h2>
              <p className={`${prose} mt-4`}>{post.lookFor.intro}</p>
              <ul data-how-to-choose className={`${prose} mt-3 list-disc space-y-2 pl-5`}>
                {post.lookFor.criteria.map((c) => (
                  <li key={c.name}>
                    <strong className="font-semibold text-foreground">{c.name}:</strong> {c.text}
                    {c.link && (
                      <>
                        {" "}
                        <Link href={c.link.href} prefetch={false} className={linkClass}>{c.link.label}</Link>.
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {shown.map(({ program, copy }, i) => (
            <ProgramSection key={program.slug} program={program} copy={copy} index={i} campaign={post.slug} />
          ))}

          <section id="how-we-chose" className="scroll-mt-20 pt-12">
            <h2 className="text-subtitle font-semibold tracking-[-0.02em]">How we chose</h2>
            <p data-how-we-chose className={`${prose} mt-4`}>
              {post.howWeChose} {FRESHNESS_RULE} Rankings are never paid for.{" "}
              {list.filter && (
                <Link href={`/programs?${list.filter}`} prefetch={false} className={linkClass}>See every program in this category</Link>
              )}
              {list.filter && "."}
            </p>
          </section>

          <p data-affitor-line className={`${prose} mt-10 border-t border-border pt-6`}>
            {AFFITOR_LINE.before}
            <AffitorLink href={affitorUrl("blog", post.slug, AFFITOR_MARKETPLACE)} source="blog" cta="marketplace" newTab className={linkClass}>
              {AFFITOR_LINE.anchor}
            </AffitorLink>
            {AFFITOR_LINE.after}
          </p>

          <ReadMore id="read-more" links={readMore} />

          <Tinted id="faq" aria-labelledby="faq-title" data-faq>
            <h2 id="faq-title" className="text-subtitle font-semibold">{list.query} FAQ</h2>
            {faq.map((f) => (
              <div key={f.q} className="mt-5">
                <h3 className="text-base font-semibold">{f.q}</h3>
                <p className={`${prose} mt-2`}>{f.a}</p>
              </div>
            ))}
          </Tinted>
        </div>
      </div>
    </article>
  );
}
