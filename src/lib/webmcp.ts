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

async function getJson(path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(path, { headers: { Accept: "application/json" }, signal })
  return response.json()
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
    execute({ q, category, type, verified, limit }, options) {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries({ q, category, type })) {
        if (typeof value === "string" && value) params.set(key, value)
      }
      if (verified === true) params.set("verified", "true")
      // The API reads limit 0 as "everything" (over a thousand programs); an agent gets a page.
      params.set("limit", String(Number.isInteger(limit) && (limit as number) > 0 ? limit : SEARCH_LIMIT))
      return getJson(`/api/programs?${params}`, options?.signal)
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
    execute({ slug }, options) {
      return getJson(`/api/programs/${encodeURIComponent(String(slug ?? ""))}`, options?.signal)
    },
  },
  {
    name: "list_categories",
    title: "List Categories",
    description: "List every registry category with its active program count, for use as search_programs category.",
    inputSchema: { type: "object", properties: {} },
    annotations,
    execute(_input, options) {
      return getJson("/api/categories", options?.signal)
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
