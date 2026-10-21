import { NextResponse } from "next/server"

export function apiError(status: number, code: string, message: string, hint: string) {
  return NextResponse.json({ error: { code, message, hint } }, {
    status,
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
  })
}

// A client may pin the REST API version with an API-Version request header.
// Leaving it out means the current version; any other value is refused, never
// answered as 1. Checked in src/proxy.ts, before the CDN cache: the cache does
// not key on this header, so a route handler would never see a cached hit.
// Trailing slash included: skipTrailingSlashRedirect serves /api/categories/ too.
const REST_PATH = /^\/api\/(programs(\/[^/]+)?|categories|submissions(\/[^/]+)?)\/?$/

export function unsupportedApiVersion(request: Request) {
  const version = request.headers.get("API-Version")
  if (version === null || version === "1" || !REST_PATH.test(new URL(request.url).pathname)) return null
  return apiError(400, "UNSUPPORTED_API_VERSION", "This API-Version is not available.", "Send API-Version: 1, or leave the header out. See /openapi.json.")
}
