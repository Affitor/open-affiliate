import { createHmac } from "node:crypto"
import { parse } from "tldts"
import { z } from "zod"
import { normalizeEmail, TURNSTILE_HOSTNAMES } from "@/lib/claims/rules"
import { HIDDEN_CHARACTER, pageKey, proseField, textField, type TurnstileResult } from "@/lib/claims/service"

/**
 * Program submissions: anyone submits a program by URL and later reads its
 * status. A submission only joins a queue a person works through (the data
 * lane, scripts/submissions.ts). Nothing here writes YAML, fetches the
 * submitted URL, publishes a score or sends email.
 *
 * Routes: src/app/api/submissions/. MCP: submit_program and
 * get_submission_status in src/lib/mcp-route.ts. Table and the two locked
 * functions: supabase/migrations/014_program_submissions.sql.
 */

export type SubmissionStatus = "queued" | "verifying" | "listed" | "rejected"
/** "web" means Turnstile passed on our own site; "api" and "mcp" get the stricter limits. */
export type SubmissionSource = "web" | "api" | "mcp"

/** Why a submission was turned down: a code the data lane picks, and the one sentence anyone reading the status sees. */
export const REASONS = {
  no_program: "We could not find an affiliate program on the brand's own site.",
  terms_not_published: "The brand does not publish its affiliate terms, so there is nothing to verify yet.",
  not_brand_page: "The link is not the brand's own program page. Submit the page on the brand's site.",
  duplicate: "This program is already on OpenAffiliate or in the queue under another link.",
  out_of_scope: "This is not an affiliate or referral program OpenAffiliate lists.",
  spam: "This submission was not a program.",
} as const
export type RejectReason = keyof typeof REASONS

/**
 * Counted across instances by the database function, over admitted requests
 * only. web = Turnstile passed; plain = API and MCP.
 */
export const SUBMISSION_LIMITS = {
  web: { ipHour: 10, ipDay: 40 },
  plain: { ipHour: 5, ipDay: 20 },
  domainDay: 5,
  siteRequestsDay: 2000,
  siteNewDay: 300,
  siteNewPlainDay: 100,
} as const

export type LimitWindow = "ip_hour" | "ip_day" | "domain_day" | "site_day" | "site_new"
const WINDOW_SECONDS: Record<LimitWindow, number> = {
  ip_hour: 3600,
  ip_day: 86400,
  domain_day: 86400,
  site_day: 86400,
  site_new: 86400,
}

export interface NewSubmission {
  domain: string
  program_url: string
  terms_url: string | null
  name: string | null
  contact_email: string | null
  note: string | null
  source: SubmissionSource
  ip_hash: string
}

export interface SubmissionRow {
  id: string
  status: SubmissionStatus
  reason: RejectReason | null
  listed_slug: string | null
  created_at: string
  updated_at: string
}

export interface Caps {
  ipHour: number
  ipDay: number
  domainDay: number
  siteRequestsDay: number
  siteNewDay: number
  siteNewPlainDay: number
}

export type SubmitOutcome =
  | { result: "new" | "duplicate"; row: SubmissionRow; ipHour: number }
  | { result: "limited"; window: LimitWindow }

export interface SubmissionStore {
  /** submission_submit: caps, dedupe and insert as one locked step. */
  submit(row: NewSubmission, caps: Caps): Promise<SubmitOutcome>
  get(id: string): Promise<SubmissionRow | null>
}

/** A registry listing as the dedupe needs it. */
export interface ListedProgram {
  slug: string
  url: string
  status?: string | null
}

export interface SubmissionDeps {
  store: SubmissionStore
  /** HMAC key for IP hashes (CLAIM_SIGNING_SECRET). */
  secret: string
  /** Every registry listing whose website is on this registrable domain. */
  programsOnDomain: (domain: string) => readonly ListedProgram[]
  /** The program's OAS report URL when it has one. */
  reportUrl: (slug: string) => string | null
  /** null when Turnstile is not configured: a token is then ignored and the API limits apply. */
  verifyTurnstile: ((token: string, ip: string) => Promise<TurnstileResult | null>) | null
}

/** Where listings and reports live. Production on purpose, like markdownUrl: a citation points here. */
const SITE = "https://openaffiliate.dev"

// ---------------------------------------------------------------- input

