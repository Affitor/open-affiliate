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
 * Flood guard. Not a quota, and deliberately not a security boundary.
 *
 * The tools read an in-process import of registry.json — no database, no
 * upstream API — so the only cost of abuse is function invocations, and the
 * only thing worth stopping is a single source hammering the endpoint. Three
 * things follow from that, and they are limits of this design rather than
 * oversights:
 *
 * 1. The count lives in one instance's memory. There is no shared store, so
 *    the real ceiling is this number times however many instances are warm.
 *    A flood still gets capped on whichever instance it lands on.
 * 2. The address comes from the proxy-set forwarded header. Nothing here can
 *    prove it: on Vercel the edge overwrites x-forwarded-for with the real
 *    client address, and that overwrite — not this code — is what stops a
 *    caller inventing one. Run this behind a proxy that passes the header
 *    through and the dimension becomes caller-controlled.
 * 3. Because of 2, the budget is set as a flood threshold rather than a fair
 *    share: 20 requests a second from one address. The docs point Claude.ai
 *    and ChatGPT at this endpoint and those connect from the vendor's own
 *    egress addresses, so every user of one of those clients shares a single
 *    bucket. A per-session budget would 429 real users; this one should only
 *    ever be reached by something behaving badly.
 */
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 1200;
const MAX_TRACKED_ADDRESSES = 20_000;

let counts = new Map<string, number>();
let windowStartedAt = Date.now();

function clientAddress(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return (
    forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown"
  );
}

/**
 * O(1) per request. The window ends by dropping the whole Map rather than
 * scanning it for expired entries, and the bound is enforced the same way:
 * an earlier version pruned only entries whose window had passed, which is
 * useless in the one case a bound exists for — many distinct addresses inside
 * a single window, where nothing has expired. That version grew without limit
 * and scanned the whole map on every new address.
 *
 * Dropping the map early costs one forgotten window. Nothing more: a caller
 * able to rotate addresses fast enough to force that already defeats any
 * per-address limiter, so this trades no protection for a hard bound.
 */
function withinLimit(req: Request): boolean {
  const now = Date.now();
  if (now - windowStartedAt >= WINDOW_MS) {
    counts = new Map();
    windowStartedAt = now;
  }
  if (counts.size >= MAX_TRACKED_ADDRESSES) counts.clear();

  const address = clientAddress(req);
  const seen = (counts.get(address) ?? 0) + 1;
  counts.set(address, seen);
  return seen <= MAX_REQUESTS_PER_WINDOW;
}

/**
 * Plain text, not a JSON-RPC error envelope.
 *
 * The limit is checked from the headers alone, before the body is read, so
 * the request's JSON-RPC id is not known here. An envelope carrying
 * `id: null` is worse than no envelope: a client following the spec reads it
 * as an error belonging to no request, never settles the call it is waiting
 * on, and hangs to its own timeout instead of failing on the status. The
 * status line and Retry-After are unambiguous.
 */
function tooManyRequests(): Response {
  return new Response(
    `Rate limit reached: ${MAX_REQUESTS_PER_WINDOW} requests per ${
      WINDOW_MS / 1000
    } seconds per address.\n` +
      "The same data is uncapped at https://openaffiliate.dev/api/programs " +
      "and as markdown at https://openaffiliate.dev/programs.md\n",
    {
      status: 429,
      headers: {
        ...CORS,
        "Content-Type": "text/plain; charset=utf-8",
        "Retry-After": String(WINDOW_MS / 1000),
      },
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
        // Agents cite what they can fetch, and the markdown twin is the
        // citable form of this row. Hardcoded to production on purpose: this
        // is the URL a citation should point at, which is not the preview
        // deployment a client may happen to be talking to.
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
      // shown mcp-handler's placeholder ("mcp-typescript server on vercel").
      // The version stays at the 0.1.0 this endpoint already reported, so the
      // name is the only thing a connected client sees change, and it moves
      // one patch step when the tool set does.
      serverInfo: { name: "openaffiliate", version: "0.1.0" },
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
