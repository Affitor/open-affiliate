import { NextResponse } from "next/server"

export function apiError(status: number, code: string, message: string, hint: string) {
  return NextResponse.json({ error: { code, message, hint } }, {
    status,
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store", "API-Version": "1" },
  })
}
