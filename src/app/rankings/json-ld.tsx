import { livePrograms } from "@/lib/programs";
import { serializeJsonLd } from "@/lib/json-ld";
import { commissionGroup, compareCommissionFigure } from "@/lib/rankings-terms";

export const RANKINGS_DESCRIPTION =
  "Affiliate programs ranked by OAS, the OpenAffiliate Score: how clearly each program publishes its terms and protects its partners. By program, category and network."

/**
 * /rankings' CollectionPage JSON-LD: on that page only, not on /rankings/leaderboard. `top`:
 * the list the page leads with (OAS once published); else the commission table's default view.
 */
export function RankingsJsonLd({ top }: { top?: { slug: string; name: string }[] } = {}) {
  const ranked =
    top ??
    livePrograms
      .filter((p) => p.verified && commissionGroup(p.commission) === "percent")
      .sort((a, b) => compareCommissionFigure(a, b))
      .slice(0, 20);

  return (
    <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "Affiliate Program Rankings",
            description: RANKINGS_DESCRIPTION,
            url: "https://openaffiliate.dev/rankings",
            isPartOf: { "@id": "https://openaffiliate.dev/#website" },
            publisher: { "@id": "https://openaffiliate.dev/#organization" },
            mainEntity: {
              "@type": "ItemList",
              numberOfItems: ranked.length,
              itemListElement: ranked.map((program, index) => ({
                "@type": "ListItem",
                position: index + 1,
                url: `https://openaffiliate.dev/programs/${program.slug}`,
                name: program.name,
              })),
            },
          }),
        }}
    />
  );
}
