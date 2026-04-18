import type { MetadataRoute } from "next";
import { programs, categories } from "@/lib/programs";

const BASE_URL = "https://openaffiliate.dev";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, changeFrequency: "weekly", priority: 1.0 },
    { url: `${BASE_URL}/programs`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/rankings`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE_URL}/compare`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/submit`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/docs`, changeFrequency: "monthly", priority: 0.6 },
  ];

  const programPages: MetadataRoute.Sitemap = programs.map((p) => ({
    url: `${BASE_URL}/programs/${p.slug}`,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [...staticPages, ...programPages];
}
