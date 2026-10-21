import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Mail sent to any address @openaffiliate.dev reaches Resend Inbound, which
 * posts an `email.received` webhook here. We fetch the full message from
 * Resend and re-send it to ONE fixed owner address (OA_INBOX_FORWARD_TO).
 * Nothing is ever sent to an address taken from the incoming mail.
 *
 * Env: RESEND_INBOUND_WEBHOOK_SECRET (whsec_…, from the Resend webhook page),
 * OA_INBOX_FORWARD_TO (the owner inbox), OA_RESEND_API_KEY (shared with
 * claims; reading received mail needs a Full access key), and the claims
 * Supabase pair for the forward ledger (supabase/migrations/013). Any
 * missing → 500, no send.
 */

export const OWN_DOMAIN = "openaffiliate.dev"
export const FORWARD_FROM = `OpenAffiliate inbox <inbox@${OWN_DOMAIN}>`
export const SUBJECT_TAG = "[OA inbox]"
/** Set on every forward; mail that carries it is never forwarded again. */
export const LOOP_HEADER = "X-OA-Inbox"
/** Attachments are included until their total would pass this; the rest are listed by name. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const MAX_ATTACHMENTS = 20
export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60
/**
 * A POST whose outcome is unknown is retried (same key, same payload) only
 * while its first POST is younger than this: Resend keeps an Idempotency-Key
 * for 24 h, so every retry still lands on the live key.
 */
export const UNCERTAIN_RETRY_MS = 23 * 60 * 60 * 1000
/** How long a claim on a ledger row lasts; longer than maxDuration (60 s). */
export const LEASE_MS = 90_000
/** Reads from Resend share this; the send gets its own 15 s, inside maxDuration 60. */
export const READ_BUDGET_MS = 40_000
const DOWNLOAD_CONCURRENCY = 4

const RESEND_API = "https://api.resend.com"
const ADDRESS = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/
const EMAIL_ID = /^[A-Za-z0-9-]{1,100}$/

export type InboundDeps = {
  env: Record<string, string | undefined>
  fetch: typeof fetch
  /** Milliseconds since epoch. */
  now: () => number
  /** The forward ledger; null when its env is missing (→ 500, no send). */
  ledger: ForwardLedger | null
  /** Overrides READ_BUDGET_MS (tests). */
  budgetMs?: number
}

export type ForwardStatus = "pending" | "uncertain" | "sent" | "needs_review"
export type ForwardRow = { status: ForwardStatus; first_post_at: string | null; payload_hash: string | null }
export type ForwardPatch = Partial<ForwardRow> & { lease_until?: string }

/** The oa_inbox_forwards table (supabase/migrations/013_inbox_forwards.sql). */
export type ForwardLedger = {
  /**
   * Atomically take the row for this email (creating it as pending) if it is
   * pending or uncertain and nobody else holds an unexpired lease, stamping
   * it with `token`. Returns the row either way so the caller can tell
   * "already sent" from "busy".
   */
  claim(emailId: string, token: string, nowMs: number, leaseMs: number): Promise<{ claimed: boolean; row: ForwardRow | null }>
  /**
   * Fenced write: applies only if the row still carries `token` (nobody
   * re-claimed it) and is still in `from`. True iff exactly one row changed.
   * Nothing ever moves a row out of `sent`: no caller passes it as `from`,
   * and claim() never matches it.
   */
  transition(emailId: string, token: string, from: ForwardStatus, patch: ForwardPatch, nowMs: number): Promise<boolean>
}

type ReceivedAttachment = {
  id?: string
  filename?: string | null
  content_type?: string | null
  content_id?: string | null
  size?: number
  download_url?: string
}

type ReceivedEmail = {
  from?: string
  to?: string[]
  cc?: string[]
  reply_to?: string[]
  subject?: string | null
  created_at?: string
  html?: string | null
  text?: string | null
  headers?: Record<string, unknown>
  attachments?: ReceivedAttachment[]
}