/**
 * A submitted link, parsed once. WHATWG URL and tldts split some strings
 * differently ("https://a.unknown\@vercel.com/" is a.unknown to one and
 * vercel.com to the other), so the raw string is refused if it has a
 * backslash, whitespace or a control character, and everything after that,
 * the PSL check, the dedupe and quota domain and the stored value, comes from
 * the one WHATWG parse.
 */
export function submittedUrl(raw: string): { href: string; domain: string } | null {
  if (raw.length > 500 || !raw.startsWith("https://") || /[\\\s\p{C}]/u.test(raw)) return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null
  const host = url.hostname
  // IPv6 literals, and a trailing dot that would give one site two spellings.
  if (host.startsWith("[") || host.endsWith(".")) return null
  const parsed = parse(host, { allowPrivateDomains: true })
  // A suffix on neither list (brand.unknown, corp.internal, localhost) gets a
  // "domain" from tldts with both flags false.
  if (parsed.isIp || !parsed.domain || !(parsed.isIcann || parsed.isPrivate)) return null
  if (url.href.length > 600) return null
  return { href: url.href, domain: parsed.domain.toLowerCase() }
}

const urlField = z.string().max(500)
const optional = <T extends z.ZodTypeAny>(field: T) => z.preprocess((v) => (v === "" || v === null ? undefined : v), field.optional())

export const SubmissionInput = z
  .object({
    programUrl: urlField,
    termsUrl: optional(urlField),
    name: optional(textField(100)),
    contact: optional(z.string().max(320)),
    note: optional(proseField(1000)),
  })
  .strict()
export type SubmissionInput = z.infer<typeof SubmissionInput>

const WebBody = SubmissionInput.extend({ turnstileToken: optional(z.string().max(4096)) }).strict()

/** The request body is read as text and refused above this before any parsing. */
export const MAX_BODY_BYTES = 8 * 1024

// ---------------------------------------------------------------- results

export interface Answer {
  status: number
  body: Record<string, unknown>
  headers: Record<string, string>
}

const answer = (status: number, body: Record<string, unknown>, headers: Record<string, string> = {}): Answer => ({ status, body, headers })
const refuse = (status: number, error: string, message: string, extra: Record<string, unknown> = {}) =>
  answer(status, { error, message, ...extra })

const badField = (field: string, message: string) => refuse(400, "bad_request", message, { field })
const badUrl = (field: string) => badField(field, `Use a full https:// link to a public website for ${field === "programUrl" ? "the program" : "the terms page"}.`)

