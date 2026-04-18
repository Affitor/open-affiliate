import type { MetadataRoute } from "next";
import { programs, categories, categoryToSlug, networkToSlug } from "@/lib/programs";
import { docsNav } from "@/app/docs/_config";

const BASE_URL = "https://openaffiliate.dev";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, changeFrequency: "weekly", priority: 1.0 },
    { url: `${BASE_URL}/programs`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/rankings`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE_URL}/categories`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/networks`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/compare`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/submit`, changeFrequency: "monthly", priority: 0.5 },
  ];

  const docsPages: MetadataRoute.Sitemap = docsNav
    .flatMap((g) => g.items)
    .map((item) => ({
      url: `${BASE_URL}${item.href}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));

  const categoryPages: MetadataRoute.Sitemap = categories.map((c) => ({
    url: `${BASE_URL}/categories/${categoryToSlug(c)}`,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  const networks = [...new Set(programs.map((p) => p.network ?? "In-house"))];
  const networkPages: MetadataRoute.Sitemap = networks.map((n) => ({
    url: `${BASE_URL}/networks/${networkToSlug(n)}`,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  const programPages: MetadataRoute.Sitemap = programs.map((p) => ({
    url: `${BASE_URL}/programs/${p.slug}`,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [...staticPages, ...docsPages, ...categoryPages, ...networkPages, ...programPages];
}
