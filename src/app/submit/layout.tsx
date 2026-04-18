import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Submit an Affiliate Program — OpenAffiliate",
  description:
    "Add your affiliate program to the OpenAffiliate registry. Generate a YAML file and submit via GitHub PR.",
  openGraph: {
    title: "Submit an Affiliate Program — OpenAffiliate",
    description:
      "Add your affiliate program to the open registry. Community-reviewed, AI agent-ready.",
    url: "https://openaffiliate.dev/submit",
    siteName: "OpenAffiliate",
  },
};

export default function SubmitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
