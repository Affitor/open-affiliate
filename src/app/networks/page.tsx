import { FaqAccordion } from "@/components/faq-accordion";
import type { Metadata } from "next";
import Link from "next/link";
import { TrackPageView } from "@/components/track-page-view";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProgramLogo } from "@/components/program-logo";
import { serializeJsonLd } from "@/lib/json-ld";
import {
  networksByProgramCount,
  networkToSlug,
  networkName,
  byNetworkName,
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
  const stats = networksByProgramCount().map(({ network, programs }) => ({
    network,
    programCount: programs.length,
    verified: programs.filter((p) => p.verified).length,
  }));
  const networks = stats.filter((n) => n.network !== IN_HOUSE);
  const cards = [...networks].sort((a, b) => byNetworkName(a.network, b.network));
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

      <header className="oa-band !py-8 md:!py-10">
        <p className="oa-label">Directory</p>
        <h1 className="mt-2 text-title md:text-display font-semibold tracking-[-0.03em]">Affiliate Networks</h1>
        <p className="mt-1 font-mono text-meta text-muted-foreground tabular-nums">{cards.length} networks · {inHouse} {inHouse === 1 ? "program" : "programs"} in-house</p>
      </header>

      <section className="oa-band" aria-label="Networks">
        <ul className="border-t border-border">
          {cards.map((net) => {
            const name = networkName(net.network);
            const meta = NETWORK_META[net.network];
            return (
              <li key={net.network} className="border-b border-border">
                <Link
                  href={`/networks/${networkToSlug(net.network)}`}
                  className="group grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-1 py-3 hover:bg-sunk transition-colors md:grid-cols-[32px_minmax(0,1fr)_110px_190px]"
                >
                  <ProgramLogo slug={net.network} name={name} src={meta?.logo ?? null} size={32} className="shrink-0" />
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold group-hover:underline">{name}</h2>
                    {meta && <p className="line-clamp-2 text-meta text-muted-foreground md:line-clamp-none md:truncate">{meta.description}</p>}
                  </div>
                  <span className="hidden md:block">
                    <Badge variant="outline" className="rounded-[5px] text-xs font-normal text-muted-foreground">{NETWORK_KIND_LABEL[networkKind(net.network)]}</Badge>
                  </span>
                  <span className="col-start-2 font-mono text-xs text-muted-foreground tabular-nums md:col-start-auto md:text-right">
                    {`${net.programCount} ${net.programCount === 1 ? "program" : "programs"} · ${net.verified} verified`}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        {inHouse > 0 && (
          <Link
            href={`/networks/${networkToSlug(IN_HOUSE)}`}
            className="mt-4 inline-flex items-center gap-1.5 text-sm underline decoration-line-strong underline-offset-4 hover:decoration-current"
          >
            {`${inHouse} ${inHouse === 1 ? "program runs" : "programs run"} in-house, with no network`}{" "}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        )}
      </section>

      <section className="oa-band" aria-labelledby="networks-faq-h">
        <div className="max-w-3xl">
          <h2 id="networks-faq-h" className="text-lg font-semibold mb-3">Affiliate networks FAQ</h2>
          <FaqAccordion items={faq} />
        </div>
      </section>
    </div>
  );
}
