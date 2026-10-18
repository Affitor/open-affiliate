import type { Metadata } from "next";
import { commissionRank, livePrograms } from "@/lib/programs";
import { serializeJsonLd } from "@/lib/json-ld";
import { compareCommission } from "@/lib/commission-order";

export const metadata: Metadata = {
  title: "Affiliate Program Rankings: Highest Paying Programs",
  description:
    "Verified affiliate programs ranked by what they pay: commission, how long it recurs, cookie length and payout minimum. Browse by program, network or category.",
  openGraph: {
    title: "Affiliate Program Rankings: OpenAffiliate",
    description:
      `${livePrograms.filter((p) => p.verified).length} verified affiliate programs ranked by commission, cookie and payout.`,
    url: "https://openaffiliate.dev/rankings",
    siteName: "OpenAffiliate",
  },
  alternates: {
    canonical: "/rankings",
    types: {
      "text/markdown": "https://openaffiliate.dev/rankings.md",
    },
  },
};

export default function RankingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The table's default order: verified programs by commission.
  const ranked = livePrograms
    .filter((p) => p.verified)
    .sort((a, b) => compareCommission(a, b, commissionRank))
    .slice(0, 20);

  return (
    <>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "Affiliate Program Rankings",
            description: metadata.description,
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
      {children}
    </>
  );
}
