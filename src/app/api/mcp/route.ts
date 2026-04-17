import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { programs, categories, getProgram } from "@/lib/programs";

const MCP_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
  "Access-Control-Max-Age": "86400",
};

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "search_programs",
      {
        title: "Search Programs",
        description:
          "Search affiliate programs by keyword, category, or commission type",
        annotations: { readOnlyHint: true },
        inputSchema: {
          query: z
            .string()
            .optional()
            .describe("Search keyword to match against name, description, tags, or category"),
          category: z
            .string()
            .optional()
            .describe("Filter by category name (e.g. 'AI & ML Tools', 'Email Marketing')"),
          commission_type: z
            .enum(["recurring", "one-time", "tiered"])
            .optional()
            .describe("Filter by commission type"),
          verified_only: z
            .boolean()
            .optional()
            .describe("When true, return only verified programs"),
        },
      },
      async (params) => {
        let results = programs;

        if (params.category) {
          results = results.filter((p) => p.category === params.category);
        }
        if (params.commission_type) {
          results = results.filter(
            (p) => p.commission.type === params.commission_type
          );
        }
        if (params.verified_only) {
          results = results.filter((p) => p.verified);
        }
        if (params.query) {
          const q = params.query.toLowerCase();
          results = results.filter(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              p.shortDescription.toLowerCase().includes(q) ||
              p.tags.some((t) => t.toLowerCase().includes(q)) ||
              p.category.toLowerCase().includes(q)
          );
        }

        const summaries = results.map((p) => ({
          slug: p.slug,
          name: p.name,
          category: p.category,
          shortDescription: p.shortDescription,
          commission: {
            type: p.commission.type,
            rate: p.commission.rate,
            currency: p.commission.currency,
          },
          cookieDays: p.cookieDays,
          verified: p.verified,
          signupUrl: p.signupUrl ?? p.url,
        }));

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(summaries, null, 2),
            },
          ],
        };
      }
    );

    server.registerTool(
      "get_program",
      {
        title: "Get Program",
        description:
          "Get full details of an affiliate program including agent instructions, commission terms, restrictions, and signup info",
        annotations: { readOnlyHint: true },
        inputSchema: {
          slug: z.string().describe("Program slug (e.g. 'anthropic-claude')"),
        },
      },
      async ({ slug }) => {
        const program = getProgram(slug);
        if (!program) {
          return {
            content: [
              { type: "text" as const, text: `Program '${slug}' not found.` },
            ],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(program, null, 2),
            },
          ],
        };
      }
    );

    server.registerTool(
      "list_categories",
      {
        title: "List Categories",
        description:
          "List all affiliate program categories with the number of programs in each",
        annotations: { readOnlyHint: true },
        inputSchema: {},
      },
      async () => {
        const counts: Record<string, number> = {};
        for (const p of programs) {
          counts[p.category] = (counts[p.category] ?? 0) + 1;
        }
        const result = categories.map((name) => ({
          name,
          count: counts[name] ?? 0,
        }));
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }
    );
  },
  {},
  {
    basePath: "/api",
    maxDuration: 30,
  }
);

function withCors(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    const response = await fn(req);
    const newHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(MCP_CORS)) {
      newHeaders.set(key, value);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  };
}

const corsHandler = withCors(handler);

export function OPTIONS() {
  return new Response(null, { status: 204, headers: MCP_CORS });
}

export { corsHandler as GET, corsHandler as POST, corsHandler as DELETE };
