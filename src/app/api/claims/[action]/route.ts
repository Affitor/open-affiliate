import { after } from "next/server"
import { getProgram, programs } from "@/lib/programs"
import { liveClaimDeps } from "@/lib/claims/live"
import { registrableDomain } from "@/lib/claims/rules"
import { claimDisabledResponse, handleClaim, type ClaimProgram } from "@/lib/claims/service"

// POST /api/claims/{send-code|verify|dns-start|dns-check|manual|edit|program-new|release
//                   |signin-code|signin-verify|signout|member-add|member-remove|account-switch}
// GET  /api/claims/session?slug=   /api/claims/account
// 503 "claims not enabled" until every claim secret is set (src/lib/claims/rules.ts).

type Context = { params: Promise<{ action: string }> }

// Registry listings by registrable domain, built once per server instance.
let byDomain: Map<string, ClaimProgram[]> | null = null

function programsOnDomain(domain: string): ClaimProgram[] {
  if (!byDomain) {
    byDomain = new Map()
    for (const p of programs) {
      const d = registrableDomain(p.url)
      if (!d) continue
      const list = byDomain.get(d) ?? []
      list.push(p)
      byDomain.set(d, list)
    }
  }
  return byDomain.get(domain) ?? []
}

async function run(req: Request, { params }: Context): Promise<Response> {
  const { action } = await params
  const deps = liveClaimDeps(getProgram, programsOnDomain, () => programs, (task) => after(task))
  if (!deps) return claimDisabledResponse()
  return handleClaim(action, req, deps)
}

export const GET = run
export const POST = run
