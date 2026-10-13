import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { TrackPageView } from "@/components/track-page-view";
import { ArrowLeft, ArrowRight, DollarSign, Clock, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProgramLogo } from "@/components/program-logo";
import { serializeJsonLd } from "@/lib/json-ld";
import { listScore } from "@/lib/best-lists";
import {
  networkToSlug,
  slugToNetwork,
  commissionStats,
  formatCommissionDisplay,
  commissionLabel,
  commissionDisplay,
  commissionUnknown,
  networkKind,
  networkHowToJoin,
  networkName,
  networkHeading,
  livePrograms,
  liveNetworks,
  IN_HOUSE,
  NETWORK_META,
  NETWORK_KIND_LABEL,
  confirmedTerms,
  type PaidBy,
  type Program,
} from "@/lib/programs";

const SITE = "https://openaffiliate.dev";

// Only networks with a live program: a network page with no rows is thin content.
export function generateStaticParams() {
  return liveNetworks.map((n) => ({ slug: networkToSlug(n) }));
}

function liveOn(network: string): Program[] {
  return livePrograms.filter((p) => (p.network ?? IN_HOUSE) === network);
}

/** "Acme, at 50% recurring/12mo — verified by OpenAffiliate." */
function paidBy({ value, program }: PaidBy, flat: boolean): string {
  return (
    `${program.name}, at ${formatCommissionDisplay(value, flat)} ${commissionLabel(program.commission)}` +
    (program.verified ? " — verified by OpenAffiliate." : " — community-submitted and unconfirmed.")
  );
}

/**
 * "<Name> Affiliate Programs: <N> Programs": the query, then the count. The
 * layout appends " | OpenAffiliate"; the suffix is kept only while the whole
 * title fits in 60 characters, so long names such as PartnerStack drop it.
 */
function networkTitle(network: string, count: number): string {
  return `${networkHeading(network)}: ${count} ${count === 1 ? "Program" : "Programs"}`;
}

const META_MAX = 155;

/**
 * 120 to 155 characters, built from the registry. Each optional sentence is
 * added only if the whole still fits, so a long network name drops the tail
 * instead of overflowing. verify-machine-surfaces holds every page to the range.
 */
function networkDescription(network: string, count: number, verified: number): string {
  // The short form, since the name runs into "affiliate program" here too.
  const name = NETWORK_META[network]?.shortName ?? networkName(network);
  const one = count === 1;
  const direct = networkKind(network) === "direct";
  let out = direct
    ? `${count} affiliate ${one ? "program" : "programs"} run in-house by the brand, with no network account needed.`
    : one
      ? `One ${name} affiliate program, with its commission rate, cookie window and payout terms.`
      : `Compare ${count} ${name} affiliate programs by commission rate, cookie window and payout terms.`;
  for (const sentence of [
    direct ? "Compare commission rates, cookie windows and payout terms." : "",
    verified === 0
      ? "Terms are community-submitted."
      : one
        ? "Terms verified by OpenAffiliate."
        : `${verified} verified by OpenAffiliate.`,
    one ? "How to join." : "How to join, and the top payer.",
    "Data from the open OpenAffiliate registry.",
  ]) {
    if (sentence && out.length + 1 + sentence.length <= META_MAX) out = `${out} ${sentence}`;
  }
  return out;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const network = slugToNetwork(slug);
  if (!network) return { title: "Network Not Found" };

  const netPrograms = liveOn(network);
  if (netPrograms.length === 0) return { title: "Network Not Found" };
  const title = networkTitle(network, netPrograms.length);
  const withSuffix = `${title} | OpenAffiliate`;
  const fits = withSuffix.length <= 60;
  const description = networkDescription(
    network,
    netPrograms.length,
    netPrograms.filter((p) => p.verified).length
  );

  return {
    // A plain string gets the layout's " | OpenAffiliate"; absolute skips it.
    // openGraph.title is not templated, so it is written out in full.
    title: fits ? title : { absolute: title },
    description,
    alternates: {
      canonical: `/networks/${slug}`,
      types: { "text/markdown": `https://openaffiliate.dev/networks/${slug}.md` },
    },
    // images: nested metadata is replaced, not merged, so declaring openGraph
    // here drops the root opengraph-image and these pages shared with no preview.
    openGraph: { title: fits ? withSuffix : title, description, url: `https://openaffiliate.dev/networks/${slug}`, siteName: "OpenAffiliate", images: ["/opengraph-image"] },
  };
}

