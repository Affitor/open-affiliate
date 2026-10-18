import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TrackPageView } from "@/components/track-page-view";
import { BestListView, bestListMetadata } from "@/components/best-list-view";
import { bestPath, categoryList, getBestList } from "@/lib/best-lists";
import { categoryPost, postTitle } from "@/lib/best-posts";
import { categories, categoryToSlug, slugToCategory } from "@/lib/programs";

export function generateStaticParams() {
  return categories.map((c) => ({ slug: categoryToSlug(c) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = slugToCategory(slug);
  if (!category) return { title: "Category Not Found" };
  return bestListMetadata(categoryList(category), `/categories/${slug}`);
}

/**
 * A category is a directory on the list machine: every live program in it,
 * verified first, with an intro and FAQ computed from the data.
 */
export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = slugToCategory(slug);
  if (!category) notFound();
  // A ready editorial post on this category is linked as "Our picks", so the two pages split the query.
  const picks = categoryPost(category);
  const picksList = picks ? getBestList(picks.post.slug) : undefined;

  return (
    <>
      <TrackPageView type="category_view" slug={slug} metadata={{ category }} />
      <BestListView
        list={categoryList(category)}
        path={`/categories/${slug}`}
        parent={{ name: "All Categories", href: "/categories" }}
        picks={picks && picksList ? { href: bestPath(picksList), label: postTitle(picks.post, picks.selection) } : undefined}
      />
    </>
  );
}
