/** OpenAPI 3.1 describes the public REST surface: registry reads, plus the one write that queues a submission. */
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
// Every response of the REST API carries API-Version, and Deprecation and Sunset
// once what it serves is deprecated (see info.description).
const headers = {
  "API-Version": { $ref: "#/components/headers/APIVersion" },
  Deprecation: { $ref: "#/components/headers/Deprecation" },
  Sunset: { $ref: "#/components/headers/Sunset" },
}
const response = (description: string, schema: unknown) => ({ description, headers, content: { "application/json": { schema } } })
const parameter = (name: string, description: string, schema: unknown) => ({ name, in: "query", required: false, description, schema })
// Header versioning: every operation accepts API-Version and refuses a version it does not serve.
const apiVersion = {
  name: "API-Version", in: "header", required: false,
  description: "Pin the API major version. Omitted means the current version, 1. Any other value returns 400 UNSUPPORTED_API_VERSION.",
  schema: { type: "string", enum: ["1"], default: "1" },
}
const unsupportedVersion = response("API-Version names a version this API does not serve.", ref("Error"))
// The submission routes answer refusals as { error, message, field? } (the claim flow's shape).
const submissionRefusal = (description: string) => response(description, ref("SubmissionError"))
const rateLimitHeaders = {
  ...headers,
  "Retry-After": { description: "Seconds until the window that refused the request ends.", schema: { type: "integer", minimum: 0 } },
  "RateLimit-Limit": { description: "Requests allowed in that window.", schema: { type: "integer", minimum: 0 } },
  "RateLimit-Remaining": { description: "Requests left in that window (0 on a 429).", schema: { type: "integer", minimum: 0 } },
  "RateLimit-Reset": { description: "Seconds until that window ends.", schema: { type: "integer", minimum: 0 } },
}

