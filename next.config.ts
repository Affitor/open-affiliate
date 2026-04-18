import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    // Match the typescript policy: don't block deploys on lint. Lint runs in
    // CI as a separate gate. Without this, a single ESLint error in any file
    // (including WIP paths like apps/embed or new API routes) fails
    // `next build` on Vercel and takes prod down.
    ignoreDuringBuilds: true,
  },
  // Ensure the embed bundle is packaged into the deployment so /embed.js works
  // on Vercel. The route in src/app/embed.js/route.ts reads this file at
  // request time.
  outputFileTracingIncludes: {
    "/embed.js": ["./apps/embed/dist/**"],
  },
};

export default nextConfig;
