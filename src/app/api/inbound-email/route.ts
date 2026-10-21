import { handleInboundEmail } from "@/lib/inbound-email"

// POST /api/inbound-email — Resend Inbound `email.received` webhook.
// Forwards mail sent to @openaffiliate.dev to OA_INBOX_FORWARD_TO only.
// See src/lib/inbound-email.ts.

export const maxDuration = 60

export function POST(req: Request): Promise<Response> {
  return handleInboundEmail(req, { env: process.env, fetch, now: Date.now })
}
