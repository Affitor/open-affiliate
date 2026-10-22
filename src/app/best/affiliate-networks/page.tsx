import type { Metadata } from "next";
import { TrackPageView } from "@/components/track-page-view";
import { BestNetworksPost } from "@/components/best-networks-post";
import { NETWORKS_POST, NETWORKS_POST_PATH, networkPostTitle } from "@/lib/networks-post";

const SITE = "https://openaffiliate.dev";

export function generateMetadata(): Metadata {
  const title = networkPostTitle();
  return {
    title,
    description: NETWORKS_POST.description,
    alternates: { canonical: NETWORKS_POST_PATH, types: { "text/markdown": `${SITE}${NETWORKS_POST_PATH}.md` } },
    openGraph: {
      title: `${title} | OpenAffiliate`,
      description: NETWORKS_POST.description,
      url: `${SITE}${NETWORKS_POST_PATH}`,
      siteName: "OpenAffiliate",
      type: "article",
      images: ["/opengraph-image"],
    },
  };
}

/** A static segment: it takes precedence over /best/[slug], which has no list by this slug. */
export default function AffiliateNetworksPage() {
  return (
    <>
      <TrackPageView />
      <BestNetworksPost path={NETWORKS_POST_PATH} />
    </>
  );
}
