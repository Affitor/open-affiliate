import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Browse Affiliate Programs — OpenAffiliate",
  description:
    "Search and filter 349+ affiliate programs by category, commission type, and more. Curated, verified, and agent-ready.",
  openGraph: {
    title: "Browse Affiliate Programs — OpenAffiliate",
    description:
      "Search and filter 349+ affiliate programs by category, commission type, and more.",
    url: "https://openaffiliate.dev/programs",
    siteName: "OpenAffiliate",
  },
};

export default function ProgramsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