export default async function NetworkPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const network = slugToNetwork(slug);
  if (!network) notFound();

  // By commission as the list pages order it (listScore: structured fields
  // only), then programs that publish no figure last.
  const netPrograms = [...liveOn(network)].sort(
    (a, b) =>
      listScore(b) - listScore(a) ||
      Number(commissionUnknown(a.commission)) - Number(commissionUnknown(b.commission))
  );
  if (netPrograms.length === 0) notFound();
  const name = networkName(network);
  const heading = networkHeading(network);
  const meta = NETWORK_META[network];

  const priced = netPrograms.filter((p) => !commissionUnknown(p.commission));
  // Rates and flat payouts apart, from structured fields only (commissionStats).
  const { topRate, topFlatUsd } = commissionStats(netPrograms);
  // Verified cookie windows only: an unverified one is not shown (confirmed-terms.ts).
  const cookies = netPrograms.flatMap((p) => {
    const days = confirmedTerms(p).cookieDays;
    return days != null ? [days] : [];
  });
  const avgCookie = cookies.length > 0 ? cookies.reduce((s, d) => s + d, 0) / cookies.length : 0;
  const categoryCount = new Set(netPrograms.map((p) => p.category)).size;
  const verifiedCount = netPrograms.filter((p) => p.verified).length;
  const kind = networkKind(network);

  const answer =
    kind === "direct"
      ? `${netPrograms.length} ${netPrograms.length === 1 ? "program runs" : "programs run"} directly by the brand, with no network in between. ${verifiedCount} ${verifiedCount === 1 ? "is" : "are"} verified.`
      : `${netPrograms.length} affiliate ${netPrograms.length === 1 ? "program" : "programs"} on ${name}, across ${categoryCount} ${categoryCount === 1 ? "category" : "categories"}. ${verifiedCount} ${verifiedCount === 1 ? "is" : "are"} verified.`;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <TrackPageView type="network_view" slug={slug} metadata={{ network }} />

      {/* Slot 7 — the machine block. Program pages have carried this since
          launch; category and network pages never did, so an assistant had
          nothing structured to cite them from. */}
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "CollectionPage",
                name: heading,
                description: answer,
                url: `${SITE}/networks/${slug}`,
                isPartOf: { "@id": `${SITE}/#website` },
                publisher: { "@id": `${SITE}/#organization` },
                mainEntity: {
                  "@type": "ItemList",
                  numberOfItems: netPrograms.length,
                  // First 20 table rows; verify-machine-surfaces holds it to NETWORK_ITEMLIST_MAX.
                  itemListElement: netPrograms.slice(0, 20).map((p, i) => ({
                    "@type": "ListItem",
                    position: i + 1,
                    url: `${SITE}/programs/${p.slug}`,
                    name: p.name,
                  })),
                },
              },
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "OpenAffiliate", item: SITE },
                  { "@type": "ListItem", position: 2, name: "Affiliate Networks", item: `${SITE}/networks` },
                  { "@type": "ListItem", position: 3, name: heading },
                ],
              },
            ],
          }),
        }}
      />
      <Link
        href="/networks"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All Networks
      </Link>

      <div className="mb-8">
        <div className="flex items-center gap-3 flex-wrap">
          <ProgramLogo slug={network} name={name} src={meta?.logo ?? null} size={40} className="shrink-0" />
          <h1 className="text-2xl font-bold tracking-tight">{heading}</h1>
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            {NETWORK_KIND_LABEL[kind]}
          </Badge>
        </div>
        {/* Slot 2 — the one sentence a reader or an engine would quote. */}
        <p className="mt-3 max-w-2xl border-l-2 border-emerald-500/40 pl-3 text-sm">
          {answer}
        </p>
        {meta && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{meta.description}</p>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="rounded-xl border border-border/40 bg-card/30 p-4">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Users className="h-3 w-3" />
            <span className="text-[10px] uppercase tracking-wide">Programs</span>
          </div>
          <p className="text-2xl font-bold">{netPrograms.length}</p>
        </div>
        <div className="rounded-xl border border-border/40 bg-card/30 p-4">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <DollarSign className="h-3 w-3" />
            <span className="text-[10px] uppercase tracking-wide">Highest rate</span>
          </div>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{topRate ? formatCommissionDisplay(topRate.value, false) : "—"}</p>
        </div>
        <div className="rounded-xl border border-border/40 bg-card/30 p-4">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <DollarSign className="h-3 w-3" />
            <span className="text-[10px] uppercase tracking-wide">Verified</span>
          </div>
          <p className="text-2xl font-bold">{verifiedCount}</p>
        </div>
        <div className="rounded-xl border border-border/40 bg-card/30 p-4">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Clock className="h-3 w-3" />
            <span className="text-[10px] uppercase tracking-wide">Avg Cookie (verified)</span>
          </div>
          <p className="text-2xl font-bold">{cookies.length > 0 ? `${avgCookie.toFixed(0)}d` : "—"}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border/40 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className="w-12 py-3 px-3 text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wide">#</th>
                <th className="py-3 px-3 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wide min-w-[180px]">Program</th>
                <th className="w-28 py-3 px-3 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Commission</th>
                <th className="w-24 py-3 px-3 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Type</th>
                <th className="w-20 py-3 px-3 text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Cookie</th>
                <th className="w-24 py-3 px-3 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wide hidden md:table-cell">Payout</th>
                <th className="w-32 py-3 px-3 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Category</th>
              </tr>
            </thead>
            <tbody>
              {netPrograms.map(confirmedTerms).map((program, i) => (
                <tr key={program.slug} className="border-t border-border/20 hover:bg-muted/20 transition-colors group">
                  <td className="py-3 px-3 text-center">
                    <span className={`text-xs font-medium ${i < 3 ? (i === 0 ? "text-amber-500" : i === 1 ? "text-zinc-400" : "text-orange-500") : "text-muted-foreground"}`}>
                      {i + 1}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <Link href={`/programs/${program.slug}`} className="flex items-center gap-3">
                      <ProgramLogo slug={program.slug} name={program.name} size={32} className="shrink-0" />
                      <div className="min-w-0">
                        <span className="text-sm font-medium truncate block group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                          {program.name}
                        </span>
                        {program.verified && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 border-emerald-600/30 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 mt-0.5">verified</Badge>
                        )}
                      </div>
                    </Link>
                  </td>
                  <td className="py-3 px-3">
                    <span className={`text-sm font-semibold ${commissionUnknown(program.commission) ? "text-muted-foreground font-normal italic" : "text-emerald-600 dark:text-emerald-400"}`}>{commissionDisplay(program.commission)}</span>
                  </td>
                  <td className="py-3 px-3 hidden sm:table-cell">
                    <Badge variant="secondary" className="text-[10px]">{commissionLabel(program.commission)}</Badge>
                  </td>
                  <td className="py-3 px-3 text-center hidden sm:table-cell">
                    <span className="text-xs text-muted-foreground">{program.cookieDays != null ? `${program.cookieDays}d` : "—"}</span>
                  </td>
                  <td className="py-3 px-3 hidden md:table-cell">
                    <span className="text-xs text-muted-foreground">{program.payout.minimum != null ? `$${program.payout.minimum}` : "—"}</span>
                  </td>
                  <td className="py-3 px-3 hidden lg:table-cell">
                    <span className="text-xs text-muted-foreground">{program.category}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slot 4 — the questions a reader actually arrives with, answered in
          the first sentence. Generated from the registry so they cannot go
          stale, which is the trade against hand-written copy. */}
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="text-base font-semibold">How do you join a program here?</h2>
          <p className="mt-1.5 text-sm text-muted-foreground max-w-prose">
            {networkHowToJoin(network)}
          </p>
        </div>
        {(topRate || topFlatUsd) && (
          <div>
            <h2 className="text-base font-semibold">Which pays the most?</h2>
            <p className="mt-1.5 text-sm text-muted-foreground max-w-prose">
              {topRate && topFlatUsd
                ? `By rate, ${paidBy(topRate, false)} By flat payout, ${paidBy(topFlatUsd, true)} A rate and a flat amount compare only against a sale price, so both are given.`
                : topRate
                  ? paidBy(topRate, false)
                  : paidBy(topFlatUsd!, true)}
            </p>
          </div>
        )}
        {netPrograms.length > priced.length && (
          <div>
            <h2 className="text-base font-semibold">Why do some rows say “Not published”?</h2>
            <p className="mt-1.5 text-sm text-muted-foreground max-w-prose">
              {netPrograms.length - priced.length} of {netPrograms.length}{" "}
              {netPrograms.length === 1 ? "program" : "programs"} here
              never published a commission figure. Rather than print a guess, the
              registry records that no figure exists, and the highest rate above
              counts only programs that publish a single percentage.
            </p>
          </div>
        )}
      </div>

      {/* Slot 6 — what is actually confirmed. A page that does not say this is
          claiming more than it knows. */}
      <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={`h-1.5 w-1.5 rounded-full ${verifiedCount > 0 ? "bg-emerald-500" : "bg-amber-500"}`}
        />
        {verifiedCount} of {netPrograms.length} verified by OpenAffiliate
        {verifiedCount < netPrograms.length &&
          " — the rest are community-submitted and unconfirmed"}
      </div>

      <div className="mt-8 flex flex-col sm:flex-row gap-3">
        <Link href="/rankings" className="inline-flex items-center justify-center gap-2 rounded-lg border border-border/60 px-5 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
          View All Rankings <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <Link href="/categories" className="inline-flex items-center justify-center gap-2 rounded-lg border border-border/60 px-5 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
          Browse Categories
        </Link>
      </div>
    </div>
  );
}
