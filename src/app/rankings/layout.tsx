import type { Metadata } from "next";
import { RANKINGS_DESCRIPTION } from "./json-ld";

export const metadata: Metadata = {
  title: "Affiliate Program Rankings by OAS",
  description: RANKINGS_DESCRIPTION,
  openGraph: {
    title: "Affiliate Program Rankings by OAS: OpenAffiliate",
    description: RANKINGS_DESCRIPTION,
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
  return children;
}
