import type { Metadata } from "next";
import { programs } from "@/lib/programs";

export const metadata: Metadata = {
  // No brand suffix here: the root layout's title template already appends
  // " | OpenAffiliate". Spelling it out again rendered
  // "Browse Affiliate Programs — OpenAffiliate | OpenAffiliate".
  title: "Browse Affiliate Programs",
  description:
    "Search and filter " + programs.length + "+ affiliate programs by category, commission type, and more. Curated, verified, and agent-ready.",
  openGraph: {
    // openGraph.title is not templated, so it keeps the brand.
    title: "Browse Affiliate Programs: OpenAffiliate",
    description:
      "Search and filter " + programs.length + "+ affiliate programs by category, commission type, and more.",
    url: "https://openaffiliate.dev/programs",
    siteName: "OpenAffiliate",
    // Nested metadata is replaced, not merged, so declaring openGraph here
    // drops the root opengraph-image and this page shared with no preview.
    images: ["/opengraph-image"],
  },
};

export default function ProgramsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
