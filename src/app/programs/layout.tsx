import type { Metadata } from "next";
import { programs } from "@/lib/programs";
import { programsHub } from "@/lib/programs-directory";

const hub = programsHub(programs);

export const metadata: Metadata = {
  // Absolute: the title already carries the words people search ("affiliate
  // program directory"), the counts and the month, and the root template's
  // " | OpenAffiliate" would push it past what a results page shows.
  title: { absolute: hub.title },
  description: hub.sentence,
  openGraph: {
    title: hub.title,
    description: hub.sentence,
    url: "https://openaffiliate.dev/programs",
    siteName: "OpenAffiliate",
    // Nested metadata is replaced, not merged, so declaring openGraph here
    // drops the root opengraph-image and this page shared with no preview.
    images: ["/opengraph-image"],
  },
  alternates: {
    canonical: "/programs",
    types: {
      "text/markdown": "https://openaffiliate.dev/programs.md",
    },
  },
};

export default function ProgramsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