/** What GET /api/submissions/{id} and get_submission_status return. Nothing else is ever shown. */
export function publicSubmission(row: SubmissionRow, deps: Pick<SubmissionDeps, "reportUrl">): Record<string, unknown> {
  const listed = row.status === "listed" && row.listed_slug
  const report = listed ? deps.reportUrl(row.listed_slug!) : null
  return {
    id: row.id,
    status: row.status,
    ...(row.status === "rejected" && row.reason ? { reason: REASONS[row.reason] ?? null } : {}),
    ...(listed ? { listingUrl: `${SITE}/programs/${row.listed_slug}` } : {}),
    ...(report ? { reportUrl: report } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const rateHeaders = (limit: number, remaining: number, resetSeconds: number) => ({
  "RateLimit-Limit": String(limit),
  "RateLimit-Remaining": String(Math.max(0, remaining)),
  "RateLimit-Reset": String(resetSeconds),
})

function capOf(window: LimitWindow, source: SubmissionSource): number {
  const ip = source === "web" ? SUBMISSION_LIMITS.web : SUBMISSION_LIMITS.plain
  if (window === "ip_hour") return ip.ipHour
  if (window === "ip_day") return ip.ipDay
  if (window === "domain_day") return SUBMISSION_LIMITS.domainDay
  if (window === "site_day") return SUBMISSION_LIMITS.siteRequestsDay
  return source === "web" ? SUBMISSION_LIMITS.siteNewDay : SUBMISSION_LIMITS.siteNewPlainDay
}

const LIMITED_TEXT: Record<LimitWindow, string> = {
  ip_hour: "Too many submissions from your network this hour. Try again later.",
  ip_day: "Too many submissions from your network today. Try again tomorrow.",
  domain_day: "This website was submitted too many times today. Try again tomorrow.",
  site_day: "We are not taking more submissions today. Try again tomorrow.",
  site_new: "We are not taking more new submissions today. Try again tomorrow.",
}

// ---------------------------------------------------------------- submit

export const hashIp = (secret: string, ip: string) =>
  createHmac("sha256", secret).update(`submission-ip:${ip}`).digest("hex").slice(0, 32)

/**
 * The listing that already covers this domain, if any. A brand marked
 * no-program or discontinued that now has a program is news, so it is queued.
 * Several listings on one domain: the one for this page, then the lowest slug.
 */
export function listedFor(candidates: readonly ListedProgram[], href: string): ListedProgram | undefined {
  const live = candidates.filter((p) => p.status !== "no_program" && p.status !== "discontinued")
  const key = pageKey(href)
  return live.find((p) => key !== null && pageKey(p.url) === key) ?? [...live].sort((a, b) => (a.slug < b.slug ? -1 : 1))[0]
}

/**
 * Shared by POST /api/submissions and the MCP tool. `input` is untrusted;
 * `statusBase` is where this deployment serves GET /api/submissions/{id}.
 */
export async function submit(
  input: SubmissionInput,
  ctx: { ip: string; source: SubmissionSource; statusBase: string },
  deps: SubmissionDeps,
): Promise<Answer> {
  const program = submittedUrl(input.programUrl)
  if (!program) return badUrl("programUrl")
  let terms: string | null = null
  if (input.termsUrl !== undefined) {
    const parsed = submittedUrl(input.termsUrl)
    if (!parsed) return badUrl("termsUrl")
    terms = parsed.href
  }
  let contact: string | null = null
  if (input.contact !== undefined) {
    contact = normalizeEmail(input.contact)
    if (!contact) return badField("contact", "Enter a single email address, like name@example.com, or leave it empty.")
  }

  const listed = listedFor(deps.programsOnDomain(program.domain), program.href)
  if (listed) {
    const report = deps.reportUrl(listed.slug)
    return answer(200, { status: "listed", listingUrl: `${SITE}/programs/${listed.slug}`, ...(report ? { reportUrl: report } : {}) })
  }

  const ip = ctx.source === "web" ? SUBMISSION_LIMITS.web : SUBMISSION_LIMITS.plain
  const outcome = await deps.store.submit(
    {
      domain: program.domain,
      program_url: program.href,
      terms_url: terms,
      name: input.name ?? null,
      contact_email: contact,
      note: input.note ?? null,
      source: ctx.source,
      ip_hash: hashIp(deps.secret, ctx.ip),
    },
    {
      ipHour: ip.ipHour,
      ipDay: ip.ipDay,
      domainDay: SUBMISSION_LIMITS.domainDay,
      siteRequestsDay: SUBMISSION_LIMITS.siteRequestsDay,
      siteNewDay: SUBMISSION_LIMITS.siteNewDay,
      siteNewPlainDay: SUBMISSION_LIMITS.siteNewPlainDay,
    },
  )
  if (outcome.result === "limited") {
    const seconds = WINDOW_SECONDS[outcome.window]
    return answer(
      429,
      { error: "rate_limited", message: LIMITED_TEXT[outcome.window] },
      { "Retry-After": String(seconds), ...rateHeaders(capOf(outcome.window, ctx.source), 0, seconds) },
    )
  }
  const { row } = outcome
  const headers = rateHeaders(ip.ipHour, ip.ipHour - outcome.ipHour, WINDOW_SECONDS.ip_hour)
  const statusUrl = `${ctx.statusBase}/api/submissions/${row.id}`
  if (outcome.result === "duplicate") return answer(200, { id: row.id, status: row.status, statusUrl, duplicate: true }, headers)
  return answer(202, { id: row.id, status: row.status, statusUrl }, headers)
}

/** Turns a zod failure into a refusal that names the field, never the value. */
function formRefusal(error: z.ZodError): Answer {
  const issue = error.issues[0]
  if (issue?.code === "unrecognized_keys") return refuse(400, "bad_request", "Unknown field in the request.", { field: issue.keys.join(",") })
  const field = (issue?.path ?? []).join(".")
  if (!field) return refuse(400, "bad_request", "Send a JSON object with programUrl.")
  return badField(field, issue?.message === HIDDEN_CHARACTER ? `Remove hidden or special characters from ${field}.` : `Check ${field} and try again.`)
}

/** MCP arguments, validated with the same schema as the HTTP body. */
export function readInput(args: unknown): SubmissionInput | Answer {
  const parsed = SubmissionInput.safeParse(args)
  return parsed.success ? parsed.data : formRefusal(parsed.error)
}

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown"
}

/** POST /api/submissions. */
export async function handlePost(req: Request, deps: SubmissionDeps): Promise<Answer> {
  // JSON only: a cross-site page cannot send application/json without a CORS
  // preflight, and this route answers none, so visitors' browsers cannot be
  // used to submit from many addresses.
  if (!/^application\/json\s*(;|$)/i.test(req.headers.get("content-type") ?? "")) {
    return refuse(415, "unsupported_media_type", "Send the body as application/json.")
  }
  const declared = Number(req.headers.get("content-length") ?? "0")
  if (declared > MAX_BODY_BYTES) return refuse(413, "too_large", "The request body is too large.")
  const text = await req.text().catch(() => null)
  if (text === null || Buffer.byteLength(text) > MAX_BODY_BYTES) return refuse(413, "too_large", "The request body is too large.")
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return refuse(400, "bad_request", "Send a JSON object with programUrl.")
  }
  const parsed = WebBody.safeParse(json)
  if (!parsed.success) return formRefusal(parsed.error)
  const { turnstileToken, ...input } = parsed.data
  const ip = clientIp(req.headers)

  // A token only counts where Turnstile is configured; a token that fails is refused, not downgraded.
  let source: SubmissionSource = "api"
  if (turnstileToken && deps.verifyTurnstile) {
    const result = await deps.verifyTurnstile(turnstileToken, ip)
    const passed = result?.success === true && TURNSTILE_HOSTNAMES.has(result.hostname ?? "") && result.action === "submit-program"
    if (!passed) return refuse(403, "turnstile_failed", "The check did not pass. Reload the page and try again.")
    source = "web"
  }
  return submit(input, { ip, source, statusBase: new URL(req.url).origin }, deps)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const notFound = () => refuse(404, "not_found", "No submission with this id.")

/** GET /api/submissions/{id} and get_submission_status. A malformed id never reaches the database. */
export async function status(id: string, deps: SubmissionDeps): Promise<Answer> {
  if (!UUID.test(id)) return notFound()
  const row = await deps.store.get(id)
  return row ? answer(200, publicSubmission(row, deps)) : notFound()
}

/**
 * The /submissions/{id} page's data: the public body, or null for a page
 * that should 404 (malformed, unknown or pruned id). A database failure
 * throws; the page calls notFound() itself, outside any try.
 */
export async function statusPageBody(id: string, deps: SubmissionDeps): Promise<Record<string, unknown> | null> {
  let a: Answer
  try {
    a = await status(id, deps)
  } catch (err) {
    logFailure("status-page", err)
    throw new Error("submission status unavailable")
  }
  return a.status === 200 ? a.body : null
}

/**
 * Per-instance flood guard for the status read (fixed window, the pattern
 * mcp-route.ts uses). Not a quota: the read is one indexed select by id.
 */
const READ_WINDOW_MS = 60_000
const READS_PER_WINDOW = 60
let reads = new Map<string, number>()
let readWindowStart = Date.now()

export function readAllowed(ip: string, now = Date.now()): boolean {
  if (now - readWindowStart >= READ_WINDOW_MS || reads.size >= 20_000) {
    reads = new Map()
    readWindowStart = now
  }
  const key = ip.slice(0, 45)
  const seen = (reads.get(key) ?? 0) + 1
  reads.set(key, seen)
  return seen <= READS_PER_WINDOW
}

export const disabledAnswer = (): Answer =>
  refuse(503, "submissions_disabled", "Program submissions are not enabled yet. Open a pull request instead: https://github.com/Affitor/open-affiliate")

/** The error code only: messages and details can echo row values. */
export function logFailure(action: string, err: unknown): void {
  const code = (typeof err === "object" && err && "code" in err && String((err as { code: unknown }).code)) || "unknown"
  console.error("submissions:", action, "failed", code)
}

export const serverError = (): Answer => refuse(500, "server_error", "Something went wrong. Try again later.")

export function toResponse(a: Answer): Response {
  return Response.json(a.body, { status: a.status, headers: { "Cache-Control": "no-store", ...a.headers } })
}
