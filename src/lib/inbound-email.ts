import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Mail sent to any address @openaffiliate.dev reaches Resend Inbound, which
 * posts an `email.received` webhook here. We fetch the full message from
 * Resend and re-send it to ONE fixed owner address (OA_INBOX_FORWARD_TO).
 * Nothing is ever sent to an address taken from the incoming mail.
 *
 * Env: RESEND_INBOUND_WEBHOOK_SECRET (whsec_…, from the Resend webhook page),
 * OA_INBOX_FORWARD_TO (the owner inbox), OA_RESEND_API_KEY (shared with
 * claims; reading received mail needs a Full access key). Any missing → 500,
 * no send.
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
/** Latest send after receipt; must stay under Resend's 24 h Idempotency-Key life. */
export const SEND_WINDOW_MS = 23 * 60 * 60 * 1000
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
  /** Overrides READ_BUDGET_MS (tests). */
  budgetMs?: number
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

export async function handleInboundEmail(req: Request, deps: InboundDeps): Promise<Response> {
  const { env } = deps
  const secret = env.RESEND_INBOUND_WEBHOOK_SECRET
  const apiKey = env.OA_RESEND_API_KEY
  const owner = forwardAddress(env.OA_INBOX_FORWARD_TO)
  if (!secret || !apiKey || !owner) {
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

  // One budget for every read from Resend (message, list, downloads), so the
  // send below still fits inside the route's maxDuration.
  const budget = AbortSignal.timeout(deps.budgetMs ?? READ_BUDGET_MS)
  const within = (ms: number) => AbortSignal.any([budget, AbortSignal.timeout(ms)])
  const api = (path: string, init: RequestInit = {}, signal = within(10_000)) =>
    deps.fetch(`${RESEND_API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${apiKey}`, ...init.headers },
      signal,
    })

  try {
    // cid keeps inline images as attachments (with content_id) instead of
    // data: URIs, which Gmail does not render.
    const got = await api(`/emails/receiving/${emailId}?html_format=cid`)
    if (!got.ok) throw new Error(`fetch email ${got.status}`)
    const email = (await got.json()) as ReceivedEmail
    if (isLoop(email)) {
      console.log("inbound-email: dropped (loop guard)", emailId)
      return json(200, { dropped: true })
    }
    const receivedAt = Date.parse(email.created_at ?? "")
    if (Number.isNaN(receivedAt)) throw new Error("fetch email no-created_at")

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

    // Parallel, a few at a time, all inside the budget. Any failure or timeout
    // is a 500 (Resend retries), never a send with fewer files.
    const files: Buffer[] = new Array(chosen.length)
    let next = 0
    await Promise.all(
      Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, chosen.length) }, async () => {
        while (next < chosen.length) {
          const index = next++
          const file = await deps.fetch(chosen[index].download_url!, { signal: within(20_000) })
          if (!file.ok) throw new Error(`download attachment ${file.status}`)
          files[index] = Buffer.from(await file.arrayBuffer())
        }
      }),
    )

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

    // Resend keeps an Idempotency-Key for 24 h, but webhook retries run for
    // ~27.5 h and the dashboard can replay a delivered webhook at any time.
    // So nothing is sent later than 23 h after the mail was received: every
    // send then falls inside the 24 h life of a key first used at or after
    // receipt (the hour spare covers clock skew), and a retry or replay can
    // never send twice. Trade-off: a mail whose attempts all failed for 23 h
    // is not forwarded; it stays readable in the Resend dashboard.
    if (deps.now() - receivedAt > SEND_WINDOW_MS) {
      console.log("inbound-email: stale, skipped", emailId)
      return json(200, { skipped: "stale" })
    }

    const sent = await api(
      "/emails",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": `oa-inbox/${emailId}` },
        body: JSON.stringify(message),
      },
      AbortSignal.timeout(15_000),
    )
    // Status only: the response body can echo addresses.
    if (!sent.ok) throw new Error(`send ${sent.status}`)
    console.log("inbound-email: forwarded", emailId, total)
    return json(200, { forwarded: true })
  } catch (error) {
    // Message only: our own error strings carry statuses, never addresses or bodies.
    const reason =
      error instanceof Error && /^(fetch|list|download|send) /.test(error.message)
        ? error.message
        : error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
          ? "timeout"
          : "network"
    console.error("inbound-email: failed", emailId, reason)
    // 500 makes Resend retry; the idempotency key keeps a retry from sending twice.
    return json(500, { error: "forward failed" })
  }
}