export const openapi = {
  openapi: "3.1.0",
  jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
  info: { title: "OpenAffiliate REST API", version: "1.0.0", description: "Search the public affiliate program registry and read program terms. No authentication or API key is required. The only write is POST /api/submissions, which queues a program for a maintainer to verify; it never lists or scores anything by itself. " +
    "Versioning: every response carries an API-Version header, currently 1, and a request may send API-Version: 1 to pin it (any other value returns 400 UNSUPPORTED_API_VERSION). Breaking changes ship only under a new major version; additive changes (new fields, parameters or endpoints) can arrive in the current one. " +
    "Deprecation: a field, parameter or endpoint is deprecated at least 90 days before it is removed. Its responses then carry a Deprecation header (RFC 9745) with the date it was deprecated and a Sunset header (RFC 8594) with the date it stops working, and the change is listed in the changelog at https://openaffiliate.dev/changelog." },
  servers: [{ url: "https://openaffiliate.dev" }],
  paths: {
    "/api/programs": {
      get: {
        operationId: "searchPrograms", summary: "Search affiliate programs",
        description: "Search active programs. Returns a programs array, total before pagination and applied filters. Unverified terms are omitted or empty. Nothing in the query is rejected, so older clients keep working: unknown parameters are ignored (tracking parameters are fine), a repeated parameter uses its first value, an unknown sort falls back to relevance (legacy sort=new means newest), a non-boolean verified does not filter, limit and offset are read as a leading integer (so 1x reads as 1; text with no leading digits or a negative offset counts as 0), and an unknown type or category simply matches nothing.",
        parameters: [
          apiVersion,
          parameter("q", "Search keywords. Empty means all active programs.", { type: "string", default: "" }),
          parameter("category", "Category name, matched exactly (case-sensitive). Unknown categories return an empty list.", string),
          parameter("type", "Filter by commission type.", { type: "string", enum: ["recurring", "one-time", "tiered", "hybrid"] }),
          parameter("verified", "true restricts results to verified entries; false or omission does not filter verification status.", { type: "boolean", default: false }),
          parameter("include_description", "Include description text in keyword matching (descriptions are always returned).", { type: "boolean", default: false }),
          parameter("sort", "Result order. relevance puts name matches first when q is present, then orders by OAS (programs not scored yet after, by commission).", { type: "string", enum: ["relevance", "az", "za", "commission_desc", "newest"], default: "relevance" }),
          parameter("limit", "Maximum results, capped at 500. Zero or omission means all remaining results.", { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER, default: 0 }),
          parameter("offset", "Skip this many results before applying limit.", { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER, default: 0 }),
        ],
        responses: { "200": response("Matching active programs (possibly none).", ref("ProgramSearch")), "400": unsupportedVersion },
      },
    },
    "/api/programs/{slug}": {
      get: {
        operationId: "getProgram", summary: "Get a program by slug",
        description: "Read a program, including paused entries and brands with no public program. Aliases resolve to the canonical slug in the 200 response. Unverified cookie, approval and payout terms are withheld. no_program and discontinued entries have neutral commission/payout placeholders, answer and alternatives rather than joinable terms.",
        parameters: [{ name: "slug", in: "path", required: true, description: "Canonical program slug or a registered alias.", schema: string }, apiVersion],
        responses: { "200": response("Program details or a no-program answer.", ref("Program")), "400": unsupportedVersion, "404": response("No program or alias matches the slug.", ref("Error")) },
      },
    },
    "/api/submissions": {
      post: {
        operationId: "submitProgram", summary: "Submit a missing program for verification",
        description: "Queue the brand's own affiliate program page for a maintainer to verify against the brand's published terms. Not instant: nothing is listed and no score exists until the terms are verified. Look the program up first (GET /api/programs?q= or /api/programs/{slug}). A domain already listed answers 200 with listingUrl; a domain already in the queue answers 200 with that submission (duplicate: true). The submitted URL is never fetched at submit time. The contact email is optional, never shown and never returned. Rate limited per address, per domain and site-wide; a 429 carries Retry-After.",
        parameters: [apiVersion],
        requestBody: { required: true, content: { "application/json": { schema: ref("SubmissionRequest") } } },
        responses: {
          "202": { ...response("Queued.", ref("SubmissionAccepted")), headers: rateLimitHeaders },
          "200": { ...response("Already listed, or already in the queue.", ref("SubmissionAccepted")), headers: rateLimitHeaders },
          "400": response("A field is invalid (SubmissionError, field names it), or API-Version is unsupported (Error).", { oneOf: [ref("SubmissionError"), ref("Error")] }),
          "403": submissionRefusal("A Turnstile token was sent and did not pass."),
          "413": submissionRefusal("The body is larger than 8 KB."),
          "415": submissionRefusal("The body is not application/json."),
          "429": { ...submissionRefusal("Rate limited."), headers: rateLimitHeaders },
          "503": submissionRefusal("Submissions are not enabled on this deployment."),
        },
      },
    },
    "/api/submissions/{id}": {
      get: {
        operationId: "getSubmission", summary: "Read a submission's status",
        description: "Status of a submission by the id POST /api/submissions returned: queued, verifying, listed (with listingUrl, and reportUrl once scored) or rejected (with a one-sentence reason). Never returns the contact, the submitted URL or the note.",
        parameters: [{ name: "id", in: "path", required: true, description: "Submission id (a UUID).", schema: { type: "string", format: "uuid" } }, apiVersion],
        responses: {
          "200": response("The submission's status.", ref("Submission")),
          "400": unsupportedVersion,
          "404": submissionRefusal("No submission has this id."),
          "429": { ...submissionRefusal("Too many reads from this address; retry after a minute."), headers: rateLimitHeaders },
          "503": submissionRefusal("Submissions are not enabled on this deployment."),
        },
      },
    },
    "/api/categories": {
      get: {
        operationId: "listCategories", summary: "List categories with counts",
        description: "Return every registry category and its active program count. Paused, discontinued and no_program entries do not count.",
        parameters: [apiVersion],
        responses: { "200": response("Categories and total category count.", ref("CategoryList")), "400": unsupportedVersion },
      },
    },
  },
  components: {
    headers: {
      APIVersion: { description: "Major version of this API. Breaking changes ship only under a new value.", schema: { type: "string", const: "1" } },
      Deprecation: {
        description: "RFC 9745. Sent only once the endpoint, or a parameter or field it serves, is deprecated: the deprecation date as a structured-field Date (e.g. @1767225600). Sent at least 90 days before Sunset. Nothing is deprecated today.",
        schema: { type: "string", pattern: "^@-?[0-9]+$" },
      },
      Sunset: {
        description: "RFC 8594. Sent with Deprecation: the HTTP-date after which the deprecated endpoint, parameter or field stops working (e.g. Thu, 01 Apr 2027 00:00:00 GMT).",
        schema: { type: "string" },
      },
    },
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
        oas: object({
          score: { type: ["number", "null"] }, grade: nullableString,
          status: { type: "string", enum: ["scored", "stale", "in_progress"] },
          summary: string, checkedAt: nullableString, validUntil: nullableString, version: string, reportUrl: string,
        }, ["score", "grade", "status", "summary", "checkedAt", "validUntil", "version", "reportUrl"]),
        oasMachineChecks: { type: "array", items: object({
          id: { type: "string", enum: ["A1", "P5", "P6"] }, label: string, met: { type: "boolean" }, reading: string,
          source: { type: "string", enum: ["http", "pagespeed", "dataforseo"] }, target: string,
          measurement: { oneOf: [
            object({ status: { type: "integer", const: 200 } }, ["status"]),
            object({ data: { type: "string", const: "field" }, notGood: strings }, ["data", "notGood"]),
            object({ data: { type: "string", const: "lab" }, lcpMs: { type: "number" }, cls: { type: "number" }, tbtMs: { type: "number" } }, ["data", "lcpMs", "cls", "tbtMs"]),
            object({ scope: { type: "string", const: "worldwide" }, threshold: { type: "integer" }, reached: { type: "boolean" } }, ["scope", "threshold", "reached"]),
          ] },
          ruleset: string, measuredAt: string, validUntil: string,
        }, ["id", "label", "met", "reading", "source", "target", "measurement", "ruleset", "measuredAt", "validUntil"]) },
        alternatives: { type: "array", items: object({ slug: string, name: string, commission: string, url: string }, ["slug", "name", "commission", "url"]) },
      }, ["slug", "name", "url", "logo", "category", "commission", "payout", "description", "shortDescription", "tags", "stars", "verified", "agentPrompt", "submittedBy", "createdAt"]),
      ProgramSearch: object({
        programs: { type: "array", items: ref("Program") }, total: { type: "integer", minimum: 0 },
        filters: object({ q: nullableString, category: nullableString, type: nullableString, sort: string }, ["q", "category", "type", "sort"]),
      }, ["programs", "total", "filters"]),
      CategoryList: object({ categories: { type: "array", items: object({ name: string, count: { type: "integer", minimum: 0 } }, ["name", "count"]) }, total: { type: "integer", minimum: 0 } }, ["categories", "total"]),
      SubmissionRequest: object({
        programUrl: { type: "string", maxLength: 500, description: "https:// link to the program page on the brand's own website." },
        termsUrl: { type: "string", maxLength: 500, description: "https:// link to the page that states the terms, when different." },
        name: { type: "string", maxLength: 100 },
        contact: { type: "string", maxLength: 320, description: "Optional email; never shown, never returned, cleared 30 days after the submission is decided." },
        note: { type: "string", maxLength: 1000 },
        turnstileToken: { type: "string", description: "Sent by the openaffiliate.dev form only; API callers leave it out." },
      }, ["programUrl"]),
      SubmissionAccepted: object({
        id: { type: "string", format: "uuid" },
        status: { type: "string", enum: ["queued", "verifying", "listed"] },
        statusUrl: string, duplicate: { type: "boolean" }, listingUrl: string, reportUrl: string,
      }, ["status"]),
      Submission: object({
        id: { type: "string", format: "uuid" },
        status: { type: "string", enum: ["queued", "verifying", "listed", "rejected"] },
        reason: string, listingUrl: string, reportUrl: string, createdAt: string, updatedAt: string,
      }, ["id", "status", "createdAt", "updatedAt"]),
      SubmissionError: object({ error: string, message: string, field: string }, ["error", "message"]),
      Error: object({ error: object({ code: string, message: string, hint: string }, ["code", "message", "hint"]) }, ["error"]),
    },
  },
}

type Operation = { operationId: string; summary: string; description: string; parameters: { name: string; in: string; schema: { enum?: string[] } }[]; responses: Record<string, { headers?: Record<string, unknown> }> }

/** Every operation in the document, with its path and method. */
export function operations(): { path: string; method: string; op: Operation }[] {
  return Object.entries(openapi.paths).flatMap(([path, item]) =>
    Object.entries(item as Record<string, Operation>).map(([method, op]) => ({ path, method, op })))
}
