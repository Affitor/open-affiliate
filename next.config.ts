import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

export default nextConfig;
