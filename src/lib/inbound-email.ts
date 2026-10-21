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
export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60

const RESEND_API = "https://api.resend.com"
const ADDRESS = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/
const EMAIL_ID = /^[A-Za-z0-9-]{1,100}$/

export type InboundDeps = {
  env: Record<string, string | undefined>
  fetch: typeof fetch
  /** Milliseconds since epoch. */
  now: () => number
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

  const api = (path: string, init: RequestInit = {}) =>
    deps.fetch(`${RESEND_API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${apiKey}`, ...init.headers },
      signal: AbortSignal.timeout(10_000),
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

    let listed: ReceivedAttachment[] = []
    if ((email.attachments ?? []).length > 0) {
      const res = await api(`/emails/receiving/${emailId}/attachments`)
      if (!res.ok) throw new Error(`list attachments ${res.status}`)
      listed = ((await res.json()) as { data?: ReceivedAttachment[] }).data ?? []
    }

    const attachments: Record<string, string>[] = []
    const skipped: string[] = []
    let total = 0
    for (const item of listed) {
      const name = oneLine(item.filename || "attachment")
      const declared = typeof item.size === "number" ? item.size : Number.POSITIVE_INFINITY
      if (!item.download_url || total + declared > MAX_ATTACHMENT_BYTES) {
        skipped.push(`${name} (${Number.isFinite(declared) ? megabytes(declared) : "size unknown"})`)
        continue
      }
      const file = await deps.fetch(item.download_url, { signal: AbortSignal.timeout(20_000) })
      if (!file.ok) throw new Error(`download attachment ${file.status}`)
      const bytes = Buffer.from(await file.arrayBuffer())
      if (total + bytes.length > MAX_ATTACHMENT_BYTES) {
        skipped.push(`${name} (${megabytes(bytes.length)})`)
        continue
      }
      total += bytes.length
      const attachment: Record<string, string> = { filename: name, content: bytes.toString("base64") }
      if (item.content_type) attachment.content_type = item.content_type
      if (item.content_id) attachment.content_id = item.content_id
      attachments.push(attachment)
    }

    const headerFrom = typeof email.headers?.from === "string" ? email.headers.from : email.from ?? ""
    const lines = [
      `From: ${oneLine(headerFrom)}`,
      `To: ${oneLine((email.to ?? []).join(", "))}`,
      ...((email.cc ?? []).length > 0 ? [`Cc: ${oneLine(email.cc!.join(", "))}`] : []),
      `Date: ${oneLine(email.created_at ?? "")}`,
      ...(skipped.length > 0 ? [`Not attached (over ${megabytes(MAX_ATTACHMENT_BYTES)} total): ${skipped.join(", ")}`] : []),
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

    const sent = await api("/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // A webhook retried for the same email is sent once (Resend keeps keys 24 h).
        "Idempotency-Key": `oa-inbox/${emailId}`,
      },
      body: JSON.stringify(message),
    })
    // Status only: the response body can echo addresses.
    if (!sent.ok) throw new Error(`send ${sent.status}`)
    console.log("inbound-email: forwarded", emailId, total)
    return json(200, { forwarded: true })
  } catch (error) {
    // Message only: our own error strings carry statuses, never addresses or bodies.
    const reason = error instanceof Error && /^(fetch|list|download|send) /.test(error.message) ? error.message : "network"
    console.error("inbound-email: failed", emailId, reason)
    // 500 makes Resend retry; the idempotency key keeps a retry from sending twice.
    return json(500, { error: "forward failed" })
  }
}
