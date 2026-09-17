import type { MetadataRoute } from "next";

const AI_USER_AGENTS = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "GPTBot",
  "Claude-SearchBot",
  "Claude-User",
  "ClaudeBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
];

const DISALLOWED_PATHS = ["/api/", "/_ph/"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: DISALLOWED_PATHS,
      },
      {
        // OpenAffiliate is an MIT-licensed public registry. Search, retrieval,
        // and model-training agents may crawl the published pages and Markdown
        // twins, but not API or analytics-proxy endpoints.
        userAgent: AI_USER_AGENTS,
        allow: "/",
        disallow: DISALLOWED_PATHS,
      },
    ],
    sitemap: "https://openaffiliate.dev/sitemap.xml",
    host: "https://openaffiliate.dev",
  };
}
