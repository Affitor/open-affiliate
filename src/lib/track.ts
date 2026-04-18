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
