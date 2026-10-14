import type { Metadata } from "next";
import Link from "next/link";
import { TrackPageView } from "@/components/track-page-view";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProgramLogo } from "@/components/program-logo";
import { serializeJsonLd } from "@/lib/json-ld";
import {
  livePrograms,
  liveNetworks,
  networkToSlug,
  networkName,
  networkHeading,
  networkKind,
  IN_HOUSE,
  NETWORK_META,
  NETWORK_KIND_LABEL,
} from "@/lib/programs";

const SITE = "https://openaffiliate.dev";

/** "A, B and C" */
function listNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * Every number on this page comes from the registry, so the copy cannot drift
 * from the cards. In-house is a bucket with a page of its own, not a network,
 * so it is counted apart.
 *
 * Counts only. The cards once showed a "Best" commission and a "Top" program
 * picked by a capped heuristic (rankScore, since removed): PartnerStack read "Best $1k" from an
 * unverified program while the registry held an unverified $10k one. Which
 * program pays most is answered on each network page, next to its full list.
 *
 * Two orders. `networks` is most programs first, ties by stored value: the
 * intro and FAQ answer "which has the most" from it. `cards` is A to Z by
 * display name, ignoring case, for the grid and its ItemList, so a reader can
 * find a network by name. verify-machine-surfaces uses the same two rules.
 */
function networksData() {
  const stats = liveNetworks
    .map((network) => {
      const list = livePrograms.filter((p) => (p.network ?? IN_HOUSE) === network);
      return { network, programCount: list.length, verified: list.filter((p) => p.verified).length };
    })
    .sort((a, b) => b.programCount - a.programCount || a.network.localeCompare(b.network));
  const networks = stats.filter((n) => n.network !== IN_HOUSE);
  const cards = [...networks].sort((a, b) =>
    networkName(a.network).localeCompare(networkName(b.network), "en", { sensitivity: "base" })
  );
  const inHouse = stats.find((n) => n.network === IN_HOUSE)?.programCount ?? 0;
  const total = stats.reduce((sum, n) => sum + n.programCount, 0);
  const networked = total - inHouse;
  const byKind = (kind: string) => networks.filter((n) => networkKind(n.network) === kind).map((n) => networkName(n.network));
  const [first, ...rest] = networks;

  const intro = first
    ? `An affiliate network connects brands with the partners who promote them and pays commission on referred sales. ` +
      `Of the ${total} live programs in this registry, ${networked} run on ${networks.length} affiliate networks, led by ${networkName(first.network)} with ${first.programCount}; the other ${inHouse} are run in-house by the brand.`
    : `No program in this registry runs on an affiliate network yet.`;

  const faq: { q: string; a: string }[] = [];
  const marketplaces = byKind("marketplace");
  const software = byKind("software");
  faq.push({
    q: "What is an affiliate network?",
    a:
      "A platform between brands and the partners who promote them: it tracks referrals and pays commission." +
      (marketplaces.length ? ` ${listNames(marketplaces)} run marketplaces you browse and apply through.` : "") +
      (software.length
        ? ` ${listNames(software)} ${software.length === 1 ? "is" : "are"} affiliate software a brand runs its own program on, so you join through the brand.`
        : ""),
  });
  if (first) {
    const next = rest.slice(0, 2).map((n) => `${networkName(n.network)} (${n.programCount})`);
    faq.push({
      q: "Which affiliate network has the most programs?",
      a: `${networkName(first.network)}, with ${first.programCount} of the ${total} live programs listed here.${next.length ? ` Next come ${listNames(next)}.` : ""}`,
    });
  }
  if (total > 0) {
    faq.push({
      q: "Do you need an affiliate network to join a program?",
      a: `No. ${inHouse} of the ${total} programs here (${Math.round((inHouse / total) * 100)}%) are run in-house: you apply on the brand's own site, with no network account.`,
    });
  }

  return { networks, cards, inHouse, total, intro, faq, first };
}

/**
 * Title and description for "affiliate networks" (6,600/mo). The title skips
 * the layout's " | OpenAffiliate" when the whole would pass 60 characters.
 */
function networksMeta() {
  const { networks, first } = networksData();
  const title = `Affiliate Networks: Compare ${networks.length} Networks and Their Programs`;
  const second = networks[1];
  const description =
    `Compare ${networks.length} affiliate networks by program count, verified programs and how you join` +
    (first
      ? `, led by ${networkName(first.network)} (${first.programCount} programs)${second ? ` and ${networkName(second.network)} (${second.programCount})` : ""}.`
      : ".");
  const withSuffix = `${title} | OpenAffiliate`;
  return { title, description, fits: withSuffix.length <= 60, withSuffix };
}

export function generateMetadata(): Metadata {
  const { title, description, fits, withSuffix } = networksMeta();
  return {
    title: fits ? title : { absolute: title },
    description,
    openGraph: {
      title: fits ? withSuffix : title,
      description,
      url: `${SITE}/networks`,
      siteName: "OpenAffiliate",
      images: ["/opengraph-image"],
    },
  };
}

export default function NetworksPage() {
  const { cards, inHouse, intro, faq } = networksData();

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
                "@type": "CollectionPage",
                name: "Affiliate Networks",
                description: intro,
                url: `${SITE}/networks`,
                isPartOf: { "@id": `${SITE}/#website` },
                publisher: { "@id": `${SITE}/#organization` },
                mainEntity: {
                  "@type": "ItemList",
                  numberOfItems: cards.length,
                  itemListElement: cards.map((n, i) => ({
                    "@type": "ListItem",
                    position: i + 1,
                    url: `${SITE}/networks/${networkToSlug(n.network)}`,
                    name: networkHeading(n.network),
                  })),
                },
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
                  { "@type": "ListItem", position: 2, name: "Affiliate Networks" },
                ],
              },
            ],
          }),
        }}
      />

      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Affiliate Networks</h1>
        {/* The answer first: what a network is and how the registry splits across them. */}
        <p className="mt-3 max-w-3xl border-l-2 border-emerald-500/40 pl-3 text-sm">{intro}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((net) => {
          const name = networkName(net.network);
          const meta = NETWORK_META[net.network];
          return (
            <Link
              key={net.network}
              href={`/networks/${networkToSlug(net.network)}`}
              className="group flex flex-col rounded-xl border border-border/40 bg-card/30 p-5 transition-all hover:border-emerald-500/30 hover:bg-card/60 hover:shadow-[0_0_15px_rgba(34,197,94,0.06)]"
            >
              <div className="flex items-center gap-3">
                <ProgramLogo slug={net.network} name={name} src={meta?.logo ?? null} size={40} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                    {name}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {`${net.programCount} ${net.programCount === 1 ? "program" : "programs"} · ${net.verified} verified`}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {NETWORK_KIND_LABEL[networkKind(net.network)]}
                </Badge>
              </div>

              {meta && <p className="mt-3 text-xs text-muted-foreground leading-relaxed">{meta.description}</p>}
            </Link>
          );
        })}
      </div>

      {inHouse > 0 && (
        <Link
          href={`/networks/${networkToSlug(IN_HOUSE)}`}
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {`${inHouse} ${inHouse === 1 ? "program runs" : "programs run"} in-house, with no network`}{" "}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}

      <div className="mt-10 max-w-3xl">
        <h2 className="text-base font-semibold mb-3">Affiliate networks FAQ</h2>
        <dl className="space-y-4">
          {faq.map((f) => (
            <div key={f.q}>
              <dt className="text-sm font-medium">{f.q}</dt>
              <dd className="text-sm text-muted-foreground mt-1">{f.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
