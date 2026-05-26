"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import posthog from "posthog-js";

// Captures a PostHog $pageview on the initial load and on every App Router
// client navigation.
//
// We do NOT rely on posthog-js's built-in capture_pageview here. With the
// project's `defaults: '2026-01-30'`, capture_pageview resolves to
// 'history_change', which only fires on History API changes (SPA navigations)
// and misses the first page load — so visitors who land and leave without
// navigating produced zero $pageview events, leaving Web analytics empty.
// instrumentation-client.ts therefore sets capture_pageview:false and this
// effect is the single source of $pageview (fires on mount = initial load,
// and whenever the pathname changes). posthog.capture fills $current_url,
// $host, $pathname, $session_id, etc. automatically.
export function PostHogPageView() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    try {
      posthog.capture("$pageview");
    } catch {
      /* analytics must never break the UX */
    }
  }, [pathname]);

  return null;
}
