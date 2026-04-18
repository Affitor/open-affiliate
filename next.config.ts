import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  // Ensure the embed bundle is packaged into the deployment so /embed.js works
  // on Vercel. The route in src/app/embed.js/route.ts reads this file at
  // request time.
  outputFileTracingIncludes: {
    "/embed.js": ["./apps/embed/dist/**"],
  },
};

export default nextConfig;
