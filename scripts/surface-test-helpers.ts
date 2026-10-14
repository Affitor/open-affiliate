/**
 * Shared by the API shape tests: the REST and MCP routes called in-process,
 * and the rendering code of the CLI already installed from npm. No main().
 */
import assert from "node:assert/strict"
import { NextRequest } from "next/server"
import { GET as restGet } from "../src/app/api/programs/[slug]/route"
import { GET as restList } from "../src/app/api/programs/route"
import { createMcpRoute } from "../src/lib/mcp-route"

export async function restGetProgram(slug: string): Promise<Record<string, unknown>> {
  const res = await restGet(new NextRequest(`http://localhost/api/programs/${slug}`), {
    params: Promise.resolve({ slug }),
  })
  assert.equal(res.status, 200)
  return res.json()
}

export async function restListPrograms(query: string): Promise<Record<string, unknown>[]> {
  const res = restList(new NextRequest(`http://localhost/api/programs?${query}`))
  assert.equal(res.status, 200)
  return (await res.json()).programs
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function mcpCall(name: string, args: Record<string, unknown>): Promise<any> {
  const { POST } = createMcpRoute("")
  const res = await POST(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    })
  )
  assert.equal(res.status, 200)
  const raw = await res.text()
  // Streamable HTTP may answer as one SSE event; the JSON-RPC message is its data line.
  const message = JSON.parse(raw.trim().startsWith("{") ? raw : raw.split("\n").find((l) => l.startsWith("data: "))!.slice(6))
  return JSON.parse(message.result.content[0].text)
}

export function mcpGetProgram(slug: string): Promise<Record<string, unknown>> {
  return mcpCall("get_program", { slug })
}

/**
 * The `info` and `add` code of openaffiliate@0.0.2, npm's `latest` (0.2.0 is
 * the same code), copied verbatim from its dist/index.js. Installed copies
 * cannot be updated, so the API has to keep working for exactly this.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function publishedCliInfo(p: any): string {
  return `
  ${p.name}${p.verified ? " ✓" : ""}
  ${p.shortDescription}
  ${"─".repeat(50)}

  Commission:  ${p.commission.rate}% ${p.commission.type}${p.commissionDuration ? ` (${p.commissionDuration})` : ""}
  Cookie:      ${p.cookieDays} days
  Payout:      $${p.payout.minimum} min / ${p.payout.frequency}
  ${p.payoutMethods ? `Methods:     ${p.payoutMethods.join(", ")}` : ""}
  ${p.approval ? `Approval:    ${p.approval}${p.approvalTime ? ` (${p.approvalTime})` : ""}` : ""}
  ${p.network ? `Network:     ${p.network}` : ""}
  URL:         ${p.url}
  ${p.signupUrl ? `Signup:      ${p.signupUrl}` : ""}

  Tags: ${p.tags.join(", ")}
  ${p.restrictions?.length ? `
  Restrictions:
${p.restrictions.map((r: string) => `    • ${r}`).join("\n")}` : ""}

  AGENTS.md:
  ${p.agentPrompt}
  ${p.agentUseCases?.length ? `
  Use cases:
${p.agentUseCases.map((u: string) => `    • ${u}`).join("\n")}` : ""}
`
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function publishedCliAddCommission(p: any): string {
  return `${p.commission.rate} ${p.commission.type}`
}

/** The `search` table's cookie cell in the same code. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function publishedCliSearchCookie(p: any): string {
  return `${p.cookieDays}d`
}
