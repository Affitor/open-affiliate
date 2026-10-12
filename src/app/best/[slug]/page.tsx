import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { TrackPageView } from "@/components/track-page-view";
import { ArrowLeft, ArrowRight, BadgeCheck, Percent, Trophy, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProgramLogo } from "@/components/program-logo";
import { serializeJsonLd } from "@/lib/json-ld";
import { commissionDisplay, networkName, IN_HOUSE } from "@/lib/programs";
import { BEST_LISTS, SHARED_RULES, bestListCopy, buildBestList, getBestList } from "@/lib/best-lists";

const SITE = "https://openaffiliate.dev";

export function generateStaticParams() {
  return BEST_LISTS.map((list) => ({ slug: list.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const list = getBestList(slug);
  if (!list) return { title: "List Not Found" };

  // The root layout's title template appends " | OpenAffiliate";
  // openGraph.title is not templated, so it adds its own.
  return {
    title: list.title,
    description: list.description,
    alternates: {
      canonical: `/best/${slug}`,
      types: { "text/markdown": `${SITE}/best/${slug}.md` },
    },
    openGraph: {
      title: `${list.title} | OpenAffiliate`,
      description: list.description,
      url: `${SITE}/best/${slug}`,
      siteName: "OpenAffiliate",
      images: ["/opengraph-image"],
    },
  };
}

const th = "py-3 px-3 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wide";

export default async function BestListPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const list = getBestList(slug);
  if (!list) notFound();

  const data = buildBestList(list);
  const { intro, faq } = bestListCopy(data);
  const url = `${SITE}/best/${slug}`;
  const stats = [
    { icon: Users, label: "Programs", value: String(data.total) },
    { icon: BadgeCheck, label: "Verified", value: String(data.verified.length) },
    { icon: Trophy, label: "Top verified", value: data.verified[0]?.name ?? "—" },
    { icon: Percent, label: "Median verified %", value: data.medianSinglePct != null ? `${data.medianSinglePct}%` : "—" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <TrackPageView />
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "ItemList",
                name: list.h1,
                description: intro,
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
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "OpenAffiliate", item: SITE },
                  { "@type": "ListItem", position: 2, name: "Categories", item: `${SITE}/categories` },
                  { "@type": "ListItem", position: 3, name: list.h1 },
                ],
              },
            ],
          }),
        }}
      />
      <Link
        href="/categories"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All Categories
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">{list.h1}</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-3xl">{intro}</p>
        <p className="text-xs text-muted-foreground mt-3 max-w-3xl">
          <span className="font-medium text-foreground">How we picked:</span> {list.criteria} {SHARED_RULES}
          {data.checked && ` Last checked ${data.checked}, the most recent verification among these programs.`}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {stats.map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-xl border border-border/40 bg-card/30 p-4">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <Icon className="h-3 w-3" />
              <span className="text-[10px] uppercase tracking-wide">{label}</span>
            </div>
            <p className="text-2xl font-bold truncate" title={value}>{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border/40 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className={`w-10 text-center ${th}`}>#</th>
                <th className={`min-w-[160px] ${th}`}>Program</th>
                <th className={`min-w-[110px] ${th}`}>Commission</th>
                <th className={`hidden sm:table-cell ${th}`}>Type</th>
                <th className={`min-w-[90px] ${th}`}>Duration</th>
                <th className={`hidden sm:table-cell ${th}`}>Cookie</th>
                <th className={`hidden md:table-cell ${th}`}>Network</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((program, i) => (
                <tr key={program.slug} className="border-t border-border/20 hover:bg-muted/20 transition-colors group">
                  <td className="py-3 px-3 text-center text-xs font-medium text-muted-foreground">{i + 1}</td>
                  <td className="py-3 px-3">
                    <Link href={`/programs/${program.slug}`} className="flex items-center gap-3">
                      <ProgramLogo slug={program.slug} name={program.name} size={32} className="shrink-0" />
                      <div className="min-w-0">
                        <span className="text-sm font-medium block group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                          {program.name}
                        </span>
                        {program.verified ? (
                          <Badge
                            variant="outline"
                            className="text-[9px] px-1 py-0 border-emerald-600/30 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 mt-0.5"
                          >
                            verified
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground mt-0.5">
                            not verified
                          </Badge>
                        )}
                      </div>
                    </Link>
                  </td>
                  <td className="py-3 px-3">
                    {/* Only a verified figure gets the confirmed green; an unverified one is the submitter's claim. */}
                    <span
                      className={
                        program.verified
                          ? "text-sm font-semibold text-emerald-600 dark:text-emerald-400"
                          : "text-sm text-muted-foreground"
                      }
                    >
                      {commissionDisplay(program.commission)}
                    </span>
                  </td>
                  <td className="py-3 px-3 hidden sm:table-cell">
                    <Badge variant="secondary" className="text-[10px]">
                      {program.commission.type}
                    </Badge>
                  </td>
                  <td className="py-3 px-3 text-xs text-muted-foreground">{program.commission.duration ?? "—"}</td>
                  <td className="py-3 px-3 hidden sm:table-cell text-xs text-muted-foreground">
                    {program.cookieDays != null ? `${program.cookieDays}d` : "—"}
                  </td>
                  <td className="py-3 px-3 hidden md:table-cell text-xs text-muted-foreground">
                    {networkName(program.network ?? IN_HOUSE)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-10 max-w-3xl">
        <h2 className="text-base font-semibold mb-3">{list.h1} FAQ</h2>
        <dl className="space-y-4">
          {faq.map((f) => (
            <div key={f.q}>
              <dt className="text-sm font-medium">{f.q}</dt>
              <dd className="text-sm text-muted-foreground mt-1">{f.a}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-10 flex flex-col sm:flex-row flex-wrap gap-3">
        {BEST_LISTS.filter((l) => l.slug !== slug).map((l) => (
          <Link
            key={l.slug}
            href={`/best/${l.slug}`}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border/60 px-5 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
          >
            {l.h1}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ))}
        <Link
          href="/categories"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border/60 px-5 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          Browse by Category
        </Link>
      </div>
    </div>
  );
}
