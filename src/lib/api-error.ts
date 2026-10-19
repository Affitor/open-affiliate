import { NextResponse } from "next/server"

export function apiError(status: number, code: string, message: string, hint: string) {
  return NextResponse.json({ error: { code, message, hint } }, {
    status,
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
  })
}

// A client may pin the API version with an API-Version request header. Leaving it
// out means the current version; any other value is refused, never answered as 1.
export function unsupportedApiVersion(request: Request) {
  const version = request.headers.get("API-Version")
  if (version === null || version === "1") return null
  return apiError(400, "UNSUPPORTED_API_VERSION", "This API-Version is not available.", "Send API-Version: 1, or leave the header out. See /openapi.json.")
}
