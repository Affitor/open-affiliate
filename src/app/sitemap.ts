import type { MetadataRoute } from "next";
import {
  programs,
  categories,
  categoryToSlug,
  networkToSlug,
  type Program,
} from "@/lib/programs";
import { docsNav } from "@/app/docs/_config";

const BASE_URL = "https://openaffiliate.dev";

function latestProgramDate(items: Program[]): string | undefined {
  return items
    .flatMap((program) =>
      [program.updatedAt, program.lastVerifiedAt, program.createdAt].filter(
        (date): date is string => Boolean(date)
      )
    )
    .sort()
    .at(-1);
}

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, changeFrequency: "weekly", priority: 1.0 },
    { url: `${BASE_URL}/programs`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/rankings`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE_URL}/categories`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/networks`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/compare`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/submit`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/about`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/changelog`, changeFrequency: "monthly", priority: 0.5 },
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

  const networks = [...new Set(programs.map((p) => p.network ?? "in-house"))];
  const networkPages: MetadataRoute.Sitemap = networks.map((network) => {
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

  const programPages: MetadataRoute.Sitemap = programs.map((p) => ({
    url: `${BASE_URL}/programs/${p.slug}`,
    lastModified: p.updatedAt ?? p.lastVerifiedAt ?? p.createdAt ?? undefined,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [...staticPages, ...docsPages, ...categoryPages, ...networkPages, ...programPages];
}