/**
 * Svix signature check (Resend webhooks are delivered by Svix):
 * HMAC-SHA256 over `${id}.${timestamp}.${body}` keyed with the base64 part of
 * the whsec_ secret, compared in constant time against every `v1,` entry of
 * the svix-signature header. Timestamps more than five minutes off are refused.
 */
export function verifySvixSignature(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  nowMs: number,
): boolean {
  const { id, timestamp, signature } = headers
  if (!id || !timestamp || !signature || !/^\d{1,12}$/.test(timestamp)) return false
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > SIGNATURE_TOLERANCE_SECONDS) return false
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64")
  if (key.length === 0) return false
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest()
  return signature.split(" ").some((entry) => {
    const [version, value] = entry.split(",", 2)
    if (version !== "v1" || !value) return false
    const given = Buffer.from(value, "base64")
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
}

/** The one owner address, or null if the env value is not a single plain address. */
export function forwardAddress(value: string | undefined): string | null {
  const address = value?.trim() ?? ""
  return ADDRESS.test(address) ? address : null
}

function bareAddress(value: string): string {
  const angled = /<([^<>]+)>\s*$/.exec(value)
  return (angled ? angled[1] : value).trim().toLowerCase()
}

/** Mail from our own domain, or mail we already forwarded, is dropped. */
export function isLoop(mail: { from?: string; subject?: string | null; headers?: Record<string, unknown> }): boolean {
  const from = bareAddress(mail.from ?? "")
  const domain = from.slice(from.lastIndexOf("@") + 1)
  if (domain === OWN_DOMAIN || domain.endsWith(`.${OWN_DOMAIN}`)) return true
  if ((mail.subject ?? "").includes(SUBJECT_TAG)) return true
  const loopHeader = LOOP_HEADER.toLowerCase()
  return Object.keys(mail.headers ?? {}).some((name) => name.toLowerCase() === loopHeader)
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim()
}

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status })
}

