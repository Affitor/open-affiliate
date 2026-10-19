import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { openapi } from "../src/lib/openapi"

const BASE = "https://openaffiliate.dev"

/**
 * Agentic Resource Discovery catalog (https://agenticresourcediscovery.org/spec/, v0.91 §5.1):
 * one entry per agent surface this site serves. Reads the agent-skills index, so it runs after
 * generateSkills. The MCP entry embeds the MCP Registry server.json inline, so it cannot drift.
 */
export function ardCatalog(root: string) {
  const server = JSON.parse(readFileSync(join(root, "packages/mcp/server.json"), "utf8"))
  const [skill] = JSON.parse(readFileSync(join(root, "public/.well-known/agent-skills/index.json"), "utf8")).skills
  return {
    entries: [
      {
        identifier: "urn:air:openaffiliate.dev:mcp:openaffiliate",
        displayName: "OpenAffiliate MCP server",
        type: "application/mcp-server+json",
        data: server,
        description: "Hosted, read-only MCP server for the OpenAffiliate registry at https://openaffiliate.dev/mcp (streamable HTTP, no key).",
        capabilities: ["search_programs", "get_program", "list_categories"],
        representativeQueries: [
          "find affiliate programs for a developer tool",
          "which AI products pay recurring affiliate commission",
          "what are the commission and cookie terms of this affiliate program",
        ],
      },
      {
        identifier: "urn:air:openaffiliate.dev:api:openaffiliate",
        displayName: "OpenAffiliate REST API",
        type: "application/vnd.oai.openapi+json;version=3.1",
        url: `${BASE}/openapi.json`,
        description: "Read-only REST API for searching affiliate programs and reading their terms. No key.",
        capabilities: Object.values(openapi.paths).map((path) => path.get.operationId),
        representativeQueries: [
          "search affiliate programs by category and commission type",
          "get the signup URL and payout terms of an affiliate program",
        ],
      },
      {
        identifier: `urn:air:openaffiliate.dev:skill:${skill.name}`,
        displayName: "OpenAffiliate skill",
        type: "application/agent-skills+md",
        url: skill.url,
        description: skill.description,
        representativeQueries: [
          "recommend an affiliate program for my audience",
          "compare the affiliate terms of two SaaS products",
        ],
      },
      {
        identifier: "urn:air:openaffiliate.dev:docs:llms-txt",
        displayName: "OpenAffiliate llms.txt",
        type: "text/plain",
        url: `${BASE}/llms.txt`,
        description: "Index of the registry for language models: when to use it, data quality, categories, networks and how to query it.",
        representativeQueries: [
          "what does the OpenAffiliate registry cover",
          "list verified affiliate programs by category",
        ],
      },
    ],
  }
}

export function generateArd(root: string): void {
  const path = join(root, "public/.well-known/ard.json")
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(ardCatalog(root), null, 2) + "\n")
}
