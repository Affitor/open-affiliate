import posthog from "posthog-js";

// Single shared PostHog client for the whole app. Init happens inside the
// React tree (components/posthog-provider.tsx), NOT in instrumentation-client.ts
// — Next builds instrumentation-client as a separate entry, which can give it a
// different posthog-js module instance than the app bundle. When that happens
// init() runs on one instance (config.js loads) while capture() calls in app
// components hit a second, uninitialized instance and silently send nothing.
// Everything importing from this module shares one instance, so init + capture
// always line up. Mirrors the working kyma setup.

let initialized = false;

export function getPostHogKey(): string | undefined {
  return process.env.NEXT_PUBLIC_POSTHOG_KEY;
}

export function initPostHog(): void {
  if (typeof window === "undefined") return;
  if (initialized) return;
  const key = getPostHogKey();
  if (!key) return;

  posthog.init(key, {
    // Same-origin reverse proxy (next.config.ts rewrites /_ph/* → posthog).
    // Override with NEXT_PUBLIC_POSTHOG_HOST in local dev if needed.
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "/_ph",
    ui_host: "https://us.posthog.com",
    // We capture $pageview manually in PostHogProvider (initial load + every
    // route change). Built-in capture_pageview defaults to 'history_change',
    // which misses the first load, so keep it off and own pageviews ourselves.
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: true,
    persistence: "localStorage+cookie",
    // No login on this site — don't spend person profiles on anonymous users.
    person_profiles: "identified_only",
  });
  initialized = true;
}

export { posthog };