/** Fetch the received mail and build the forward. Throws on any read failure. */
async function buildForward(
  emailId: string,
  owner: string,
  api: (path: string) => Promise<Response>,
  deps: InboundDeps,
  budget: AbortSignal,
): Promise<{ loop: true } | { loop: false; body: string; bytes: number }> {
  // cid keeps inline images as attachments (with content_id) instead of
  // data: URIs, which Gmail does not render.
  const got = await api(`/emails/receiving/${emailId}?html_format=cid`)
  if (!got.ok) throw new Error(`fetch email ${got.status}`)
  const email = (await got.json()) as ReceivedEmail
  if (isLoop(email)) return { loop: true }

  let listed: ReceivedAttachment[] = []
  if ((email.attachments ?? []).length > 0) {
    const res = await api(`/emails/receiving/${emailId}/attachments`)
    if (!res.ok) throw new Error(`list attachments ${res.status}`)
    listed = ((await res.json()) as { data?: ReceivedAttachment[] }).data ?? []
  }

  // Which files go in is decided from the listing alone (declared size and
  // count, in id order), never from how long downloads take, so every retry
  // builds the same payload for the same Idempotency-Key.
  const chosen: ReceivedAttachment[] = []
  const skipped: string[] = []
  let declaredTotal = 0
  for (const item of [...listed].sort((a, b) => String(a.id).localeCompare(String(b.id), "en", { numeric: true }))) {
    const declared = typeof item.size === "number" && item.size >= 0 ? item.size : Number.POSITIVE_INFINITY
    if (!item.download_url || chosen.length >= MAX_ATTACHMENTS || declaredTotal + declared > MAX_ATTACHMENT_BYTES) {
      skipped.push(`${oneLine(item.filename || "attachment")} (${Number.isFinite(declared) ? megabytes(declared) : "size unknown"})`)
      continue
    }
    declaredTotal += declared
    chosen.push(item)
  }

  // A few at a time, inside the read budget. The first failure aborts every
  // download in flight and stops the queue; we wait for all workers to stop
  // before answering 500 (Resend retries). Never a send with fewer files.
  const files: Buffer[] = new Array(chosen.length)
  const batch = new AbortController()
  let failure: unknown = null
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, chosen.length) }, async () => {
      while (!batch.signal.aborted && next < chosen.length) {
        const index = next++
        try {
          const signal = AbortSignal.any([budget, batch.signal, AbortSignal.timeout(20_000)])
          const file = await deps.fetch(chosen[index].download_url!, { signal })
          if (!file.ok) throw new Error(`download attachment ${file.status}`)
          files[index] = Buffer.from(await file.arrayBuffer())
        } catch (error) {
          if (!batch.signal.aborted) {
            failure = error
            batch.abort()
          }
        }
      }
    }),
  )
  if (failure) throw failure

  const attachments: Record<string, string>[] = []
  let total = 0
  chosen.forEach((item, index) => {
    const name = oneLine(item.filename || "attachment")
    const bytes = files[index]
    // A file larger than it declared: listed instead (same bytes, same answer on every retry).
    if (total + bytes.length > MAX_ATTACHMENT_BYTES) {
      skipped.push(`${name} (${megabytes(bytes.length)})`)
      return
    }
    total += bytes.length
    const attachment: Record<string, string> = { filename: name, content: bytes.toString("base64") }
    if (item.content_type) attachment.content_type = item.content_type
    if (item.content_id) attachment.content_id = item.content_id
    attachments.push(attachment)
  })

  const headerFrom = typeof email.headers?.from === "string" ? email.headers.from : email.from ?? ""
  const lines = [
    `From: ${oneLine(headerFrom)}`,
    `To: ${oneLine((email.to ?? []).join(", "))}`,
    ...((email.cc ?? []).length > 0 ? [`Cc: ${oneLine(email.cc!.join(", "))}`] : []),
    `Date: ${oneLine(email.created_at ?? "")}`,
    ...(skipped.length > 0 ? [`Not attached (limit ${MAX_ATTACHMENTS} files, ${megabytes(MAX_ATTACHMENT_BYTES)} total): ${skipped.join(", ")}`] : []),
  ]
  const textBlock = `---------- Received at ${OWN_DOMAIN} ----------\n${lines.join("\n")}\n\n`
  const htmlBlock =
    `<div style="font:13px/1.5 sans-serif;color:#555;border-bottom:1px solid #ddd;padding:0 0 8px;margin:0 0 12px">` +
    `<strong>Received at ${OWN_DOMAIN}</strong><br>${lines.map(escapeHtml).join("<br>")}</div>`

  const replyTo = (email.reply_to?.length ? email.reply_to : [email.from ?? ""])
    .map(oneLine)
    .filter((address) => ADDRESS.test(bareAddress(address)))

  const message: Record<string, unknown> = {
    from: FORWARD_FROM,
    to: [owner],
    subject: `${SUBJECT_TAG} ${oneLine(email.subject || "(no subject)")}`,
    text: textBlock + (email.text ?? ""),
    headers: { [LOOP_HEADER]: emailId },
  }
  if (email.html) message.html = htmlBlock + email.html
  if (replyTo.length > 0) message.reply_to = replyTo
  if (attachments.length > 0) message.attachments = attachments
  return { loop: false, body: JSON.stringify(message), bytes: total }
}

/** Fixed strings only: our own error messages carry statuses, never addresses or bodies. */
function failureReason(error: unknown): string {
  if (error instanceof Error && /^(fetch|list|download|send|ledger) /.test(error.message)) return error.message
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return "timeout"
  return "network"
}

/**
 * Ledger flow (one row per email id, see migration 013):
 * - sent or needs_review → 200, no POST, whatever the mail's age;
 * - held by another invocation → 409, Resend retries later;
 * - pending (never POSTed, or the first POST was definitely refused: a 4xx
 *   other than 409/429) → build and POST at any age, so a delayed delivery
 *   or a read-side outage followed by a late recovery still forwards once;
 * - uncertain (a POST went out, outcome unknown: no answer, 5xx, 409, 429) → re-POST the same payload
 *   with the same key only while the first POST is under 23 h old, i.e. while
 *   Resend still holds the key; after that, or if the payload would differ,
 *   needs_review: 200 without a POST, never a blind second send.
 */
