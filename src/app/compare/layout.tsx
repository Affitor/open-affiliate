import type { Metadata } from "next";
import { serializeJsonLd } from "@/lib/json-ld";

export const metadata: Metadata = {
  title: "Compare Affiliate Programs",
  description:
    "Compare affiliate programs side-by-side. Commission rates, cookie duration, payout terms, and features at a glance.",
  openGraph: {
    title: "Compare Affiliate Programs: OpenAffiliate",
    description:
      "Side-by-side comparison of affiliate programs. Find the best fit for your audience.",
    url: "https://openaffiliate.dev/compare",
    siteName: "OpenAffiliate",
    // Nested metadata is replaced, not merged, so declaring openGraph here
    // drops the root opengraph-image and this page shared with no preview.
    images: ["/opengraph-image"],
  },
};

export default function CompareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: "Compare Affiliate Programs",
            description: metadata.description,
            url: "https://openaffiliate.dev/compare",
            isPartOf: { "@id": "https://openaffiliate.dev/#website" },
            publisher: { "@id": "https://openaffiliate.dev/#organization" },
            mainEntity: {
              "@type": "WebApplication",
              name: "OpenAffiliate comparison tool",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
              url: "https://openaffiliate.dev/compare",
            },
          }),
        }}
      />
      {children}
    </>
  );
}
