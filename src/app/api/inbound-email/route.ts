import { createClient } from "@supabase/supabase-js"
import { handleInboundEmail, supabaseLedger } from "@/lib/inbound-email"

// POST /api/inbound-email — Resend Inbound `email.received` webhook.
// Forwards mail sent to @openaffiliate.dev to OA_INBOX_FORWARD_TO only.
// See src/lib/inbound-email.ts and supabase/migrations/013_inbox_forwards.sql.

export const maxDuration = 60

export function POST(req: Request): Promise<Response> {
  const env = process.env
  const ledger =
    env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
      ? supabaseLedger(createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }))
      : null
  return handleInboundEmail(req, { env, fetch, now: Date.now, ledger })
}