export async function handleInboundEmail(req: Request, deps: InboundDeps): Promise<Response> {
  const { env, ledger } = deps
  const secret = env.RESEND_INBOUND_WEBHOOK_SECRET
  const apiKey = env.OA_RESEND_API_KEY
  const owner = forwardAddress(env.OA_INBOX_FORWARD_TO)
  if (!secret || !apiKey || !owner || !ledger) {
    console.error("inbound-email: not configured")
    return json(500, { error: "not configured" })
  }

  const body = await req.text()
  const signed = verifySvixSignature(
    secret,
    {
      id: req.headers.get("svix-id"),
      timestamp: req.headers.get("svix-timestamp"),
      signature: req.headers.get("svix-signature"),
    },
    body,
    deps.now(),
  )
  if (!signed) return json(401, { error: "invalid signature" })

  let event: { type?: unknown; data?: { email_id?: unknown; from?: string; subject?: string } }
  try {
    event = JSON.parse(body)
  } catch {
    return json(400, { error: "invalid json" })
  }
  if (event?.type !== "email.received") return json(200, { ignored: true })
  const emailId = event.data?.email_id
  if (typeof emailId !== "string" || !EMAIL_ID.test(emailId)) return json(400, { error: "invalid email id" })
  if (isLoop(event.data ?? {})) {
    console.log("inbound-email: dropped (loop guard)", emailId)
    return json(200, { dropped: true })
  }

  const token = randomUUID()
  let claim: Awaited<ReturnType<ForwardLedger["claim"]>>
  try {
    claim = await ledger.claim(emailId, token, deps.now(), LEASE_MS)
  } catch {
    console.error("inbound-email: failed", emailId, "ledger claim")
    return json(500, { error: "forward failed" })
  }
  const row = claim.row
  if (row?.status === "sent") return json(200, { forwarded: "already" })
  if (row?.status === "needs_review") return json(200, { needsReview: true })
  if (!claim.claimed || !row) return json(409, { error: "in progress" })

  // Every write below is fenced on our token and the state we expect; a
  // false result means another invocation owns the row now.
  let state: ForwardStatus = row.status
  const move = async (patch: ForwardPatch): Promise<boolean> => {
    try {
      const done = await ledger.transition(emailId, token, state, patch, deps.now())
      if (done && patch.status) state = patch.status
      return done
    } catch {
      return false
    }
  }
  const unlock = () => ({ lease_until: new Date(deps.now()).toISOString() })
  // Best effort: if it fails the lease simply runs out.
  const release = async (patch: ForwardPatch = {}) => {
    if (!(await move({ ...patch, ...unlock() }))) console.error("inbound-email: ledger release failed", emailId)
  }
  // ACKed only once it is stored, so the case is never lost from the review queue.
  const needsReview = async (why: string) => {
    if (!(await move({ status: "needs_review", ...unlock() }))) {
      console.error("inbound-email: failed", emailId, "ledger needs_review")
      return json(500, { error: "forward failed" })
    }
    console.error("inbound-email: needs review", emailId, why)
    return json(200, { needsReview: true })
  }

  const firstPostAt = row.status === "uncertain" ? Date.parse(row.first_post_at ?? "") : null
  if (firstPostAt !== null && !(deps.now() - firstPostAt < UNCERTAIN_RETRY_MS)) {
    return needsReview("uncertain past the key window")
  }

  // One budget for every read from Resend (message, list, downloads), so the
  // send below still fits inside the route's maxDuration.
  const budget = AbortSignal.timeout(deps.budgetMs ?? READ_BUDGET_MS)
  const api = (path: string) =>
    deps.fetch(`${RESEND_API}${path}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.any([budget, AbortSignal.timeout(10_000)]),
    })

  let onFailure: ForwardPatch = {}
  try {
    const forward = await buildForward(emailId, owner, api, deps, budget)
    if (forward.loop) {
      await release()
      console.log("inbound-email: dropped (loop guard)", emailId)
      return json(200, { dropped: true })
    }
    const hash = createHash("sha256").update(forward.body).digest("hex")
    if (row.status === "uncertain" && row.payload_hash !== hash) return needsReview("payload changed")

    // Durable before the POST: if we die mid-request, the next attempt knows
    // a POST may have gone out and only replays it under the live key. If we
    // lost the row meanwhile, we do not POST at all.
    const marked = await move({
      status: "uncertain",
      payload_hash: hash,
      first_post_at: row.first_post_at ?? new Date(deps.now()).toISOString(),
    })
    if (!marked) throw new Error("ledger mark")

    // A thrown fetch (no answer) leaves the row uncertain: it may have been accepted.
    const sent = await deps.fetch(`${RESEND_API}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `oa-inbox/${emailId}`,
      },
      body: forward.body,
      signal: AbortSignal.timeout(15_000),
    })
    if (sent.ok) {
      // The mail went out: 200 even if recording it fails. The row then stays
      // uncertain, so a replay within 23 h hits the same key and later ones
      // go to needs_review; never a second POST outside the key's life.
      if (!(await move({ status: "sent", ...unlock() }))) console.error("inbound-email: sent but not recorded", emailId)
      console.log("inbound-email: forwarded", emailId, forward.bytes)
      return json(200, { forwarded: true })
    }
    // Only a definite refusal of the FIRST POST (a 4xx other than 409 and
    // 429) goes back to pending, to be sent later at any age. A 5xx, 409
    // (same key in flight or with another payload) or 429 may still have
    // been accepted, so it stays uncertain like a lost response: replayed
    // under the same key for 23 h, then needs_review. A rare long outage thus
    // ends in needs_review (the owner checks the Resend dashboard) rather
    // than risking a second copy. Status only: the body can echo addresses.
    const refused = sent.status >= 400 && sent.status < 500 && sent.status !== 409 && sent.status !== 429
    if (row.status === "pending" && refused) onFailure = { status: "pending", first_post_at: null, payload_hash: null }
    throw new Error(`send ${sent.status}`)
  } catch (error) {
    await release(onFailure)
    console.error("inbound-email: failed", emailId, failureReason(error))
    return json(500, { error: "forward failed" })
  }
}

