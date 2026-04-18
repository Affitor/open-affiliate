#!/usr/bin/env node

/**
 * OpenAffiliate MCP Server (stdio transport)
 *
 * Standalone MCP server that connects to the OpenAffiliate API.
 * For use with Claude Desktop, Cursor, etc. via stdio transport.
 *
 * Usage in MCP config:
 * {
 *   "mcpServers": {
 *     "openaffiliate": {
 *       "command": "npx",
 *       "args": ["openaffiliate-mcp"]
 *     }
 *   }
 * }
 *
 * Or use the HTTP endpoint directly:
 * {
 *   "mcpServers": {
 *     "openaffiliate": {
 *       "url": "https://openaffiliate.dev/api/mcp"
 *     }
 *   }
 * }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE =
  process.env.OPENAFFILIATE_API || "https://openaffiliate.dev";

async function fetchJSON(path: string) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

const server = new McpServer({
  name: "openaffiliate",
  version: "0.2.0",
});

server.tool(
  "search_programs",
  "Search affiliate programs by keyword, category, or commission type",
  {
    query: z.string().optional().describe("Search keyword"),
    category: z.string().optional().describe("Filter by category"),
    commission_type: z
      .enum(["recurring", "one-time", "tiered"])
      .optional()
      .describe("Filter by commission type"),
    verified_only: z
      .boolean()
      .optional()
      .describe("Only return verified programs"),
  },
  async ({ query, category, commission_type, verified_only }) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (category) params.set("category", category);
    if (commission_type) params.set("type", commission_type);
    if (verified_only) params.set("verified", "true");

    const data = await fetchJSON(`/api/programs?${params}`);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(data.programs, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "get_program",
  "Get full details of an affiliate program including agent instructions, commission terms, restrictions, and signup info",
  {
    slug: z.string().describe("Program slug (e.g. 'stripe', 'vercel')"),
  },
  async ({ slug }) => {
    const data = await fetchJSON(`/api/programs/${slug}`);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "list_categories",
  "List all affiliate program categories with the number of programs in each",
  {},
  async () => {
    const data = await fetchJSON("/api/categories");
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(data.categories, null, 2),
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
