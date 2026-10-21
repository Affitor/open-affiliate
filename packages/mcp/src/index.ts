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
  version: "0.0.6",
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

/** Calls the REST submission API; a refusal comes back as a tool error the agent can read. */
async function submissionCall(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, init);
  const text = await res.text();
  return res.ok
    ? { content: [{ type: "text" as const, text }] }
    : { isError: true, content: [{ type: "text" as const, text: `${res.status} ${text}` }] };
}

server.registerTool(
  "submit_program",
  {
    title: "Submit Program",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description:
      "Queue a missing program for a maintainer to verify against the brand's own published terms. Not instant: nothing is listed or scored until verified. Call get_program or search_programs first",
    // Strict: unknown keys are refused, not silently dropped.
    inputSchema: z.object({
      programUrl: z.string().describe("https:// link to the affiliate or partner program page on the brand's own website"),
      termsUrl: z.string().optional().describe("https:// link to the page that states the program's terms, when it is a different page"),
      name: z.string().optional().describe("Brand or program name, up to 100 characters"),
      contact: z.string().optional().describe("Optional email for the person submitting; never shown publicly and never returned by any tool"),
      note: z.string().optional().describe("Optional note for the maintainer, up to 1000 characters"),
    }).strict(),
  },
  async (args) =>
    submissionCall("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    })
);

server.registerTool(
  "get_submission_status",
  {
    title: "Get Submission Status",
    annotations: READ_ONLY_ANNOTATIONS,
    description: "Read where a submitted program is: queued, verifying, listed or rejected",
    inputSchema: z.object({
      id: z.string().describe("The id submit_program returned"),
    }).strict(),
  },
  async ({ id }) => submissionCall(`/api/submissions/${encodeURIComponent(id)}`)
);

const transport = new StdioServerTransport();
await server.connect(transport);
