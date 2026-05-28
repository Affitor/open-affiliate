"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { getPostHogKey, initPostHog, posthog } from "@/lib/posthog";

// Initializes PostHog inside the React tree (so init and all capture() calls
// use the same posthog-js instance — see lib/posthog.ts) and captures a
// $pageview on the initial load and on every App Router client navigation.
//
// Uses only usePathname (not useSearchParams) so it doesn't force the ~800
// statically-generated pages into dynamic rendering. posthog.capture fills
// $current_url / $host (incl. query string) from window.location automatically.
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    initPostHog();
  }, []);

  useEffect(() => {
    if (!getPostHogKey() || typeof window === "undefined") return;
    try {
      posthog.capture("$pageview");
    } catch {
      /* analytics must never break the UX */
    }
  }, [pathname]);

  return <>{children}</>;
}
