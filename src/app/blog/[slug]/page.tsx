import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TrackPageView } from "@/components/track-page-view";
import { GuideView, guideMetadata } from "@/components/guide-view";
import { GUIDES, getGuide, guidePath, guideSelection } from "@/lib/guides";

export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  return guide ? guideMetadata(guide, guidePath(guide)) : { title: "Guide Not Found" };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();
  const selection = guideSelection(guide);
  for (const d of selection.dropped) console.warn(`[guide] ${slug}: ${d.slug} left out (${d.reason})`);
  return (
    <>
      <TrackPageView />
      <GuideView guide={guide} selection={selection} path={guidePath(guide)} />
    </>
  );
}
