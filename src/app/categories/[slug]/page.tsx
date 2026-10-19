import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TrackPageView } from "@/components/track-page-view";
import { BestListView, bestListMetadata } from "@/components/best-list-view";
import { categoryList } from "@/lib/best-lists";
import { categoryEntries } from "@/lib/blog";
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
  // Posts and ranked lists about this category, in their own block under the header (redesign r3):
  // a ready post links from here, so the two pages split the query.
  const related = categoryEntries(category);

  return (
    <>
      <TrackPageView type="category_view" slug={slug} metadata={{ category }} />
      <BestListView
        list={categoryList(category)}
        path={`/categories/${slug}`}
        parent={{ name: "All Categories", href: "/categories" }}
        related={{ category, entries: related }}
      />
    </>
  );
}
