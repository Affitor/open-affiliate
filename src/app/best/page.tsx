import type { Metadata } from "next";
import { TrackPageView } from "@/components/track-page-view";
import { BestListView, bestListMetadata } from "@/components/best-list-view";
import { BEST_INDEX, bestPath } from "@/lib/best-lists";

// The hub for "best affiliate programs": /best, not /best/affiliate-programs, so
// the query's page is also the parent every other list links back to.
export const metadata: Metadata = bestListMetadata(BEST_INDEX, bestPath(BEST_INDEX));

export default function BestIndexPage() {
  return (
    <>
      <TrackPageView />
      <BestListView list={BEST_INDEX} path={bestPath(BEST_INDEX)} parent={{ name: "All Categories", href: "/categories" }} />
    </>
  );
}
