import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProgramLogo } from "@/components/program-logo";
import { PostApplyLink } from "@/components/post-apply-link";
import { AffitorLink } from "@/components/affitor-link";
import { PostByline, ReadMore, SHORT_DISCLOSURE, Tinted, linkClass, prose } from "@/components/best-post-standard";
import { serializeJsonLd } from "@/lib/json-ld";
import { blogApplyHref } from "@/lib/apply-cta";
import { outboundUrl } from "@/lib/outbound-link";
import { AFFITOR_MARKETPLACE, affitorUrl } from "@/lib/affitor-link";
import { NETWORK_META } from "@/lib/network-meta";
import { NETWORK_CAPTURES } from "@/lib/best-captures";

import { AFFITOR_LINE, dateText, earnShown, splitLink } from "@/lib/best-standard";
import { NETWORKS_POST, networkEntries, networkPath, networkPostTitle, networkReadMoreLinks, networksFaq, softwareEntries, type NetworkEntry } from "@/lib/networks-post";

const SITE = "https://openaffiliate.dev";
const h2 = "text-subtitle font-semibold tracking-[-0.02em]";

/** The network's own page for partners, with the blog UTM; the Affitor marketplace through affitorUrl. */
export function networkHref(e: NetworkEntry, post: string): string {
  return e.network === "affitor" ? affitorUrl("blog", post, AFFITOR_MARKETPLACE) : outboundUrl(e.copy.partnerUrl, "blog", post, e.network);
}

