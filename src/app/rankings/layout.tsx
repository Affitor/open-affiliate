import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Affiliate Program Rankings — Highest Paying Programs | OpenAffiliate",
  description:
    "Compare the highest-paying affiliate programs ranked by commission rate. Browse rankings by program, network, or category.",
  openGraph: {
    title: "Affiliate Program Rankings — OpenAffiliate",
    description:
      "Compare the highest-paying affiliate programs ranked by commission rate across 349+ programs.",
    url: "https://openaffiliate.dev/rankings",
    siteName: "OpenAffiliate",
  },
};

export default function RankingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