/** Supabase-backed ledger (service role). Each request is capped at 5 s. */
export function supabaseLedger(db: SupabaseClient): ForwardLedger {
  const table = () => db.from("oa_inbox_forwards")
  const columns = "status, first_post_at, payload_hash"
  const cap = () => AbortSignal.timeout(5_000)
  return {
    async claim(emailId, token, nowMs, leaseMs) {
      const now = new Date(nowMs).toISOString()
      const created = await table()
        .upsert({ email_id: emailId }, { onConflict: "email_id", ignoreDuplicates: true })
        .abortSignal(cap())
      if (created.error) throw new Error("ledger insert")
      // One UPDATE with the whole condition in its WHERE: Postgres re-checks
      // it on the locked row, so of two concurrent claims only one matches.
      const taken = await table()
        .update({ lease_token: token, lease_until: new Date(nowMs + leaseMs).toISOString(), updated_at: now })
        .eq("email_id", emailId)
        .in("status", ["pending", "uncertain"])
        .lt("lease_until", now)
        .select(columns)
        .abortSignal(cap())
      if (taken.error) throw new Error("ledger claim")
      if (taken.data?.length === 1) return { claimed: true, row: taken.data[0] as ForwardRow }
      const current = await table().select(columns).eq("email_id", emailId).abortSignal(cap()).maybeSingle()
      if (current.error) throw new Error("ledger read")
      return { claimed: false, row: (current.data as ForwardRow | null) ?? null }
    },
    async transition(emailId, token, from, patch, nowMs) {
      const { data, error } = await table()
        .update({ ...patch, updated_at: new Date(nowMs).toISOString() })
        .eq("email_id", emailId)
        .eq("lease_token", token)
        .eq("status", from)
        .select("email_id")
        .abortSignal(cap())
      if (error) throw new Error("ledger update")
      return data?.length === 1
    },
  }
}
