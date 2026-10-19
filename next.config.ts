import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

// Named export: scripts/program-aliases.test.ts calls redirects() on it directly.
export const nextConfig: NextConfig = {
  // cacheComponents disabled: it is incompatible with the ISR route configs
  // (`revalidate` / `dynamicParams`) added in #33 to cap the Apify cost leak,
  // which broke the Turbopack production build. Nothing uses the "use cache"
  // directive, so disabling is safe and keeps the ISR cost fix.
  typescript: {
    ignoreBuildErrors: true,
  },
  // Ensure the embed bundle is packaged into the deployment so /embed.js works
  // on Vercel. The route in src/app/embed.js/route.ts reads this file at
  // request time.
  outputFileTracingIncludes: {
    "/embed.js": ["./apps/embed/dist/**"],
  },
  // PostHog reverse proxy: serve analytics from our own domain via /_ph so
  // ad-blockers don't strip it. instrumentation-client.ts sets api_host:"/_ph".
  // US Cloud splits static assets onto us-assets.i.posthog.com.
  skipTrailingSlashRedirect: true,
  // /for-agents is the conventional entry point other sites use; the MCP docs page covers it.
  async redirects() {
    // A program's URL-shaped YAML `aliases` (former names, the spellings people
    // and agents guess) send its page and .md twin to the canonical slug, e.g.
    // /programs/quso -> /programs/vidyo. Read from the registry.json that
    // prebuild (npm run build) or predev (npm run dev) has just regenerated;
    // scripts/program-rules.ts aliasRoutes decides which aliases qualify, and
    // never one that is a real slug. Two redirects per alias; Vercel caps a
    // deployment at 1,024 redirects
    // (node_modules/next/dist/docs/01-app/02-guides/redirecting.md).
    const registry = JSON.parse(readFileSync(join(process.cwd(), "src", "lib", "registry.json"), "utf8"));
    // A registry from before the map existed would ship no program redirects
    // at all, and nothing would look broken. Refuse it instead.
    if (typeof registry.aliases !== "object" || registry.aliases === null) {
      throw new Error(
        "src/lib/registry.json has no `aliases` map, so no /programs/<alias> redirect would exist. " +
          "Regenerate it with `npm run registry:build` (npm run build and npm run dev do this first)."
      );
    }
    const aliases: Record<string, string> = registry.aliases;
    return [
      ...["/for-agents", "/for-agents/"].map((source) => ({ source, destination: "/docs/mcp", permanent: false })),
      ...Object.entries(aliases).flatMap(([alias, slug]) =>
        ["", ".md"].map((ext) => ({
          source: `/programs/${alias}${ext}`,
          destination: `/programs/${slug}${ext}`,
          permanent: true,
        }))
      ),
    ];
  },
  // Discovery files (ARD catalog, agent-skills index) are fetched by agents and
  // crawlers from other origins; ARD's publishing guide asks for CORS.
  // API-Version is set here, not per route, so every /api response carries it,
  // including 405s for unsupported methods, OPTIONS and the badge. Policy:
  // info.description in src/lib/openapi.ts.
  async headers() {
    return [
      { source: "/.well-known/:path*", headers: [{ key: "Access-Control-Allow-Origin", value: "*" }] },
      { source: "/api/:path*", headers: [{ key: "API-Version", value: "1" }] },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/_ph/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/_ph/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
};

// The GitHub button in the nav shows the repo's star count. It is read once per
// build (every deploy), so it costs no request at runtime and makes no page
// dynamic. A failed or slow read leaves it empty and the nav hides the count.
async function githubStars(): Promise<string> {
  try {
    const res = await fetch("https://api.github.com/repos/Affitor/open-affiliate", {
      headers: { accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return "";
    const { stargazers_count } = await res.json();
    return Number.isInteger(stargazers_count) ? String(stargazers_count) : "";
  } catch {
    return "";
  }
}

export default async function config(): Promise<NextConfig> {
  return { ...nextConfig, env: { NEXT_PUBLIC_GITHUB_STARS: await githubStars() } };
}
