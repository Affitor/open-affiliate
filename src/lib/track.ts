export function track(
  type: string,
  data?: { slug?: string; metadata?: Record<string, unknown> }
) {
  if (typeof window === "undefined") return;

  fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type,
      slug: data?.slug,
      metadata: data?.metadata,
    }),
    keepalive: true,
  }).catch(() => {});
}
