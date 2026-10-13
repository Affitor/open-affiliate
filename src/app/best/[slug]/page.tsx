import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TrackPageView } from "@/components/track-page-view";
import { BestListView, bestListMetadata } from "@/components/best-list-view";
import { BEST_INDEX, BEST_LISTS, bestPath, getBestList } from "@/lib/best-lists";

export function generateStaticParams() {
  return BEST_LISTS.filter((list) => list !== BEST_INDEX).map((list) => ({ slug: list.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const list = getBestList(slug);
  if (!list) return { title: "List Not Found" };
  return bestListMetadata(list, bestPath(list));
}

export default async function BestListPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const list = getBestList(slug);
  if (!list) notFound();

  return (
    <>
      <TrackPageView />
      <BestListView list={list} path={bestPath(list)} parent={{ name: BEST_INDEX.h1, href: bestPath(BEST_INDEX) }} />
    </>
  );
}
