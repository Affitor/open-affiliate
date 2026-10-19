/** OpenAPI 3.1 describes the existing public, read-only REST surface. */
const string = { type: "string" }
const nullableString = { type: ["string", "null"] }
const strings = { type: "array", items: string }
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })
const object = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object", properties, required, additionalProperties: false,
})
const commission = object({
  type: { type: "string", enum: ["recurring", "one-time", "tiered", "hybrid", "none"] },
  rate: { type: ["string", "number"] },
  mode: { type: "string", enum: ["percentage", "flat", "tiered", "hybrid", "unknown"] },
  value: { type: ["number", "null"] }, currency: nullableString,
  duration: nullableString, conditions: nullableString,
}, ["type", "rate", "mode", "value", "currency"])
const response = (description: string, schema: unknown) => ({ description, content: { "application/json": { schema } } })
const parameter = (name: string, description: string, schema: unknown) => ({ name, in: "query", required: false, description, schema })

export const openapi = {
  openapi: "3.1.0",
  jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
  info: { title: "OpenAffiliate REST API", version: "1.0.0", description: "Search the public affiliate program registry and read program terms. No authentication or API key is required. No write operations are exposed." },
  servers: [{ url: "https://openaffiliate.dev" }],
  paths: {
    "/api/programs": {
      get: {
        operationId: "searchPrograms", summary: "Search affiliate programs",
        description: "Search active programs. Returns a programs array, total before pagination and applied filters. Unverified terms are omitted or empty. Nothing in the query is rejected, so older clients keep working: unknown parameters are ignored (tracking parameters are fine), a repeated parameter uses its first value, an unknown sort falls back to relevance (legacy sort=new means newest), a non-boolean verified does not filter, a malformed limit or offset counts as 0, and an unknown type or category simply matches nothing.",
        parameters: [
          parameter("q", "Search keywords. Empty means all active programs.", { type: "string", default: "" }),
          parameter("category", "Category name, matched exactly (case-sensitive). Unknown categories return an empty list.", string),
          parameter("type", "Filter by commission type.", { type: "string", enum: ["recurring", "one-time", "tiered", "hybrid"] }),
          parameter("verified", "true restricts results to verified entries; false or omission does not filter verification status.", { type: "boolean", default: false }),
          parameter("include_description", "Include description text in keyword matching (descriptions are always returned).", { type: "boolean", default: false }),
          parameter("sort", "Result order. relevance uses keyword relevance when q is present.", { type: "string", enum: ["relevance", "az", "za", "commission_desc", "newest"], default: "relevance" }),
          parameter("limit", "Maximum results, capped at 500. Zero or omission means all remaining results.", { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER, default: 0 }),
          parameter("offset", "Skip this many results before applying limit.", { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER, default: 0 }),
        ],
        responses: { "200": response("Matching active programs (possibly none).", ref("ProgramSearch")) },
      },
    },
    "/api/programs/{slug}": {
      get: {
        operationId: "getProgram", summary: "Get a program by slug",
        description: "Read a program, including paused entries and brands with no public program. Aliases resolve to the canonical slug in the 200 response. Unverified cookie, approval and payout terms are withheld. no_program and discontinued entries have neutral commission/payout placeholders, answer and alternatives rather than joinable terms.",
        parameters: [{ name: "slug", in: "path", required: true, description: "Canonical program slug or a registered alias.", schema: string }],
        responses: { "200": response("Program details or a no-program answer.", ref("Program")), "404": response("No program or alias matches the slug.", ref("Error")) },
      },
    },
    "/api/categories": {
      get: {
        operationId: "listCategories", summary: "List categories with counts",
        description: "Return every registry category and its active program count. Paused, discontinued and no_program entries do not count.",
        responses: { "200": response("Categories and total category count.", ref("CategoryList")) },
      },
    },
  },
  components: {
    schemas: {
      Commission: commission,
      Program: object({
        slug: string, name: string, url: string, logo: string, category: string,
        commission: ref("Commission"), cookieDays: { type: "integer", minimum: 0 },
        payout: object({ minimum: { type: "number" }, currency: string, frequency: string, methods: strings, conditions: string }),
        description: string, shortDescription: string, tags: strings, stars: { type: "number" }, verified: { type: "boolean" },
        agentPrompt: string, submittedBy: string, createdAt: string, updatedAt: string,
        signupUrl: string, approval: string, approvalTime: nullableString, restrictions: strings,
        commissionDuration: nullableString, commissionConditions: nullableString,
        attribution: string, trackingMethod: string, payoutMethods: strings,
        marketingMaterials: { type: "boolean" }, apiAvailable: { type: "boolean" }, dedicatedManager: { type: "boolean" },
        dashboardUrl: nullableString, network: nullableString, programAge: nullableString,
        agentKeywords: strings, agentUseCases: strings, source: string, lastVerifiedAt: nullableString, aliases: strings,
        status: { type: "string", enum: ["active", "paused", "discontinued", "no_program"] },
        statusNote: nullableString, claimedBy: nullableString,
        alsoOn: { type: ["object", "null"], properties: { affitor: object({ url: string, commission: ref("Commission") }, ["url"]) }, additionalProperties: false },
        kind: { type: "string", enum: ["affiliate", "referral", "creator-payout", "revenue-share", "cashback", "partner-network"] },
        statusCheckedAt: string, answer: string,
        alternatives: { type: "array", items: object({ slug: string, name: string, commission: string, url: string }, ["slug", "name", "commission", "url"]) },
      }, ["slug", "name", "url", "logo", "category", "commission", "payout", "description", "shortDescription", "tags", "stars", "verified", "agentPrompt", "submittedBy", "createdAt"]),
      ProgramSearch: object({
        programs: { type: "array", items: ref("Program") }, total: { type: "integer", minimum: 0 },
        filters: object({ q: nullableString, category: nullableString, type: nullableString, sort: string }, ["q", "category", "type", "sort"]),
      }, ["programs", "total", "filters"]),
      CategoryList: object({ categories: { type: "array", items: object({ name: string, count: { type: "integer", minimum: 0 } }, ["name", "count"]) }, total: { type: "integer", minimum: 0 } }, ["categories", "total"]),
      Error: object({ error: object({ code: string, message: string, hint: string }, ["code", "message", "hint"]) }, ["error"]),
    },
  },
}
