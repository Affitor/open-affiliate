import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Content Lab — AI Affiliate Content Generator",
  description:
    "Generate high-converting affiliate content powered by AI. Reviews, comparisons, social posts, and email sequences from real program data.",
  openGraph: {
    title: "Content Lab — AI Affiliate Content Generator",
    description:
      "Generate high-converting affiliate content powered by AI. Built on OpenAffiliate registry data.",
  },
};

export default function LabLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
