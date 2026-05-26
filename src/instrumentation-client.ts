// PostHog client-side init for openaffiliate.dev (PostHog project 439973).
//
// Next.js 16 runs this file after the HTML document loads but BEFORE React
// hydration — the ideal moment to boot analytics so the first $pageview and
// autocapture fire immediately. See node_modules/next/dist/docs/.../
// instrumentation-client.md.
//
// Traffic is reverse-proxied through /_ph (rewrites in next.config.ts) so that
// ad-blockers see a first-party path instead of *.posthog.com — recovers the
// ~30% of events blockers would otherwise drop (kyma pattern #1).
import posthog from "posthog-js";

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

if (key && typeof window !== "undefined") {
  try {
    posthog.init(key, {
      api_host: "/_ph",
      ui_host: "https://us.posthog.com",
      // Modern defaults: history-change $pageview capture (works with the
      // App Router), autocapture, and web vitals — no manual page tracking.
      defaults: "2026-01-30",
      // No login on this site, so only spend person profiles on identified
      // users (we have none today). Keeps us comfortably on the free tier.
      person_profiles: "identified_only",
    });
  } catch {
    // Instrumentation must never break the app (Next.js 16 guidance).
  }
}
