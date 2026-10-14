import { getProgram } from "@/lib/programs"
import { liveClaimDeps } from "@/lib/claims/live"
import { claimDisabledResponse, handleClaim } from "@/lib/claims/service"

// POST /api/claims/{send-code|verify|dns-start|dns-check|manual|terms|release}
// GET  /api/claims/session?slug=
// 503 "claims not enabled" until every claim secret is set (src/lib/claims/rules.ts).

type Context = { params: Promise<{ action: string }> }

async function run(req: Request, { params }: Context): Promise<Response> {
  const { action } = await params
  const deps = liveClaimDeps(getProgram)
  if (!deps) return claimDisabledResponse()
  return handleClaim(action, req, deps)
}

export const GET = run
export const POST = run
