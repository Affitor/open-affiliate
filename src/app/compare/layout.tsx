import type { Metadata } from "next";

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
  return children;
}
