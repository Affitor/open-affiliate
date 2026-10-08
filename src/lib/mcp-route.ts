import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { programs, categories, getProgram } from "@/lib/programs";

/**
 * The hosted MCP server, as route handlers.
 *
 * Two paths serve the same three tools:
 *
 *   /mcp      — canonical. `claude mcp add --transport http openaffiliate
 *               https://openaffiliate.dev/mcp` is the whole install.
 *   /api/mcp  — kept indefinitely. packages/mcp/server.json, the npm package
 *               README and external MCP registries already point here, and a
 *               published endpoint that stops answering is a broken client.
 *
 * Why two thin routes instead of one Next rewrite: mcp-handler dispatches on
 * `new URL(req.url).pathname === basePath + "/mcp"` by strict equality. A
 * rewrite leaves req.url as the requested path, so a handler built with
 * basePath "/api" never matches a request for /mcp.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
  "Access-Control-Max-Age": "86400",
};

/**
 * Per-IP request cap.
 *
 * The tools read an in-process import of registry.json — no database, no
 * upstream API — so the only cost of abuse is function invocations, and the
 * only thing worth stopping is one client flooding the endpoint. That makes a
 * shared store (Redis, KV) the wrong amount of machinery: this is the same
 * in-memory per-IP map /api/content-lab already uses, which means the cap is
 * per instance and therefore a floor, not a ceiling. Deliberate. A real MCP
 * session spends well under 100 requests, so a legitimate client never sees a
 * 429, and the SSE responses here cannot be CDN-cached to serve the same end.
 */
const MAX_REQUESTS = 300;
const WINDOW_MS = 5 * 60 * 1000;
const MAX_TRACKED_IPS = 10_000;

const hits = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return (
    forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown"
  );
}

function withinLimit(req: Request): boolean {
  const now = Date.now();
  const ip = clientIp(req);
  const entry = hits.get(ip);

  if (!entry || now >= entry.resetAt) {
    // Pruned here rather than on a module-level setInterval: a timer in a
    // serverless function fires on whichever instance happens to be warm,
    // while this runs exactly when the map is actually being written to.
    if (hits.size >= MAX_TRACKED_IPS) {
      for (const [key, value] of hits) {
        if (now >= value.resetAt) hits.delete(key);
      }
    }
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (entry.count >= MAX_REQUESTS) return false;

  entry.count++;
  return true;
}

function tooManyRequests(): Response {
  // JSON-RPC shaped so an MCP client surfaces the reason instead of "the
  // server returned invalid JSON".
  return Response.json(
    {
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32000,
        message: `Rate limit reached: ${MAX_REQUESTS} requests per ${
          WINDOW_MS / 60000
        } minutes per IP. The same data is available uncapped at https://openaffiliate.dev/api/programs and as markdown at https://openaffiliate.dev/programs.md`,
      },
    },
    {
      status: 429,
      headers: { ...CORS, "Retry-After": String(WINDOW_MS / 1000) },
    }
  );
}

function registerTools(server: Parameters<Parameters<typeof createMcpHandler>[0]>[0]) {
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
          // mode and value are what an agent should read. rate is the raw
          // string the source wrote and needs parsing; mode "unknown" says
          // outright that no figure was published, which is a better answer
          // than handing back the word "varies".
          mode: p.commission.mode,
          value: p.commission.value,
          rate: p.commission.rate,
          currency: p.commission.currency,
        },
        cookieDays: p.cookieDays,
        verified: p.verified,
        signupUrl: p.signupUrl ?? p.url,
        // Agents cite what they can fetch. The markdown twin is the citable
        // form of this row.
        markdownUrl: `https://openaffiliate.dev/programs/${p.slug}.md`,
      }));

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(summaries, null, 2) },
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
            text: JSON.stringify(
              {
                ...program,
                markdownUrl: `https://openaffiliate.dev/programs/${program.slug}.md`,
              },
              null,
              2
            ),
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
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    }
  );
}

/**
 * Build the handlers for one mount point.
 *
 * `basePath` is the segment the route sits under — "" for /mcp, "/api" for
 * /api/mcp — and must match the route's own directory or mcp-handler will not
 * recognise the request.
 */
export function createMcpRoute(basePath: string) {
  const handler = createMcpHandler(
    registerTools,
    {
      // Named, because a client listing its connected servers should not be
      // shown mcp-handler's placeholder. Version is this surface's own, and
      // moves one patch step when the tool set changes.
      serverInfo: { name: "openaffiliate", version: "1.0.0" },
    },
    { basePath, maxDuration: 30 }
  );

  const guarded = async (req: Request) => {
    if (!withinLimit(req)) return tooManyRequests();

    const response = await handler(req);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(CORS)) headers.set(key, value);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };

  return {
    GET: guarded,
    POST: guarded,
    DELETE: guarded,
    OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
  };
}
