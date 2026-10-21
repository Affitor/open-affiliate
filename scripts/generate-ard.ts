import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { operations } from "../src/lib/openapi"

const BASE = "https://openaffiliate.dev"

/**
 * Agentic Resource Discovery catalog (https://agenticresourcediscovery.org/spec/, v0.91 §5.1):
 * one entry per agent surface this site serves. ARD itself needs only entries; specVersion
 * and host come from the AI Catalog Standard it builds on (https://ai-catalog.io/specification/),
 * which requires specVersion in Major.Minor form. Reads the agent-skills index, so it runs after
 * generateSkills. The MCP entry embeds the MCP Registry server.json inline, so it cannot drift.
 */
export function ardCatalog(root: string) {
  const server = JSON.parse(readFileSync(join(root, "packages/mcp/server.json"), "utf8"))
  const [skill] = JSON.parse(readFileSync(join(root, "public/.well-known/agent-skills/index.json"), "utf8")).skills
  return {
    specVersion: "1.0",
    host: { displayName: "OpenAffiliate", identifier: "openaffiliate.dev", documentationUrl: `${BASE}/docs/mcp` },
    entries: [
      {
        identifier: "urn:air:openaffiliate.dev:mcp:openaffiliate",
        displayName: "OpenAffiliate MCP server",
        type: "application/mcp-server+json",
        data: server,
        description: "Hosted MCP server for the OpenAffiliate registry at https://openaffiliate.dev/mcp (streamable HTTP, no key). Read-only except submit_program, which only queues a missing program for verification.",
        capabilities: ["search_programs", "get_program", "list_categories", "submit_program", "get_submission_status"],
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
        description: "REST API for searching affiliate programs and reading their terms, plus one write that queues a missing program for verification. No key.",
        capabilities: operations().map(({ op }) => op.operationId),
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

// One document at both discovery paths: ARD's ard.json and the AI Catalog Standard's own
// ai-catalog.json, which the ARD spec keeps as an equivalent source.
export const CATALOG_PATHS = ["public/.well-known/ard.json", "public/.well-known/ai-catalog.json"]

export function generateArd(root: string): void {
  const catalog = JSON.stringify(ardCatalog(root), null, 2) + "\n"
  for (const file of CATALOG_PATHS) {
    const path = join(root, file)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, catalog)
  }
}
