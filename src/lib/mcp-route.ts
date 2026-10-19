import { createMcpHandler } from "mcp-handler";
import type { Implementation } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { livePrograms, categories, confirmedPitch, termsConfirmed } from "@/lib/programs";
import { resolveProgram } from "@/lib/program-aliases";
import { apiProgram } from "@/lib/no-program";

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
  // mcp-protocol-version: the SDK client sends it on every request after
  // initialize, so a browser client's preflight fails without it.
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Accept, mcp-protocol-version",
  // So browser code can read when to retry a 429.
  "Access-Control-Expose-Headers": "Retry-After",
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
 *    share: 1200 requests per fixed 60-second window from one address, about
 *    20 a second on average. The window is fixed, not sliding, so a burst
 *    that straddles a window boundary can get up to 2400 through in a few
 *    seconds. The docs point Claude.ai and ChatGPT at this endpoint and those
 *    connect from the vendor's own egress addresses, so every user of one of
 *    those clients shares a single bucket. A per-session budget would 429 real users; this one should only
 *    ever be reached by something behaving badly.
 */
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 1200;
const MAX_TRACKED_ADDRESSES = 20_000;

let counts = new Map<string, number>();
let windowStartedAt = Date.now();

// 45 characters is the longest unscoped textual IPv6 address (with an
// embedded IPv4 tail); a scoped address longer than that loses the end of its
// zone id and may share a bucket. Capping the key makes MAX_TRACKED_ADDRESSES
// a bound on memory, not only on entries: an uncapped header could make each
// key kilobytes long.
const MAX_ADDRESS_LENGTH = 45;

