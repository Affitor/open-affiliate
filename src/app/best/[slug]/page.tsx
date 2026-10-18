import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TrackPageView } from "@/components/track-page-view";
import { BestListView, bestListMetadata } from "@/components/best-list-view";
import { BestPostView, bestPostMetadata } from "@/components/best-post-view";
import { BEST_INDEX, BEST_LISTS, bestPath, getBestList } from "@/lib/best-lists";
import { readyPost } from "@/lib/best-posts";

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
  const ready = readyPost(slug);
  return ready ? bestPostMetadata(ready.post, ready.selection, bestPath(list)) : bestListMetadata(list, bestPath(list));
}

export default async function BestListPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const list = getBestList(slug);
  if (!list) notFound();
  const ready = readyPost(slug);
  const parent = { name: BEST_INDEX.h1, href: bestPath(BEST_INDEX) };

  return (
    <>
      <TrackPageView />
      {ready ? (
        <BestPostView post={ready.post} list={list} selection={ready.selection} path={bestPath(list)} parent={parent} />
      ) : (
        <BestListView list={list} path={bestPath(list)} parent={parent} />
      )}
    </>
  );
}
