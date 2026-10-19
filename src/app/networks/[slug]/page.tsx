import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { TrackPageView } from "@/components/track-page-view";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProgramLogo } from "@/components/program-logo";
import { serializeJsonLd } from "@/lib/json-ld";
import { commissionChip, cookieChip } from "@/lib/program-chips";
import {
  networkToSlug,
  slugToNetwork,
  commissionRank,
  commissionStats,
  compareCommission,
  formatCommissionDisplay,
  commissionLabel,
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
  termsConfirmed,
  UNCONFIRMED,
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

/** "Acme, at 50% recurring/12mo — verified by OpenAffiliate." An unverified figure says it is unconfirmed. */
function paidBy({ value, program }: PaidBy, flat: boolean): string {
  return (
    `${program.name}, at ${formatCommissionDisplay(value, flat)} ${commissionLabel(program.commission)}` +
    (termsConfirmed(program) ? " — verified by OpenAffiliate." : " — community-submitted and unconfirmed.")
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

  // The order every commission surface shares (commission-order.ts):
  // commissionRank, programs that publish no figure last, then lifetime, name.
  const netPrograms = [...liveOn(network)].sort((a, b) => compareCommission(a, b, commissionRank));
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
    <div className="oa-frame">
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
      <header className="oa-band !py-8 md:!py-10">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-meta text-muted-foreground">
          <Link href="/networks" className="hover:text-foreground transition-colors">Networks</Link>
          <span aria-hidden>/</span>
          <span className="text-foreground/80">{name}</span>
        </nav>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <ProgramLogo slug={network} name={name} src={meta?.logo ?? null} size={40} className="shrink-0" />
          <h1 className="text-title md:text-display font-semibold tracking-[-0.03em]">{heading}</h1>
          <Badge variant="outline" className="rounded-[5px] text-xs font-normal text-muted-foreground">
            {NETWORK_KIND_LABEL[kind]}
          </Badge>
        </div>
        {/* Slot 2 — the one sentence a reader or an engine would quote; the network's own description lives on /networks. */}
        <p className="mt-2 text-meta text-muted-foreground">{answer}</p>
        <dl className="mt-4 inline-grid max-w-full grid-cols-2 overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-4">
          {[
            { label: "Programs", value: String(netPrograms.length), note: null },
            {
              label: "Highest rate",
              value: topRate ? formatCommissionDisplay(topRate.value, false) : "—",
              note: topRate && !termsConfirmed(topRate.program) ? `${UNCONFIRMED}: ${topRate.program.name}` : null,
            },
            { label: "Verified", value: String(verifiedCount), note: null },
            { label: "Avg cookie (verified)", value: cookies.length > 0 ? `${avgCookie.toFixed(0)}d` : "—", note: null },
          ].map(({ label, value, note }, i) => (
            <div key={label} className={`min-w-0 px-4 py-2.5 ${i % 2 ? "border-l border-border" : ""} ${i > 1 ? "border-t border-border sm:border-t-0" : ""} ${i === 2 ? "sm:border-l" : ""}`}>
              <dt className="oa-label">{label}</dt>
              <dd className="mt-0.5 font-mono text-lg font-medium tabular-nums">{value}</dd>
              {note && <dd className="text-xs text-muted-foreground">{note}</dd>}
            </div>
          ))}
        </dl>
      </header>

      <section className="oa-band" aria-label="Programs">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-sunk">
                  <th className="w-12 py-2.5 px-3 text-center oa-label font-medium">#</th>
                  <th className="py-2.5 px-3 text-left oa-label font-medium min-w-[180px]">Program</th>
                  <th className="w-52 py-2.5 px-3 text-left oa-label font-medium">Commission</th>
                  <th className="w-36 py-2.5 px-3 text-left oa-label font-medium hidden sm:table-cell">Cookie</th>
                  <th className="w-24 py-2.5 px-3 text-left oa-label font-medium hidden md:table-cell">Payout</th>
                  <th className="w-40 py-2.5 px-3 text-left oa-label font-medium hidden lg:table-cell">Category</th>
                </tr>
              </thead>
              <tbody>
                {netPrograms.map(confirmedTerms).map((program, i) => {
                  const chip = commissionChip(program.commission);
                  return (
                    <tr key={program.slug} className="border-t border-border hover:bg-sunk transition-colors">
                      <td className="py-2.5 px-3 text-center font-mono text-xs text-muted-foreground">{i + 1}</td>
                      <td className="py-2.5 px-3">
                        <Link href={`/programs/${program.slug}`} className="flex items-center gap-3 hover:underline">
                          <ProgramLogo slug={program.slug} name={program.name} size={28} className="shrink-0" />
                          <span className="flex min-w-0 items-center gap-1.5 font-medium">
                            <span className="truncate">{program.name}</span>
                            {program.verified && <Check className="size-3.5 shrink-0 text-good" role="img" aria-label="Verified" />}
                          </span>
                        </Link>
                      </td>
                      <td className="py-2.5 px-3">
                        {/* The rows' and cards' wording (program-chips): figure and type, the rate as written, or "Rate not published". */}
                        <span className={`font-mono text-meta ${chip === "Rate not published" ? "text-muted-foreground" : "font-medium"}`}>{chip}</span>
                      </td>
                      <td className="py-2.5 px-3 hidden sm:table-cell font-mono text-xs text-muted-foreground">{cookieChip(program)}</td>
                      <td className="py-2.5 px-3 hidden md:table-cell font-mono text-xs text-muted-foreground">{program.payout.minimum != null ? `$${program.payout.minimum}` : "—"}</td>
                      <td className="py-2.5 px-3 hidden lg:table-cell text-meta text-muted-foreground">{program.category}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Slot 4 — the questions a reader actually arrives with, answered in
          the first sentence. Generated from the registry so they cannot go
          stale, which is the trade against hand-written copy. */}
      <section className="oa-band grid gap-6 md:grid-cols-2" aria-label="Questions">
        <div>
          <h2 className="text-sm font-semibold">How do you join a program here?</h2>
          <p className="mt-1.5 text-sm text-muted-foreground max-w-prose">
            {networkHowToJoin(network)}
          </p>
        </div>
        {(topRate || topFlatUsd) && (
          <div>
            <h2 className="text-sm font-semibold">Which pays the most?</h2>
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
            <h2 className="text-sm font-semibold">Why do some rows say “Not published”?</h2>
            <p className="mt-1.5 text-sm text-muted-foreground max-w-prose">
              {netPrograms.length - priced.length} of {netPrograms.length}{" "}
              {netPrograms.length === 1 ? "program" : "programs"} here
              never published a commission figure. Rather than print a guess, the
              registry records that no figure exists, and the highest rate above
              counts only programs that publish a single percentage.
            </p>
          </div>
        )}
      </section>

      {/* Slot 6 — what is actually confirmed. A page that does not say this is
          claiming more than it knows. */}
      <div className="oa-band !py-6 flex flex-wrap items-center justify-between gap-3 text-meta text-muted-foreground">
        <p>
          {verifiedCount} of {netPrograms.length} verified by OpenAffiliate
          {verifiedCount < netPrograms.length &&
            " — the rest are community-submitted and unconfirmed"}
        </p>
        <p className="flex gap-x-5 text-sm">
          <Link href="/rankings" className="text-foreground underline decoration-line-strong underline-offset-4 hover:decoration-current">All rankings</Link>
          <Link href="/categories" className="text-foreground underline decoration-line-strong underline-offset-4 hover:decoration-current">Browse categories</Link>
        </p>
      </div>
    </div>
  );
}
