import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server"

// Counts every hit on /api/*, cached or not, as a PostHog `api_request`
// event. The route handlers cannot do this themselves: responses sit in the
// CDN cache for an hour, so a handler only ever sees the misses. The proxy
// runs before the cache, on every request. This is where agent traffic from
// the skills repo (utm_source=affiliate-skills) becomes visible.
export const config = { matcher: "/api/:path*" }

const POSTHOG_URL = "https://us.i.posthog.com/i/v0/e/"

export function proxy(request: NextRequest, event: NextFetchEvent) {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (key) {
    const { pathname, searchParams } = request.nextUrl
    const userAgent = request.headers.get("user-agent") ?? ""
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? ""
    event.waitUntil(
      crypto.subtle
        .digest("SHA-256", new TextEncoder().encode(`${ip}|${userAgent}`))
        .then((hash) =>
          fetch(POSTHOG_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              api_key: key,
              event: "api_request",
              // One id per (ip, user-agent) pair, hashed so no raw IP is stored.
              distinct_id: "api:" + Array.from(new Uint8Array(hash).slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join(""),
              properties: {
                path: pathname,
                q: searchParams.get("q"),
                utm_source: searchParams.get("utm_source"),
                src: searchParams.get("src"),
                user_agent: userAgent,
                referer: request.headers.get("referer"),
                $process_person_profile: false,
              },
            }),
          })
        )
        .catch(() => {})
    )
  }
  return NextResponse.next()
}
