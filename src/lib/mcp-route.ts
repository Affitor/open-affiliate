import { createMcpHandler } from "mcp-handler";
import type { Implementation } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { livePrograms, categories, confirmedPitch, termsConfirmed } from "@/lib/programs";
import { resolveProgram } from "@/lib/program-aliases";
import { apiProgram } from "@/lib/no-program";
import { liveSubmissionDeps } from "@/lib/submissions/live";
import {
  clientIp,
  disabledAnswer,
  logFailure,
  readInput,
  serverError,
  status as submissionStatus,
  submit,
  type Answer,
  type SubmissionDeps,
} from "@/lib/submissions/service";

/**
 * The hosted MCP server, as route handlers.
 *
 * Two paths serve the same tools:
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
  description: "Discover affiliate programs in a public registry with commission terms, signup links, and recommendation guidance; submit a missing program for verification.",
  version: "0.1.3",
  websiteUrl: "https://openaffiliate.dev",
  icons: [{ src: "https://openaffiliate.dev/favicon.svg", mimeType: "image/svg+xml", sizes: ["any"] }],
};

const INSTRUCTIONS =
  "OpenAffiliate is a public affiliate program registry; no API key or account is required. Every tool is read-only except submit_program, which only queues a program for a maintainer to verify. " +
  "Read commission.mode and commission.value for the figure and its units (percentage or flat currency amount); commission.rate preserves the raw source wording, and unknown mode means no figure is published. " +
  "cookieDays is omitted until the program's terms are verified. " +
  "Use search_programs for active listings and get_program for full details, including paused, discontinued, or no_program entries; check status and agentPrompt before recommending. " +
  "Cite the returned markdownUrl when referencing a program. " +
  "If a program is missing, call submit_program with the brand's own program page, then get_submission_status with the returned id; nothing is listed or scored until its terms are verified.";

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const commissionSchema = z.object({
  type: z.enum(["recurring", "one-time", "tiered", "hybrid"])
    .describe("Payment structure: recurring pays on renewals within the commission duration; one-time pays once per qualifying referral; tiered varies by performance level; hybrid combines payment structures"),
  mode: z.enum(["percentage", "flat", "tiered", "hybrid", "unknown"])
    .describe("Figure format: percentage uses percent units, flat uses currency units, tiered and hybrid require rate/conditions to interpret; unknown means no published figure"),
  value: z.number().nullable().describe("Commission in percent units for percentage mode (30 means 30%), or currency units for flat mode; null when no single numeric figure is available"),
  rate: z.union([z.string(), z.number()]).describe("Raw source wording; prefer mode and value"),
  currency: z.string().nullable().describe("Currency code for monetary amounts; null when unspecified"),
}).describe("Commission structure and figures; unverified terms are unconfirmed, not guaranteed earnings");

const markdownUrlSchema = z.string().describe("Citable program page in Markdown on openaffiliate.dev");
const cookieDaysSchema = z.number().describe("Attribution window in days; omitted until terms are verified").optional();
const categoryListSchema = z.array(z.object({
  name: z.string().describe("Category name accepted by search_programs"),
  count: z.number().int().nonnegative().describe("Number of active listings in this category"),
})).describe("All registry categories and their active program counts, including zero counts");

const searchOutputSchema = {
  programs: z.array(z.object({
    slug: z.string().describe("Canonical slug to pass to get_program"),
    name: z.string().describe("Display name of the program or brand"),
    category: z.string().describe("Exact registry category name, as returned by list_categories"),
    shortDescription: z.string().describe("Brief product summary; unverified cookie, payout and approval claims are withheld"),
    commission: commissionSchema,
    cookieDays: cookieDaysSchema,
    verified: z.boolean().describe("True when the terms have been checked on the brand's own program page; false means unconfirmed"),
    signupUrl: z.string().describe("Affiliate signup or program URL; falls back to the brand website when no signup URL is stored"),
    markdownUrl: markdownUrlSchema,
  })).describe("Matching active programs; empty when no listings match"),
};

// Describe the existing apiProgram projection, including its neutral no-program
// placeholders. Adding a schema must not expose terms that projection withholds.
const detailCommissionSchema = commissionSchema.extend({
  type: z.enum(["recurring", "one-time", "tiered", "hybrid", "none"])
    .describe("Payment structure: recurring pays on renewals within duration; one-time pays once per qualifying referral; tiered varies by performance level; hybrid combines structures; none is a neutral placeholder for discontinued/no_program entries"),
  duration: z.string().nullable().optional().describe("How long commissions are earned, as source text such as '12 months' or 'lifetime'; null or omitted when unspecified"),
  conditions: z.string().nullable().optional().describe("Conditions for earning commission; unverified cookie, payout and approval claims are withheld; null or omitted when unavailable"),
}).describe("Commission structure, figures and earning conditions; unverified terms are unconfirmed, while discontinued/no_program entries return neutral placeholders");
const programOutputSchema = {
  slug: z.string().describe("Canonical slug, including when the input was an alias"),
  name: z.string().describe("Display name of the program or brand"),
  url: z.string().describe("Brand's product or website URL"),
  logo: z.string().describe("Text logo placeholder: the uppercase first character of the brand name, not an image URL"),
  category: z.string().describe("Exact registry category name, as returned by list_categories"),
  commission: detailCommissionSchema,
  cookieDays: cookieDaysSchema,
  payout: z.object({
    minimum: z.number().optional().describe("Minimum payout in payout.currency units; omitted when unspecified or terms are withheld"),
    currency: z.string().optional().describe("Currency code for payout.minimum; omitted when unspecified or terms are withheld"),
    frequency: z.string().optional().describe("Payout schedule, such as monthly or net-30; omitted when unspecified or terms are withheld"),
    methods: z.array(z.string()).optional().describe("Payout methods, such as paypal or bank-transfer; empty when none are stored, omitted when terms are withheld"),
    conditions: z.string().optional().describe("When a commission becomes payable, in the terms' own words (hold period, payout cycle, withdrawal rule); omitted when unspecified or terms are withheld"),
  }).describe("Published payout terms; empty when terms are unverified or no program exists"),
  description: z.string().describe("Full product and program description; unverified cookie, payout and approval claims are withheld"),
  shortDescription: z.string().describe("Brief product summary; unverified cookie, payout and approval claims are withheld"),
  tags: z.array(z.string()).describe("Searchable product and program tags; empty when none are stored"),
  stars: z.number().describe("Legacy star-count placeholder, currently always 0; not a program quality score"),
  verified: z.boolean().describe("True when the terms have been checked on the brand's own program page; false means unconfirmed"),
  agentPrompt: z.string().describe("Recommendation guidance and conditions; read before recommending"),
  submittedBy: z.string().describe("Registry submitter identifier; defaults to community"),
  createdAt: z.string().describe("Registry entry creation date in YYYY-MM-DD form; empty when unspecified"),
  updatedAt: z.string().optional().describe("Registry entry update date in YYYY-MM-DD form; omitted when unspecified"),
  signupUrl: z.string().optional().describe("Affiliate signup or program URL; omitted when not stored or status is discontinued/no_program"),
  approval: z.string().optional().describe("Application approval process: auto, manual or invite-only; omitted when unverified, unspecified or discontinued/no_program"),
  approvalTime: z.string().nullable().optional().describe("Expected application review time as source text; null when unspecified, omitted when unverified or discontinued/no_program"),
  restrictions: z.array(z.string()).optional().describe("Program rules and prohibited promotion methods; unverified term claims are withheld; empty when none remain, omitted for discontinued/no_program"),
  commissionDuration: z.string().nullable().optional().describe("Same duration text as commission.duration; null when unspecified, omitted for discontinued/no_program"),
  commissionConditions: z.string().nullable().optional().describe("Same earning conditions as commission.conditions; null when unavailable, omitted for discontinued/no_program"),
  attribution: z.string().optional().describe("Referral attribution model, such as last-click; omitted when unspecified or discontinued/no_program"),
  trackingMethod: z.string().optional().describe("How referrals are tracked, such as cookie, link or coupon; omitted when unspecified or discontinued/no_program"),
  payoutMethods: z.array(z.string()).optional().describe("Same methods as payout.methods; empty when none are stored, omitted when unverified or discontinued/no_program"),
  marketingMaterials: z.boolean().optional().describe("Whether promotional assets are provided; omitted when unspecified or discontinued/no_program, not an implied false"),
  apiAvailable: z.boolean().optional().describe("Whether an affiliate API is available; omitted when unspecified or discontinued/no_program, not an implied false"),
  dedicatedManager: z.boolean().optional().describe("Whether a dedicated affiliate manager is provided; omitted when unspecified or discontinued/no_program, not an implied false"),
  dashboardUrl: z.string().nullable().optional().describe("Affiliate dashboard URL; null when unspecified, omitted for discontinued/no_program"),
  network: z.string().nullable().optional().describe("Affiliate network identifier, such as partnerstack or in-house; null when unknown, omitted for discontinued/no_program"),
  programAge: z.string().nullable().optional().describe("How long the program has existed, as source text without a fixed unit; null when unspecified, omitted for discontinued/no_program"),
  agentKeywords: z.array(z.string()).optional().describe("Semantic keywords for matching user needs; empty when none are stored"),
  agentUseCases: z.array(z.string()).optional().describe("Recommendation scenarios; unverified term claims are withheld; empty when none remain"),
  source: z.string().optional().describe("Registry source identifier or URL; omitted when unspecified"),
  lastVerifiedAt: z.string().nullable().optional().describe("Date terms were checked, in YYYY-MM-DD form; null when unspecified, omitted for unverified or discontinued/no_program entries"),
  aliases: z.array(z.string()).optional().describe("Alternative slugs accepted by get_program; empty when none are stored"),
  status: z.enum(["active", "paused", "discontinued", "no_program"]).optional()
    .describe("Availability: active is listed in search; paused is temporarily unavailable; discontinued means closed; no_program means no public program found. Non-active entries are excluded from search; missing status defaults to active"),
  statusNote: z.string().nullable().optional().describe("Explanation and source for the program's status; null when unspecified"),
  claimedBy: z.string().nullable().optional().describe("Verified owner domain that claimed the listing, never an email address; null when unclaimed"),
  alsoOn: z.object({
    affitor: z.object({
      url: z.string().describe("URL of the same brand's Affitor marketplace program"),
      commission: detailCommissionSchema.optional().describe("Commission published on Affitor, separate from this listing's terms; omitted when Affitor publishes none"),
    }).optional().describe("The same brand on the Affitor marketplace; omitted when no Affitor entry is stored"),
  }).nullable().optional().describe("Additional marketplace listings; null when none are stored, omitted for discontinued/no_program"),
  oas: z.object({
    score: z.number().nullable().describe("OAS 0-100 as the program page shows it; null while scoring is in progress or the verified terms are older than 90 days"),
    grade: z.string().nullable().describe("Letter grade for the score (A+ to F); null when score is null"),
    status: z.enum(["scored", "stale", "in_progress"]).describe("scored: a current score; stale: terms verified more than 90 days ago; in_progress: some terms not read yet"),
    summary: z.string().describe("One line: the verdict when scored, otherwise why there is no score"),
    checkedAt: z.string().nullable().describe("Date the scored terms were verified, YYYY-MM-DD"),
    validUntil: z.string().nullable().describe("First day the score lapses unless the terms are verified again (90 days after checkedAt), YYYY-MM-DD"),
    version: z.string().describe("Scoring method version, such as v1"),
    reportUrl: z.string().describe("The program's full OAS report"),
  }).optional().describe("OAS, the OpenAffiliate Score: how clearly the program publishes its terms and protects its partners. Omitted when the program is not scored or OAS is not published"),
  oasMachineChecks: z.array(z.object({
    id: z.enum(["A1", "P5", "P6"]).describe("A1 program page is live; P5 Core Web Vitals (mobile); P6 estimated monthly brand-query search volume (Google Ads, worldwide)"),
    label: z.string().describe("The check's name as the report shows it"),
    met: z.boolean().describe("True when the check is met"),
    reading: z.string().describe("What was measured, in words, naming its data and thresholds"),
    source: z.enum(["http", "pagespeed", "dataforseo"]).describe("Where the reading comes from"),
    target: z.string().describe("What was measured: the listed program URL (A1), the brand URL (P5) or the exact search query (P6)"),
    measurement: z.union([
      z.object({ status: z.literal(200).describe("HTTP status of the listed program page") }),
      z.object({ data: z.literal("field").describe("Real-user data (Chrome UX Report)"), notGood: z.array(z.string()).describe("Core Web Vitals not in the good range; empty when all are") }),
      z.object({ data: z.literal("lab").describe("Lab test, no real-user data"), lcpMs: z.number().describe("Largest Contentful Paint, ms"), cls: z.number().describe("Cumulative Layout Shift"), tbtMs: z.number().describe("Total Blocking Time, ms, standing in for INP") }),
      z.object({ scope: z.literal("worldwide").describe("Search volume scope"), threshold: z.number().describe("Monthly searches the check requires"), reached: z.boolean().describe("Whether the estimate reaches the threshold") }),
    ]).describe("The typed measurement behind the reading"),
    ruleset: z.string().describe("The rule set that produced the reading"),
    measuredAt: z.string().describe("Measurement date, YYYY-MM-DD"),
    validUntil: z.string().describe("First day the reading lapses (90 days after measuredAt), YYYY-MM-DD"),
  })).optional().describe("Machine checks shown on the OAS report, not counted in OAS; omitted when there are none to show"),
  kind: z.enum(["affiliate", "referral", "creator-payout", "revenue-share", "cashback", "partner-network"]).optional()
    .describe("Income program model: affiliate commissions, customer referrals, creator payouts, revenue sharing, cashback or a partner network; omitted when unspecified or discontinued/no_program"),
  statusCheckedAt: z.string().optional().describe("YYYY-MM-DD date the discontinued/no_program status was checked, not verification of terms; omitted for other statuses or when no check date is stored"),
  answer: z.string().optional().describe("Answer explaining the lack of an affiliate program, dated when a check date exists; only returned for discontinued/no_program"),
  alternatives: z.array(z.object({
    slug: z.string().describe("Canonical alternative slug to pass to get_program"),
    name: z.string().describe("Alternative program's display name"),
    commission: z.string().describe("Formatted commission figure and payment structure for display; includes percent or currency units when known"),
    url: z.string().describe("Alternative program's page URL on openaffiliate.dev"),
  })).optional().describe("Verified, active cash-paying alternatives in the same category; only returned for discontinued/no_program, empty when none match"),
  markdownUrl: markdownUrlSchema,
};

const SUBMIT_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  // The same domain while it is queued returns the same submission.
  idempotentHint: true,
  openWorldHint: false,
};

const submissionStatusSchema = z.enum(["queued", "verifying", "listed", "rejected"])
  .describe("queued: waiting for a maintainer; verifying: terms being checked on the brand's own page; listed: on OpenAffiliate; rejected: see reason");
const submissionOutputSchema = {
  id: z.string().optional().describe("Submission id for get_submission_status; omitted when the domain is already listed"),
  status: submissionStatusSchema,
  statusUrl: z.string().optional().describe("REST URL that returns this submission's status"),
  duplicate: z.boolean().optional().describe("True when this domain was already in the queue; the existing submission is returned"),
  listingUrl: z.string().optional().describe("The program's page on openaffiliate.dev when it is listed"),
  reportUrl: z.string().optional().describe("The program's OAS report when it is scored"),
  reason: z.string().optional().describe("Why a submission was rejected, in one sentence"),
  createdAt: z.string().optional().describe("When the submission was made, ISO 8601"),
  updatedAt: z.string().optional().describe("When its status last changed, ISO 8601"),
};

const SUBMIT_ORIGINS: ReadonlySet<string> = new Set(["https://openaffiliate.dev", "https://www.openaffiliate.dev"]);
const crossOriginAnswer = (): Answer => ({
  status: 403,
  body: { error: "cross_origin", message: "submit_program cannot be called from a web page on another site. Use https://openaffiliate.dev/submit." },
  headers: {},
});

/** An Answer as a tool result: a refusal is an error the agent reads, a result is structured content. */
function toolResult(a: Answer) {
  const text = JSON.stringify(a.body, null, 2);
  if (a.status >= 400) {
    const retry = a.headers["Retry-After"];
    return {
      isError: true,
      content: [{ type: "text" as const, text: retry ? `${text}\nRetry after ${retry} seconds, or submit at https://openaffiliate.dev/submit` : text }],
    };
  }
  return { structuredContent: a.body, content: [{ type: "text" as const, text }] };
}

