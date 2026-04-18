import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Compare Affiliate Programs — OpenAffiliate",
  description:
    "Compare affiliate programs side-by-side. Commission rates, cookie duration, payout terms, and features at a glance.",
  openGraph: {
    title: "Compare Affiliate Programs — OpenAffiliate",
    description:
      "Side-by-side comparison of affiliate programs. Find the best fit for your audience.",
    url: "https://openaffiliate.dev/compare",
    siteName: "OpenAffiliate",
  },
};

export default function CompareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
