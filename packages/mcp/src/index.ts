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
 *       "url": "https://openaffiliate.dev/mcp"
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

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const server = new McpServer({
  name: "openaffiliate",
  title: "OpenAffiliate",
  version: "0.0.5",
});

server.registerTool(
  "search_programs",
  {
    title: "Search Programs",
    annotations: READ_ONLY_ANNOTATIONS,
    description:
      "Search affiliate programs by keyword, category, or commission type",
    inputSchema: {
      query: z.string().optional().describe("Search keyword"),
      category: z.string().optional().describe("Filter by exact category name as returned by list_categories (case-sensitive, not a slug), e.g. 'AI', 'Email Marketing'"),
      commission_type: z
        .enum(["recurring", "one-time", "tiered"])
        .optional()
        .describe("Filter by payment structure: recurring = paid on each renewal within the commission duration; one-time = paid once per qualifying referral; tiered = commission varies by performance level. Omit to include all types, including hybrid"),
      verified_only: z
        .boolean()
        .optional()
        .describe("When true, return only programs whose terms were checked on the brand's own program page. False or omitted includes unverified programs with unconfirmed terms"),
    },
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

server.registerTool(
  "get_program",
  {
    title: "Get Program",
    annotations: READ_ONLY_ANNOTATIONS,
    description:
      "Get full details of an affiliate program including agent instructions, commission terms, restrictions, and signup info",
    inputSchema: {
      slug: z.string().describe("Use the slug from search_programs results or the final segment of a program URL (e.g. /programs/vercel). Aliases resolve to the canonical program"),
    },
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

server.registerTool(
  "list_categories",
  {
    title: "List Categories",
    annotations: READ_ONLY_ANNOTATIONS,
    description:
      "List all affiliate program categories with the number of programs in each",
    inputSchema: {},
  },
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
