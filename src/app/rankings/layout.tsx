import type { Metadata } from "next";
import { affiliateScore, programs } from "@/lib/programs";
import { serializeJsonLd } from "@/lib/json-ld";

export const metadata: Metadata = {
  title: "Affiliate Program Rankings: Highest Paying Programs",
  description:
    "Compare the highest-paying affiliate programs ranked by commission rate. Browse rankings by program, network, or category.",
  openGraph: {
    title: "Affiliate Program Rankings: OpenAffiliate",
    description:
      `Compare affiliate programs ranked by score and commission across ${programs.length} programs.`,
    url: "https://openaffiliate.dev/rankings",
    siteName: "OpenAffiliate",
  },
};

export default function RankingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ranked = [...programs]
    .sort((a, b) => affiliateScore(b) - affiliateScore(a))
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
              numberOfItems: programs.length,
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
