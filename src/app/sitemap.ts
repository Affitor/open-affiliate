import type { MetadataRoute } from "next";
import {
  programs,
  categories,
  categoryToSlug,
  networkToSlug,
  liveNetworks,
  livePrograms,
  type Program,
} from "@/lib/programs";
import { docsNav } from "@/app/docs/_config";
import { BEST_LISTS, bestPath, buildBestList, indexable } from "@/lib/best-lists";
import { GUIDES, guidePath } from "@/lib/guides";
import { blogEntries } from "@/lib/blog";
import { NETWORKS_POST, NETWORKS_POST_PATH } from "@/lib/networks-post";
import { changelog } from "@/lib/changelog";

const BASE_URL = "https://openaffiliate.dev";

/** The latest of the YYYY-MM-DD dates given, or undefined when there are none. */
function latest(dates: (string | null | undefined)[]): string | undefined {
  return dates
    .flatMap((date) => (date ? [date.slice(0, 10)] : []))
    .sort()
    .at(-1);
}

/**
 * A program page's lastmod: the latest of the dates its YAML carries. Taking the
 * first one present put updated_at ahead of a later last_verified_at, so pages
 * were dated before their own last check (53 of 1,279 on 2026-10-20).
 */
function programDate(program: Program): string | undefined {
  return latest([program.updatedAt, program.lastVerifiedAt, program.createdAt]);
}

function latestProgramDate(items: Program[]): string | undefined {
  return latest(items.map(programDate));
}

/**
 * lastmod only where the build has a real date for the page's content. Pages
 * built from the registry take its latest program date; the blog and the
 * changelog take their newest entry. Pages with no such source (docs, about,
 * submit, explore's live social data) carry none, rather than the build date,
 * which would claim every deploy changed them.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const registry = latestProgramDate(livePrograms);
  const blog = blogEntries();
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: registry, changeFrequency: "weekly", priority: 1.0 },
    { url: `${BASE_URL}/programs`, lastModified: registry, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/programs/a-z`, lastModified: registry, changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE_URL}/blog`, lastModified: latest([...blog.posts, ...blog.lists].map((e) => e.date)), changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/new`, lastModified: latest(livePrograms.map((p) => p.createdAt)), changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE_URL}/rankings`, lastModified: registry, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE_URL}/categories`, lastModified: registry, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/networks`, lastModified: registry, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/compare`, lastModified: registry, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/submit`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/about`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/for-brands`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/methodology`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/changelog`, lastModified: latest(changelog.map((e) => e.date)), changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/content-lab`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${BASE_URL}/explore`, changeFrequency: "daily", priority: 0.6 },
  ];

  const docsPages: MetadataRoute.Sitemap = docsNav
    .flatMap((g) => g.items)
    .map((item) => ({
      url: `${BASE_URL}${item.href}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));

  const categoryPages: MetadataRoute.Sitemap = categories.map((category) => {
    const items = programs.filter((program) => program.category === category);
    return {
      url: `${BASE_URL}/categories/${categoryToSlug(category)}`,
      lastModified: latestProgramDate(items),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    };
  });

  const networkPages: MetadataRoute.Sitemap = liveNetworks.map((network) => {
    const items = programs.filter(
      (program) => (program.network ?? "in-house") === network
    );
    return {
      url: `${BASE_URL}/networks/${networkToSlug(network)}`,
      lastModified: latestProgramDate(items),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    };
  });

  const bestPages: MetadataRoute.Sitemap = BEST_LISTS.filter(indexable).map((list) => ({
    url: `${BASE_URL}${bestPath(list)}`,
    lastModified: latestProgramDate(buildBestList(list).rows),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  // /best/affiliate-networks: an editorial post with its own route, not a list.
  bestPages.push({ url: `${BASE_URL}${NETWORKS_POST_PATH}`, lastModified: NETWORKS_POST.checked, changeFrequency: "monthly" as const, priority: 0.8 });

  const guidePages: MetadataRoute.Sitemap = GUIDES.map((g) => ({
    url: `${BASE_URL}${guidePath(g)}`,
    lastModified: g.checked,
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  const programPages: MetadataRoute.Sitemap = programs.map((p) => ({
    url: `${BASE_URL}/programs/${p.slug}`,
    lastModified: programDate(p),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  // /programs/<slug>/oas reports are left out on purpose: they doubled the
  // sitemap with template pages while the program pages are still being
  // indexed. The reports stay live and each program page links to its own.
  return [...staticPages, ...docsPages, ...categoryPages, ...bestPages, ...guidePages, ...networkPages, ...programPages];
}
