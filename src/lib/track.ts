import { posthog } from "@/lib/posthog";
import { AFFITOR_CLICK, isAffitorHref } from "@/lib/affitor-link";

// The registry's key for a brand's own program (lib/programs IN_HOUSE); not
// imported from there, which would pull the registry into client bundles.
const IN_HOUSE = "in-house";

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let sid = sessionStorage.getItem("oa-sid");
  if (!sid) {
    sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem("oa-sid", sid);
  }
  return sid;
}

function getDevice(): string {
  if (typeof window === "undefined") return "unknown";
  return /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "desktop";
}

function getUtmParams(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
    const val = params.get(key);
    if (val) utm[key] = val;
  }
  return utm;
}

export function track(
  type: string,
  data?: { slug?: string; metadata?: Record<string, unknown> }
) {
  if (typeof window === "undefined") return;

  const utm = getUtmParams();
  const metadata = {
    ...data?.metadata,
    ...(Object.keys(utm).length > 0 ? { utm } : {}),
  };

  // Mirror high-signal events into PostHog so they power funnels (e.g.
  // search -> program_view -> outbound_click) and correlate with session
  // replays. $pageview is captured by posthog-js itself, so skip page_view
  // here to avoid double-counting.
  if (type !== "page_view") {
    try {
      posthog.capture(type, {
        ...(data?.slug ? { slug: data.slug } : {}),
        ...metadata,
      });
    } catch {
      /* analytics must never break the UX */
    }
  }

  fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type,
      slug: data?.slug,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      path: window.location.pathname,
      session_id: getSessionId(),
      device: getDevice(),
    }),
    keepalive: true,
  }).catch(() => {});
}

/**
 * A PostHog-only funnel event: not stored by /api/events, which accepts only
 * its own list of types. Keep properties small and never pass an email or
 * any other contact detail.
 */
export function capture(event: string, props?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    posthog.capture(event, props);
  } catch {
    /* analytics must never break the UX */
  }
}

/**
 * apply_click: one event for every Apply / Join / Sign up link to a program's
 * signup, whatever the page; `source` names the page type. A link to
 * affitor.com is joined on Affitor, so its network is affitor.
 */
export function trackApply(href: string, slug: string, network: string | null | undefined, source: string) {
  capture("apply_click", { slug, network: isAffitorHref(href) ? "affitor" : network || IN_HOUSE, source });
}

/**
 * AFFITOR_CLICK for a link to affitor.com, nothing for any other link.
 * `placement` is the link's utm_medium, so OA's click and the visit Affitor
 * sees carry the same name.
 */
export function trackAffitorClick(href: string, cta: string, slug?: string) {
  if (!isAffitorHref(href)) return;
  capture(AFFITOR_CLICK, { placement: new URL(href).searchParams.get("utm_medium"), cta, ...(slug ? { slug } : {}) });
}
