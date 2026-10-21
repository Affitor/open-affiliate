import type { Metadata } from "next";

export const metadata: Metadata = {
  // The root layout's title template appends " | OpenAffiliate" already.
  title: "Submit an Affiliate Program",
  description:
    "Add your affiliate program to the OpenAffiliate registry: send your program page for review, or write the program file and open a GitHub pull request.",
  openGraph: {
    // openGraph.title is not templated, so it keeps the brand.
    title: "Submit an Affiliate Program: OpenAffiliate",
    description:
      "Add your affiliate program to the open registry. Every term is checked against your own program page.",
    url: "https://openaffiliate.dev/submit",
    siteName: "OpenAffiliate",
    // Nested metadata is replaced, not merged, so declaring openGraph here
    // drops the root opengraph-image and this page shared with no preview.
    images: ["/opengraph-image"],
  },
};

export default function SubmitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