export function clientAddress(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const address = (
    forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown"
  ).slice(0, MAX_ADDRESS_LENGTH);
  // Copied, not returned as is: V8 represents slice/split/trim results as
  // views into the original header, so a 45-character key would keep the
  // whole header alive in the Map (measured on Node 22: 10,000 keys cut from
  // 8 KB headers retained 80 MiB as views, 1 MiB as copies).
  return Array.from(address).join("");
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
export function withinLimit(req: Request): boolean {
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
 * the request's JSON-RPC id is not known here and an envelope could only
 * carry `id: null`. That would add nothing for the installed SDK client
 * (@modelcontextprotocol/sdk 1.26): for a POST answered with 429 its HTTP
 * transport reads the body as text and throws a StreamableHTTPError with the
 * status, without parsing the body as JSON-RPC (a GET uses the status text).
 * So the 429 status line and Retry-After carry the meaning, and the body is a
 * sentence a person can read.
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

const SERVER_INFO: Implementation = {
  name: "openaffiliate",
  title: "OpenAffiliate",
  description: "Discover affiliate programs in a public, read-only registry with commission terms, signup links, and recommendation guidance.",
  version: "0.1.1",
  websiteUrl: "https://openaffiliate.dev",
  icons: [{ src: "https://openaffiliate.dev/favicon.svg", mimeType: "image/svg+xml", sizes: ["any"] }],
};

const INSTRUCTIONS =
  "OpenAffiliate is a public, read-only affiliate program registry; no API key or account is required. " +
  "Read commission.mode and commission.value for the figure and its units (percentage or flat currency amount); commission.rate preserves the raw source wording, and unknown mode means no figure is published. " +
  "cookieDays is omitted until the program's terms are verified. " +
  "Use search_programs for active listings and get_program for full details, including paused, discontinued, or no_program entries; check status and agentPrompt before recommending. " +
  "Cite the returned markdownUrl when referencing a program.";

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const commissionSchema = z.object({
  type: z.enum(["recurring", "one-time", "tiered", "hybrid"]),
  mode: z.enum(["percentage", "flat", "tiered", "hybrid", "unknown"])
    .describe("How to interpret value; unknown means no published figure"),
  value: z.number().nullable().describe("Percentage or currency amount for flat mode; null when unknown"),
  rate: z.union([z.string(), z.number()]).describe("Raw source wording; prefer mode and value"),
  currency: z.string().nullable().describe("Currency code for monetary amounts; null when unspecified"),
});

const markdownUrlSchema = z.string().describe("Citable program page in Markdown on openaffiliate.dev");
const cookieDaysSchema = z.number().describe("Attribution window in days; omitted until terms are verified").optional();
const categoryListSchema = z.array(z.object({
  name: z.string().describe("Category name accepted by search_programs"),
  count: z.number().int().nonnegative().describe("Number of active listings in this category"),
}));

const searchOutputSchema = {
  programs: z.array(z.object({
    slug: z.string().describe("Canonical slug to pass to get_program"),
    name: z.string(),
    category: z.string(),
    shortDescription: z.string(),
    commission: commissionSchema,
    cookieDays: cookieDaysSchema,
    verified: z.boolean().describe("Whether the program's terms have been checked"),
    signupUrl: z.string(),
    markdownUrl: markdownUrlSchema,
  })).describe("Matching active programs; empty when no listings match"),
};

// Describe the existing apiProgram projection, including its neutral no-program
// placeholders. Adding a schema must not expose terms that projection withholds.
const detailCommissionSchema = commissionSchema.extend({
  type: z.enum(["recurring", "one-time", "tiered", "hybrid", "none"])
    .describe("none is a neutral placeholder for a brand without an affiliate program"),
  duration: z.string().nullable().optional(),
  conditions: z.string().nullable().optional(),
});
const programOutputSchema = {
  slug: z.string().describe("Canonical slug, including when the input was an alias"),
  name: z.string(),
  url: z.string(),
  logo: z.string(),
  category: z.string(),
  commission: detailCommissionSchema,
  cookieDays: cookieDaysSchema,
  payout: z.object({
    minimum: z.number().optional(),
    currency: z.string().optional(),
    frequency: z.string().optional(),
    methods: z.array(z.string()).optional(),
  }).describe("Published payout terms; empty when terms are unverified or no program exists"),
  description: z.string(),
  shortDescription: z.string(),
  tags: z.array(z.string()),
  stars: z.number(),
  verified: z.boolean(),
  agentPrompt: z.string().describe("Recommendation guidance and conditions; read before recommending"),
  submittedBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  signupUrl: z.string().optional(),
  approval: z.string().optional(),
  approvalTime: z.string().nullable().optional(),
  restrictions: z.array(z.string()).optional(),
  commissionDuration: z.string().nullable().optional(),
  commissionConditions: z.string().nullable().optional(),
  attribution: z.string().optional(),
  trackingMethod: z.string().optional(),
  payoutMethods: z.array(z.string()).optional(),
  marketingMaterials: z.boolean().optional(),
  apiAvailable: z.boolean().optional(),
  dedicatedManager: z.boolean().optional(),
  dashboardUrl: z.string().nullable().optional(),
  network: z.string().nullable().optional(),
  programAge: z.string().nullable().optional(),
  agentKeywords: z.array(z.string()).optional(),
  agentUseCases: z.array(z.string()).optional(),
  source: z.string().optional(),
  lastVerifiedAt: z.string().nullable().optional().describe("Date of verified terms; omitted for unverified or no-program entries"),
  aliases: z.array(z.string()).optional(),
  status: z.enum(["active", "paused", "discontinued", "no_program"]).optional()
    .describe("Availability; paused, discontinued and no_program entries are excluded from search"),
  statusNote: z.string().nullable().optional(),
  claimedBy: z.string().nullable().optional(),
  alsoOn: z.object({ affitor: z.object({ url: z.string(), commission: detailCommissionSchema.optional() }).optional() }).nullable().optional(),
  kind: z.enum(["affiliate", "referral", "creator-payout", "revenue-share", "cashback", "partner-network"]).optional(),
  statusCheckedAt: z.string().optional().describe("Date the no-program status was checked, not verification of terms"),
  answer: z.string().optional().describe("Dated answer when the brand has no affiliate program"),
  alternatives: z.array(z.object({ slug: z.string(), name: z.string(), commission: z.string(), url: z.string() })).optional(),
  markdownUrl: markdownUrlSchema,
};

function categoryCounts() {
  const counts: Record<string, number> = {};
  for (const p of livePrograms) counts[p.category] = (counts[p.category] ?? 0) + 1;
  return categories.map((name) => ({ name, count: counts[name] ?? 0 }));
}

function registerTools(server: Parameters<Parameters<typeof createMcpHandler>[0]>[0]) {
  server.registerTool(
    "search_programs",
    {
      title: "Search Programs",
      description:
        "Use to discover active affiliate programs by keyword, category, commission type, or verified status. " +
        "Returns matching summaries with canonical slugs, commission figures, signup links, and citable markdownUrl fields. " +
        "Do not use to check a known brand's paused or no-program status; call get_program with its slug. " +
        "Call list_categories for category names, then get_program for recommendation guidance and restrictions before recommending a match.",
      annotations: READ_ONLY_ANNOTATIONS,
      outputSchema: searchOutputSchema,
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
      // Paused, discontinued and no_program entries stay reachable through get_program, which carries their status.
      let results = livePrograms;

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
        shortDescription: confirmedPitch(p, p.shortDescription),
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
        // Left out until the program's terms are verified, as in get_program.
        cookieDays: termsConfirmed(p) ? p.cookieDays : undefined,
        verified: p.verified,
        signupUrl: p.signupUrl ?? p.url,
        // Agents cite what they can fetch, and the markdown twin is the
        // citable form of this row. Hardcoded to production on purpose: this
        // is the URL a citation should point at, which is not the preview
        // deployment a client may happen to be talking to.
        markdownUrl: `https://openaffiliate.dev/programs/${p.slug}.md`,
      }));

      return {
        structuredContent: { programs: summaries },
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
        "Use with a known slug or alias to read full program details, status, agentPrompt recommendation guidance, restrictions, signup information, and a citable markdownUrl. " +
        "Also returns paused entries and dated answers with alternatives for discontinued or no_program brands. " +
        "Do not use for broad discovery; call search_programs first if the slug is unknown. " +
        "Read status and agentPrompt before recommending; if no entry exists, use search_programs to find a match.",
      annotations: READ_ONLY_ANNOTATIONS,
      outputSchema: programOutputSchema,
      inputSchema: {
        slug: z.string().describe("Program slug or alias (e.g. 'vercel')"),
      },
    },
    async ({ slug }) => {
      // Aliases (old names, spellings agents guess) resolve too; the result carries the canonical slug.
      const program = resolveProgram(slug);
      if (!program) {
        return {
          isError: true,
          content: [
            { type: "text" as const, text: `Program '${slug}' not found. Call search_programs to find a program and its canonical slug.` },
          ],
        };
      }
      const result = {
        ...apiProgram(program),
        markdownUrl: `https://openaffiliate.dev/programs/${program.slug}.md`,
      };
      return {
        structuredContent: result,
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
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
        "Use to browse category names and active program counts before filtering a search. " +
        "Returns all registry categories, including categories with zero active listings. " +
        "Do not use for program details or commission comparisons; call search_programs with a returned category, then get_program for individual terms.",
      annotations: READ_ONLY_ANNOTATIONS,
      outputSchema: { categories: categoryListSchema },
      inputSchema: {},
    },
    async () => {
      const result = categoryCounts();
      return {
        structuredContent: { categories: result },
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    }
  );

  server.registerResource(
    "categories",
    "openaffiliate://categories",
    {
      title: "OpenAffiliate Categories",
      description: "All registry category names and active program counts, identical to list_categories. Use a name with search_programs to discover programs.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(categoryCounts(), null, 2) }],
    })
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
      // mcp-handler 1.1 forwards serverInfo and the remaining options to
      // McpServer before connect, including icons and instructions.
      serverInfo: SERVER_INFO,
      instructions: INSTRUCTIONS,
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