function headersOf(raw: Record<string, string | string[] | undefined> | undefined): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  return headers;
}

function categoryCounts() {
  const counts: Record<string, number> = {};
  for (const p of livePrograms) counts[p.category] = (counts[p.category] ?? 0) + 1;
  return categories.map((name) => ({ name, count: counts[name] ?? 0 }));
}

function registerTools(server: Parameters<Parameters<typeof createMcpHandler>[0]>[0], submissions: () => SubmissionDeps | null) {
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
          .describe("Filter by exact category name as returned by list_categories (case-sensitive, not a slug), e.g. 'AI', 'Email Marketing'"),
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
        slug: z.string().describe("Use the slug from search_programs results or the final segment of a program URL (e.g. /programs/vercel). Aliases resolve to the canonical program"),
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

  server.registerTool(
    "submit_program",
    {
      title: "Submit Program",
      description:
        "Use when get_program and search_programs do not find a brand's affiliate program: queues the brand's own program page for a maintainer to verify against the brand's published terms. " +
        "Not instant: nothing is listed and no score exists until the terms are verified. A domain already listed returns its listingUrl instead; a domain already queued returns the existing submission. " +
        "Send the brand's own program or partners page, never a network or review site. Never invent terms. Then call get_submission_status with the returned id.",
      annotations: SUBMIT_ANNOTATIONS,
      outputSchema: submissionOutputSchema,
      // Strict at registration: the SDK strips unknown keys before the
      // callback sees them, so a typo like contactEmail would vanish silently.
      inputSchema: z.object({
        programUrl: z.string().describe("https:// link to the affiliate or partner program page on the brand's own website"),
        termsUrl: z.string().optional().describe("https:// link to the page that states the program's terms, when it is a different page"),
        name: z.string().optional().describe("Brand or program name, up to 100 characters"),
        contact: z.string().optional().describe("Optional email for the person submitting; never shown publicly and never returned by any tool"),
        note: z.string().optional().describe("Optional note for the maintainer, up to 1000 characters"),
      }).strict(),
    },
    async (args, extra) => {
      const deps = submissions();
      if (!deps) return toolResult(disabledAnswer());
      const headers = headersOf(extra.requestInfo?.headers);
      // This endpoint answers any origin (CORS *) for the read tools. A write
      // from a web page would let any site submit from its visitors'
      // addresses, so a browser Origin other than ours is refused. Agents and
      // desktop clients send no Origin.
      const origin = headers.get("origin");
      if (origin !== null && !SUBMIT_ORIGINS.has(origin)) return toolResult(crossOriginAnswer());
      const input = readInput(args);
      if ("status" in input && "body" in input) return toolResult(input);
      try {
        const ip = clientIp(headers);
        return toolResult(await submit(input, { ip, source: "mcp", statusBase: "https://openaffiliate.dev" }, deps));
      } catch (err) {
        logFailure("mcp-submit", err);
        return toolResult(serverError());
      }
    }
  );

  server.registerTool(
    "get_submission_status",
    {
      title: "Get Submission Status",
      description:
        "Use with an id from submit_program to read where a submitted program is: queued, verifying, listed (with listingUrl and, once scored, reportUrl) or rejected (with reason). " +
        "Do not use to look up listed programs; call get_program for those.",
      annotations: READ_ONLY_ANNOTATIONS,
      outputSchema: submissionOutputSchema,
      inputSchema: z.object({
        id: z.string().describe("The id submit_program returned"),
      }).strict(),
    },
    async ({ id }) => {
      const deps = submissions();
      if (!deps) return toolResult(disabledAnswer());
      try {
        return toolResult(await submissionStatus(id, deps));
      } catch (err) {
        logFailure("mcp-status", err);
        return toolResult(serverError());
      }
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
export function createMcpRoute(basePath: string, submissions: () => SubmissionDeps | null = liveSubmissionDeps) {
  const handler = createMcpHandler(
    (server) => registerTools(server, submissions),
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