function NetworkSection({ entry: e, index, post }: { entry: NetworkEntry; index: number; post: string }) {
  const capture = NETWORK_CAPTURES[e.network];
  const parts = splitLink(e.copy.why);
  const link = (text: string) => (
    <PostApplyLink href={networkHref(e, post)} slug={e.network} network={e.network} post={post} className={linkClass}>
      {text}
    </PostApplyLink>
  );
  const notRead = "Not read: its pages are off limits to our checks, so each program's own terms apply";
  return (
    <section id={e.network} data-post-network={e.network} className="scroll-mt-20 pt-10">
      <h2 className={h2}>
        {index + 1}. {e.name}
      </h2>
      {capture ? (
        <Image
          src={capture.src}
          width={capture.width}
          height={capture.height}
          alt={`${e.name} page for partners, captured ${dateText(capture.captured)}`}
          title={`${e.name} page for partners, captured ${dateText(capture.captured)}`}
          loading="lazy"
          sizes="(max-width: 760px) 100vw, 760px"
          className="mt-5 h-auto w-full rounded-lg border border-border"
        />
      ) : (
        <div data-capture-fallback className="mt-5 flex items-center gap-4 rounded-lg border border-border bg-sunk px-5 py-6">
          <ProgramLogo slug={e.network} name={e.name} src={NETWORK_META[e.network]?.logo ?? null} size={48} className="shrink-0" />
          <span className="text-lg font-semibold">{e.name}</span>
        </div>
      )}
      <p className={`${prose} mt-5`}>
        {parts ? (
          <>
            {parts[0]}
            {link(parts[1])}
            {parts[2]}
          </>
        ) : (
          e.copy.why
        )}
      </p>
      <p className={`${prose} mt-4`}>{e.copy.verdict}</p>
      <p className={`${prose} mt-4`}>Network details:</p>
      <ul data-details className={`${prose} mt-2 list-disc space-y-1.5 pl-5`}>
        <li>
          <strong className="font-semibold text-foreground">Programs in OpenAffiliate:</strong> {e.programs} live, {e.verified} verified.{" "}
          <Link href={networkPath(e.network)} className={linkClass}>See them all</Link>
        </li>
        <li>
          <strong className="font-semibold text-foreground">How partners get paid:</strong> {e.terms ? e.terms.paid.text : notRead}
        </li>
        <li>
          <strong className="font-semibold text-foreground">Joining:</strong> {e.terms ? e.terms.join.text : notRead}
        </li>
      </ul>
      {e.examples.length > 0 && (
        <>
          <p className="mt-5 font-semibold">Example programs:</p>
          <ul data-examples className={`${prose} mt-2 list-disc space-y-1 pl-5`}>
            {e.examples.map((p) => (
              <li key={p.slug}>
                <PostApplyLink href={blogApplyHref(p, post)} slug={p.slug} network={p.network} post={post} className={linkClass}>
                  {p.name}
                </PostApplyLink>
                : {earnShown(p)}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** /best/affiliate-networks: the networks in the registry on the standard post layout. */
export function BestNetworksPost({ path }: { path: string }) {
  const post = NETWORKS_POST;
  const entries = networkEntries(post);
  const software = softwareEntries();
  const title = networkPostTitle(entries);
  const faq = networksFaq(entries);
  const readMore = networkReadMoreLinks();
  const url = `${SITE}${path}`;
  const th = "border border-border bg-sunk px-3 py-2.5 text-left text-sm font-semibold";
  const td = "border border-border px-3 py-2.5 text-sm text-foreground/80 align-top";
  const paidCell = (e: NetworkEntry) => (e.terms ? e.terms.paid.text : "Each program's own terms");

  return (
    <article className="oa-frame" data-post-layout="networks">
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
                dateModified: post.checked,
                author: { "@id": `${SITE}/#organization` },
                publisher: { "@id": `${SITE}/#organization` },
                isPartOf: { "@id": `${SITE}/#website` },
                mainEntity: { "@id": `${url}#list` },
              },
              {
                "@type": "ItemList",
                "@id": `${url}#list`,
                name: title,
                numberOfItems: entries.length,
                itemListElement: entries.map((e, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}${networkPath(e.network)}`, name: e.name })),
              },
              {
                "@type": "FAQPage",
                mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
              },
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  { name: "OpenAffiliate", item: SITE },
                  { name: "Best Affiliate Programs", item: `${SITE}/best` },
                  { name: title },
                ].map((crumb, i) => ({ "@type": "ListItem", position: i + 1, ...crumb })),
              },
            ],
          }),
        }}
      />
      <header className="oa-band pt-12 pb-8">
        <div className="mx-auto max-w-[760px]">
          <Link href="/best" className="inline-flex items-center gap-1.5 text-meta text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="size-3.5" aria-hidden />
            Best Affiliate Programs
          </Link>
          <h1 className="text-title md:text-display font-semibold tracking-[-0.03em] mt-4">{title}</h1>
          <PostByline updated={post.checked} />
          <p data-post-intro className="text-lg leading-relaxed text-foreground/80 mt-5">{post.intro}</p>
          <p data-post-disclosure className="text-sm text-muted-foreground mt-4">{SHORT_DISCLOSURE}</p>
        </div>
      </header>

      <div className="oa-band">
        <div className="mx-auto max-w-[760px]">
          <table data-terms-table className="hidden w-full border-collapse sm:table">
            <thead>
              <tr>
                {["Network", "Programs here", "How partners get paid"].map((h) => (
                  <th key={h} scope="col" className={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.network}>
                  <th scope="row" className={`${td} text-left font-medium text-foreground`}>
                    <a href={`#${e.network}`} className="flex items-center gap-2 hover:underline underline-offset-4">
                      <ProgramLogo slug={e.network} name={e.name} src={NETWORK_META[e.network]?.logo ?? null} size={24} className="shrink-0" />
                      {e.name}
                    </a>
                  </th>
                  <td className={td}>{e.programs}</td>
                  <td className={td}>{paidCell(e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul data-terms-stack className="border-t border-border sm:hidden">
            {entries.map((e) => (
              <li key={e.network} className="border-b border-border py-3 text-sm">
                <a href={`#${e.network}`} className="flex items-center gap-2 font-semibold underline underline-offset-4">
                  <ProgramLogo slug={e.network} name={e.name} src={NETWORK_META[e.network]?.logo ?? null} size={24} className="shrink-0" />
                  {e.name}
                </a>
                <p className="mt-1 text-foreground/80">{e.programs} programs here</p>
                <p className="text-muted-foreground">{paidCell(e)}</p>
              </li>
            ))}
          </ul>

          <section id="how-to-choose" className="scroll-mt-20 pt-12">
            <h2 className={h2}>{post.lookFor.heading}</h2>
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

          {entries.map((e, i) => (
            <NetworkSection key={e.network} entry={e} index={i} post={post.slug} />
          ))}

          <section id="networks-and-software" className="scroll-mt-20 pt-12">
            <h2 className={h2}>{post.softwareHeading}</h2>
            <p className={`${prose} mt-4`}>{post.softwareText}</p>
            <ul data-software className={`${prose} mt-3 list-disc space-y-1.5 pl-5`}>
              {software.map((s) => (
                <li key={s.network}>
                  <strong className="font-semibold text-foreground">{s.name}:</strong> {s.programs} programs.{" "}
                  <Link href={networkPath(s.network)} className={linkClass}>See them</Link>
                </li>
              ))}
            </ul>
          </section>

          <section id="how-we-chose" className="scroll-mt-20 pt-12">
            <h2 className={h2}>How we chose</h2>
            <p data-how-we-chose className={`${prose} mt-4`}>
              {post.howWeChose} Rankings are never paid for.{" "}
              <Link href="/networks" prefetch={false} className={linkClass}>See every network</Link>.
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
            <h2 id="faq-title" className="text-subtitle font-semibold">Affiliate Networks FAQ</h2>
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
