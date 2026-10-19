import type { Metadata } from "next";
import Link from "next/link";
import { TrackPageView } from "@/components/track-page-view";
import { serializeJsonLd } from "@/lib/json-ld";
import { blogEntries, type BlogEntry } from "@/lib/blog";

const SITE = "https://openaffiliate.dev";
const DESCRIPTION =
  "Guides to the best affiliate programs and ranked lists rebuilt from the registry, newest first. Every figure links a program page with its check date.";

export const metadata: Metadata = {
  title: "Blog: Affiliate Program Guides and Lists",
  description: DESCRIPTION,
  alternates: {
    canonical: "/blog",
    types: { "text/markdown": `${SITE}/blog.md` },
  },
  openGraph: {
    title: "Blog: Affiliate Program Guides and Lists | OpenAffiliate",
    description: DESCRIPTION,
    url: `${SITE}/blog`,
    siteName: "OpenAffiliate",
    images: ["/opengraph-image"],
  },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10-18" → "Oct 18, 2026", without the server's locale. */
function shortDate(iso: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : "";
}

function Rows({ entries, meta }: { entries: BlogEntry[]; meta: (e: BlogEntry) => string }) {
  return (
    <ul>
      {entries.map((e) => (
        <li key={e.href} className="border-b border-border">
          <Link href={e.href} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5 py-3 hover:bg-sunk transition-colors sm:grid-cols-[112px_minmax(0,1fr)_auto]">
            <time dateTime={e.date ?? undefined} className="order-2 col-span-2 font-mono text-xs text-muted-foreground sm:order-none sm:col-span-1">{shortDate(e.date)}</time>
            <span className="min-w-0 text-sm font-medium">{e.title}</span>
            <span className="whitespace-nowrap font-mono text-xs text-muted-foreground tabular-nums">{meta(e)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** /blog: the editorial posts and every ranked list, compact rows, newest first. URLs stay under /best. */
export default function BlogPage() {
  const { posts, lists } = blogEntries();
  const all = [...posts, ...lists];
  return (
    <div className="oa-frame">
      <TrackPageView />
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "CollectionPage",
                name: "Guides and ranked lists",
                description: DESCRIPTION,
                url: `${SITE}/blog`,
                isPartOf: { "@id": `${SITE}/#website` },
                publisher: { "@id": `${SITE}/#organization` },
                mainEntity: {
                  "@type": "ItemList",
                  numberOfItems: all.length,
                  itemListElement: all.map((e, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}${e.href}`, name: e.title })),
                },
              },
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "OpenAffiliate", item: SITE },
                  { "@type": "ListItem", position: 2, name: "Blog" },
                ],
              },
            ],
          }),
        }}
      />
      <header className="oa-band !py-8 md:!py-10">
        <p className="oa-label">Blog</p>
        <h1 className="mt-2 text-title md:text-display font-semibold tracking-[-0.03em]">Guides and ranked lists</h1>
        <p className="mt-1 font-mono text-meta text-muted-foreground tabular-nums">{posts.length} posts · {lists.length} ranked lists</p>
      </header>

      <section className="oa-band" aria-labelledby="blog-posts-h">
        <div className="flex items-baseline justify-between gap-4 border-b border-line-strong pb-2">
          <h2 id="blog-posts-h" className="oa-label">Posts</h2>
          <span className="oa-label">Newest first</span>
        </div>
        <Rows entries={posts} meta={(e) => `${e.programs} picks`} />
      </section>

      <section className="oa-band" aria-labelledby="blog-lists-h">
        <div className="flex items-baseline justify-between gap-4 border-b border-line-strong pb-2">
          <h2 id="blog-lists-h" className="oa-label">Ranked lists</h2>
          <span className="oa-label">Rebuilt from the registry</span>
        </div>
        <Rows entries={lists} meta={(e) => `${e.programs} programs · ${e.verified} verified`} />
      </section>
    </div>
  );
}
