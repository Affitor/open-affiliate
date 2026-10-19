/**
 * WebMCP (https://github.com/webmachinelearning/webmcp): the MCP server's three
 * read-only tools, registered in the page so a browser agent can call them
 * without connecting to /mcp. Each one calls the same-origin REST API with its
 * canonical parameters (src/app/api/programs/route.ts, /openapi.json).
 */
type Input = Record<string, unknown>
export type WebMcpTool = {
  name: string
  title: string
  description: string
  inputSchema: object
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }
  execute: (input: Input, options?: { signal?: AbortSignal }) => Promise<unknown>
}
type ModelContext = { registerTool?: (tool: WebMcpTool, options: { signal: AbortSignal }) => unknown }

declare global {
  interface Document { modelContext?: ModelContext }
  interface Navigator { modelContext?: ModelContext }
}

/**
 * GETs a same-origin API path and resolves with its JSON (an API error body
 * included). Every failure resolves with the API's own error shape,
 * { error: { code, message, hint } } (openapi Error), instead of throwing, so an
 * agent always gets a readable result: bad input, a dropped connection, a
 * cancelled call, or a response that is not JSON.
 */
async function getJson(path: () => string, signal?: AbortSignal): Promise<unknown> {
  const failed = (code: string, message: string, hint: string) => ({
    error: signal?.aborted
      ? { code: "ABORTED", message: "The call was cancelled.", hint: "Call the tool again if you still need the result." }
      : { code, message, hint },
  })
  let url: string
  try {
    url = path()
  } catch {
    return failed("INVALID_INPUT", "The input could not be turned into a request.", "Pass an object matching the tool's inputSchema, e.g. a slug from search_programs.")
  }
  let response: Response
  try {
    response = await fetch(url, { method: "GET", headers: { Accept: "application/json" }, signal })
  } catch {
    return failed("NETWORK_ERROR", "Could not reach the OpenAffiliate API.", "Retry shortly; the same tools are served by the MCP server at /mcp.")
  }
  try {
    return await response.json()
  } catch {
    return failed("INVALID_RESPONSE", `The API answered HTTP ${response.status} without JSON.`, "Retry shortly; /openapi.json describes every response.")
  }
}

// Read-only, and program text is contributor-submitted: treat it as untrusted.
const annotations = { readOnlyHint: true, untrustedContentHint: true }
const SEARCH_LIMIT = 20

export const WEBMCP_TOOLS: WebMcpTool[] = [
  {
    name: "search_programs",
    title: "Search Programs",
    description: "Search active affiliate programs by keyword, category, commission type or verified status. Returns summaries with canonical slugs, commission, signup URL and verification status. Call get_program with a slug before recommending one.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Search keywords. Empty means all active programs." },
        category: { type: "string", description: "Exact category name from list_categories (case-sensitive)." },
        type: { type: "string", enum: ["recurring", "one-time", "tiered", "hybrid"], description: "Commission type." },
        verified: { type: "boolean", description: "true returns only programs whose terms were checked on the brand's own page." },
        limit: { type: "integer", minimum: 1, maximum: 500, default: SEARCH_LIMIT, description: "Maximum results." },
      },
    },
    annotations,
    execute(input, options) {
      return getJson(() => {
        const { q, category, type, verified, limit } = input
        const params = new URLSearchParams()
        for (const [key, value] of Object.entries({ q, category, type })) {
          if (typeof value === "string" && value) params.set(key, value)
        }
        if (verified === true) params.set("verified", "true")
        // The API reads limit 0 as "everything" (over a thousand programs); an agent gets a page.
        params.set("limit", String(Number.isInteger(limit) && (limit as number) > 0 ? limit : SEARCH_LIMIT))
        return `/api/programs?${params}`
      }, options?.signal)
    },
  },
  {
    name: "get_program",
    title: "Get Program",
    description: "Read one program by slug or alias: commission, cookie and payout terms, status, restrictions, signup URL and agentPrompt recommendation guidance. Read status and agentPrompt before recommending.",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string", description: "Slug from search_programs, or the last segment of a /programs/<slug> URL." } },
      required: ["slug"],
    },
    annotations,
    execute(input, options) {
      // encodeURIComponent throws on a lone surrogate; getJson turns that into INVALID_INPUT.
      return getJson(() => `/api/programs/${encodeURIComponent(String(input.slug ?? ""))}`, options?.signal)
    },
  },
  {
    name: "list_categories",
    title: "List Categories",
    description: "List every registry category with its active program count, for use as search_programs category.",
    inputSchema: { type: "object", properties: {} },
    annotations,
    execute(_input, options) {
      return getJson(() => "/api/categories", options?.signal)
    },
  },
]

/**
 * Registers the tools with document.modelContext; navigator.modelContext is only
 * a fallback for browsers that shipped the earlier name. Aborting the signal
 * unregisters them. Does nothing where WebMCP is unavailable, and never throws.
 */
export function registerWebMcpTools(signal: AbortSignal): void {
  try {
    for (const tool of WEBMCP_TOOLS) {
      try {
        const registered = typeof document.modelContext?.registerTool === "function"
          ? document.modelContext.registerTool(tool, { signal })
          : navigator.modelContext?.registerTool?.(tool, { signal })
        // registerTool returns a promise that rejects when the page may not register tools.
        Promise.resolve(registered).catch(() => {})
      } catch { /* one tool failing must not stop the others or the page */ }
    }
  } catch { /* no document or navigator */ }
}
