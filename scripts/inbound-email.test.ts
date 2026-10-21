import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { test } from "node:test"
import {
  FORWARD_FROM,
  LOOP_HEADER,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  forwardAddress,
  handleInboundEmail,
  isLoop,
  verifySvixSignature,
} from "../src/lib/inbound-email"

const SECRET = "whsec_" + Buffer.from("test-secret-for-inbound-email-32b").toString("base64")
const NOW = 1_760_000_000_000
const OWNER = "owner@example.com"
const ENV = { RESEND_INBOUND_WEBHOOK_SECRET: SECRET, OA_RESEND_API_KEY: "re_test", OA_INBOX_FORWARD_TO: OWNER }
const EMAIL_ID = "56761188-7520-42d8-8898-ff6fc54ce618"

function sign(body: string, timestamp = String(NOW / 1000), id = "msg_1", secret = SECRET): Record<string, string> {
  const key = Buffer.from(secret.slice(6), "base64")
  const sig = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")
  return { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${sig}` }
}

function webhook(data: Record<string, unknown> = {}, type = "email.received", headers?: Record<string, string>): Request {
  const body = JSON.stringify({
    type,
    created_at: "2026-10-20T00:00:00.000Z",
    data: { email_id: EMAIL_ID, from: "alice@sender.test", to: ["hello@openaffiliate.dev"], subject: "Hi", ...data },
  })
  return new Request("https://openaffiliate.dev/api/inbound-email", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(headers ?? sign(body)) },
    body,
  })
}

type Email = Record<string, unknown>
type FakeFile = { filename: string; size: number; content_id?: string; delayMs?: number; status?: number }

const HOUR = 60 * 60 * 1000
/** Resend keeps an Idempotency-Key this long (docs: idempotency-keys). */
const KEY_LIFE_MS = 24 * HOUR

/**
 * A fake Resend on a shared clock: records every call and, like the real API,
 * delivers once per Idempotency-Key while that key is younger than 24 h.
 * `loseResponses` makes the next N accepted sends fail on the way back.
 */
function fakeResend(email: Email = {}, files: FakeFile[] = [], clock = { now: NOW }) {
  const calls: string[] = []
  const sends: { key: string | null; body: Record<string, unknown> }[] = []
  const keys = new Map<string, { body: string; at: number }>()
  const state = { accepted: 0, loseResponses: 0 }
  const received = {
    from: "alice@sender.test",
    to: ["hello@openaffiliate.dev"],
    subject: "Hi",
    created_at: new Date(NOW).toISOString(),
    html: "<p>Hello</p>",
    text: "Hello",
    headers: { from: "Alice <alice@sender.test>" },
    reply_to: [],
    attachments: files.map((f, i) => ({ id: `a${i}`, filename: f.filename, size: f.size })),
    ...email,
  }
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push(`${init?.method ?? "GET"} ${url}`)
    if (url.startsWith("https://files.test/")) {
      const file = files[Number(new URL(url).pathname.slice(2))]
      if (file.delayMs) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, file.delayMs)
          init?.signal?.addEventListener("abort", () => {
            clearTimeout(timer)
            reject(init.signal!.reason)
          })
        })
      }
      if (file.status) return new Response("no", { status: file.status })
      return new Response(new Uint8Array(file.size))
    }
    if (url === `https://api.resend.com/emails/receiving/${EMAIL_ID}?html_format=cid`) return Response.json(received)
    if (url === `https://api.resend.com/emails/receiving/${EMAIL_ID}/attachments`) {
      return Response.json({
        object: "list",
        has_more: false,
        data: files.map((f, i) => ({
          id: `a${i}`,
          filename: f.filename,
          size: f.size,
          content_type: "application/pdf",
          content_id: f.content_id ?? null,
          download_url: `https://files.test/a${i}?sig=${Math.random()}`,
        })),
      })
    }
    if (url === "https://api.resend.com/emails" && init?.method === "POST") {
      const key = new Headers(init.headers).get("Idempotency-Key")
      sends.push({ key, body: JSON.parse(String(init.body)) })
      const held = key ? keys.get(key) : undefined
      if (held && clock.now - held.at < KEY_LIFE_MS) {
        assert.equal(held.body, String(init.body), "a retry must repeat the exact payload")
      } else {
        if (key) keys.set(key, { body: String(init.body), at: clock.now })
        state.accepted++
      }
      if (state.loseResponses > 0) {
        state.loseResponses--
        throw new TypeError("fetch failed")
      }
      return Response.json({ id: "sent_1" })
    }
    return new Response("unexpected", { status: 599 })
  }) as typeof fetch
  return { fetch: fetchFn, calls, sends, state, clock }
}

function deps(resend: ReturnType<typeof fakeResend>, env: Record<string, string | undefined> = ENV, budgetMs?: number) {
  return { env, fetch: resend.fetch, now: () => resend.clock.now, budgetMs }
}

/** A webhook signed at the clock's current time. */
function webhookAt(clock: { now: number }): Request {
  const body = JSON.stringify({ type: "email.received", data: { email_id: EMAIL_ID, from: "alice@sender.test", subject: "Hi" } })
  return new Request("https://openaffiliate.dev/api/inbound-email", {
    method: "POST",
    headers: sign(body, String(Math.floor(clock.now / 1000))),
    body,
  })
}

test("Svix reference vector verifies (docs.svix.com manual verification example)", () => {
  const headers = {
    id: "msg_loFOjxBNrRLzqYUf",
    timestamp: "1731705121",
    signature: "v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=",
  }
  const payload = '{"event_type":"ping","data":{"success":true}}'
  assert.equal(verifySvixSignature("whsec_plJ3nmyCDGBKInavdOK15jsl", headers, payload, 1731705121_000), true)
  assert.equal(verifySvixSignature("whsec_plJ3nmyCDGBKInavdOK15jsl", headers, payload + " ", 1731705121_000), false)
  // Several signatures in the header: any one matching is enough.
  const multi = { ...headers, signature: `v1,AAAA v2,BBBB ${headers.signature}` }
  assert.equal(verifySvixSignature("whsec_plJ3nmyCDGBKInavdOK15jsl", multi, payload, 1731705121_000), true)
})

test("bad signature → 401, nothing fetched or sent", async () => {
  const resend = fakeResend()
  const forged = sign("{}", String(NOW / 1000), "msg_1", "whsec_" + Buffer.from("another-secret").toString("base64"))
  const res = await handleInboundEmail(webhook({}, "email.received", forged), deps(resend))
  assert.equal(res.status, 401)
  assert.deepEqual(resend.calls, [])
})

test("missing signature headers → 401", async () => {
  const resend = fakeResend()
  const res = await handleInboundEmail(webhook({}, "email.received", {}), deps(resend))
  assert.equal(res.status, 401)
  assert.deepEqual(resend.calls, [])
})

test("stale or future timestamp → 401", async () => {
  for (const offset of [-301, 301]) {
    const resend = fakeResend()
    const body = JSON.stringify({ type: "email.received", data: { email_id: EMAIL_ID } })
    const req = new Request("https://x.test/api/inbound-email", {
      method: "POST",
      headers: sign(body, String(NOW / 1000 + offset)),
      body,
    })
    const res = await handleInboundEmail(req, deps(resend))
    assert.equal(res.status, 401, `offset ${offset}`)
    assert.deepEqual(resend.calls, [])
  }
})

test("other event types → 200, no send", async () => {
  const resend = fakeResend()
  const res = await handleInboundEmail(webhook({}, "email.delivered"), deps(resend))
  assert.equal(res.status, 200)
  assert.deepEqual(resend.calls, [])
})

test("forwards to the fixed owner only, with tag, header block, reply-to and loop header", async () => {
  const resend = fakeResend({
    cc: ["bob@sender.test"],
    to: ["hello@openaffiliate.dev", "evil@attacker.test"],
    created_at: "2026-10-20T00:00:00.000Z",
  })
  const res = await handleInboundEmail(webhook(), deps(resend))
  assert.equal(res.status, 200)
  assert.equal(resend.sends.length, 1)
  const { key, body } = resend.sends[0]
  assert.equal(key, `oa-inbox/${EMAIL_ID}`)
  assert.equal(body.from, FORWARD_FROM)
  assert.deepEqual(body.to, [OWNER])
  assert.equal(body.cc, undefined)
  assert.equal(body.bcc, undefined)
  assert.deepEqual(body.reply_to, ["alice@sender.test"])
  assert.equal(body.subject, "[OA inbox] Hi")
  assert.deepEqual(body.headers, { [LOOP_HEADER]: EMAIL_ID })
  assert.match(String(body.text), /^---------- Received at openaffiliate\.dev ----------\nFrom: Alice <alice@sender\.test>\nTo: hello@openaffiliate\.dev, evil@attacker\.test\nCc: bob@sender\.test\nDate: 2026-10-20T00:00:00\.000Z\n\nHello$/)
  assert.match(String(body.html), /From: Alice &#60;alice@sender\.test&#62;/)
  assert.match(String(body.html), /<p>Hello<\/p>$/)
})

test("original Reply-To wins over From; header injection in the subject is flattened", async () => {
  const resend = fakeResend({ reply_to: ["support@sender.test"], subject: "Hi\r\nBcc: x@attacker.test" })
  await handleInboundEmail(webhook(), deps(resend))
  assert.deepEqual(resend.sends[0].body.reply_to, ["support@sender.test"])
  assert.equal(resend.sends[0].body.subject, "[OA inbox] Hi Bcc: x@attacker.test")
})

test("duplicate webhook delivery → one email (same Idempotency-Key, same payload)", async () => {
  const resend = fakeResend({}, [{ filename: "a.pdf", size: 1000 }])
  const first = await handleInboundEmail(webhook(), deps(resend))
  const second = await handleInboundEmail(webhook(), deps(resend))
  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  assert.equal(resend.sends.length, 2)
  assert.equal(resend.sends[0].key, resend.sends[1].key)
  assert.equal(resend.state.accepted, 1, "Resend delivers once per key")
})

test("loop guard: own-domain sender, tagged subject, or loop header → 200, no send", async () => {
  for (const data of [{ from: "inbox@openaffiliate.dev" }, { from: "x@mail.openaffiliate.dev" }, { subject: "[OA inbox] Hi" }]) {
    const resend = fakeResend()
    const res = await handleInboundEmail(webhook(data), deps(resend))
    assert.equal(res.status, 200)
    assert.deepEqual(resend.calls, [], JSON.stringify(data))
  }
  // Caught only after fetching: the header is not in the webhook payload.
  const resend = fakeResend({ headers: { from: "x@y.test", "x-oa-inbox": "abc" } })
  const res = await handleInboundEmail(webhook(), deps(resend))
  assert.equal(res.status, 200)
  assert.equal(resend.sends.length, 0)
  assert.equal(isLoop({ from: "Someone <someone@OpenAffiliate.dev>" }), true)
  assert.equal(isLoop({ from: "someone@notopenaffiliate.dev" }), false)
})

test("missing or malformed env → 500, nothing fetched or sent", async () => {
  for (const env of [
    { ...ENV, OA_INBOX_FORWARD_TO: undefined },
    { ...ENV, OA_INBOX_FORWARD_TO: "a@x.test, b@y.test" },
    { ...ENV, RESEND_INBOUND_WEBHOOK_SECRET: undefined },
    { ...ENV, OA_RESEND_API_KEY: undefined },
  ]) {
    const resend = fakeResend()
    const res = await handleInboundEmail(webhook(), deps(resend, env))
    assert.equal(res.status, 500)
    assert.deepEqual(resend.calls, [])
  }
  assert.equal(forwardAddress(" owner@example.com "), "owner@example.com")
  assert.equal(forwardAddress("Owner <owner@example.com>"), null)
})

test("attachments: included up to the cap, the rest listed by name; inline cid kept", async () => {
  const resend = fakeResend({}, [
    { filename: "logo.png", size: 2000, content_id: "img001" },
    { filename: "big.zip", size: MAX_ATTACHMENT_BYTES },
    { filename: "notes.pdf", size: 3000 },
  ])
  const res = await handleInboundEmail(webhook(), deps(resend))
  assert.equal(res.status, 200)
  const attachments = resend.sends[0].body.attachments as Record<string, string>[]
  assert.deepEqual(attachments.map((a) => a.filename), ["logo.png", "notes.pdf"])
  assert.equal(attachments[0].content_id, "img001")
  assert.equal(Buffer.from(attachments[1].content, "base64").length, 3000)
  assert.match(String(resend.sends[0].body.text), /Not attached \(limit 20 files, 10\.0 MB total\): big\.zip \(10\.0 MB\)/)
  assert.ok(!resend.calls.some((c) => c.startsWith("GET https://files.test/a1")), "the oversized file is never downloaded")
})

test("Resend failure → 500 so the webhook is retried", async () => {
  const resend = fakeResend()
  const failing = (async (input: RequestInfo | URL, init?: RequestInit) =>
    String(input).endsWith("/emails") ? new Response("{}", { status: 503 }) : resend.fetch(input, init)) as typeof fetch
  const res = await handleInboundEmail(webhook(), { env: ENV, fetch: failing, now: () => NOW })
  assert.equal(resend.state.accepted, 0)
  assert.equal(res.status, 500)
})

test("retry 2 h after a lost response → same key, one accepted send", async () => {
  const clock = { now: NOW }
  const resend = fakeResend({}, [{ filename: "a.pdf", size: 1000 }], clock)
  resend.state.loseResponses = 1
  const first = await handleInboundEmail(webhookAt(clock), deps(resend))
  assert.equal(first.status, 500, "a lost response is retried")
  clock.now = NOW + 2 * HOUR
  const retry = await handleInboundEmail(webhookAt(clock), deps(resend))
  assert.equal(retry.status, 200)
  assert.equal(resend.sends.length, 2)
  assert.equal(resend.sends[0].key, resend.sends[1].key)
  assert.equal(resend.state.accepted, 1)
})

test("retry or replay later than 23 h after receipt → 200, no send", async () => {
  for (const age of [23 * HOUR + 60_000, 27.6 * HOUR, 30 * 24 * HOUR]) {
    const clock = { now: NOW + age }
    const resend = fakeResend({}, [], clock)
    const res = await handleInboundEmail(webhookAt(clock), deps(resend))
    assert.equal(res.status, 200, `age ${age}`)
    assert.deepEqual(await res.json(), { skipped: "stale" })
    assert.equal(resend.sends.length, 0)
  }
  // The window keeps every send inside the key's life: lost response at 22 h 59, retry at 23 h 01 sends nothing.
  const clock = { now: NOW + 23 * HOUR - 60_000 }
  const resend = fakeResend({}, [], clock)
  resend.state.loseResponses = 1
  assert.equal((await handleInboundEmail(webhookAt(clock), deps(resend))).status, 500)
  clock.now = NOW + 23 * HOUR + 60_000
  assert.equal((await handleInboundEmail(webhookAt(clock), deps(resend))).status, 200)
  assert.equal(resend.state.accepted, 1)
})

test("clock skew: receipt a few minutes in our future still sends; 22 h 55 sends", async () => {
  for (const age of [-5 * 60_000, 22 * HOUR + 55 * 60_000]) {
    const clock = { now: NOW + age }
    const resend = fakeResend({}, [], clock)
    const res = await handleInboundEmail(webhookAt(clock), deps(resend))
    assert.equal(res.status, 200, `age ${age}`)
    assert.equal(resend.state.accepted, 1, `age ${age}`)
  }
})

test("missing receipt time → 500, no send", async () => {
  const resend = fakeResend({ created_at: undefined })
  const res = await handleInboundEmail(webhook(), deps(resend))
  assert.equal(res.status, 500)
  assert.equal(resend.sends.length, 0)
})

test("slow files: downloaded in parallel inside one budget", async () => {
  const files = Array.from({ length: 8 }, (_, i) => ({ filename: `f${i}.pdf`, size: 10, delayMs: 100 }))
  const resend = fakeResend({}, files)
  const started = Date.now()
  const res = await handleInboundEmail(webhook(), deps(resend, ENV, 1_000))
  const elapsed = Date.now() - started
  assert.equal(res.status, 200)
  assert.equal((resend.sends[0].body.attachments as unknown[]).length, 8)
  assert.ok(elapsed < 500, `8 × 100 ms at concurrency 4 took ${elapsed} ms`)
})

test("budget exceeded → 500 and no send with fewer files", async () => {
  const resend = fakeResend({}, [
    { filename: "fast.pdf", size: 10 },
    { filename: "slow.pdf", size: 10, delayMs: 5_000 },
  ])
  const started = Date.now()
  const res = await handleInboundEmail(webhook(), deps(resend, ENV, 200))
  assert.equal(res.status, 500)
  assert.equal(resend.sends.length, 0)
  assert.ok(Date.now() - started < 2_000, "the budget aborts the slow download")
})

test("a failed download → 500, no send", async () => {
  const resend = fakeResend({}, [{ filename: "a.pdf", size: 10 }, { filename: "b.pdf", size: 10, status: 403 }])
  const res = await handleInboundEmail(webhook(), deps(resend))
  assert.equal(res.status, 500)
  assert.equal(resend.sends.length, 0)
})

test("attachment set depends only on the listing: count cap, same payload on every retry", async () => {
  const files = Array.from({ length: 25 }, (_, i) => ({ filename: `f${String(i).padStart(2, "0")}.pdf`, size: 10, delayMs: (i % 3) * 5 }))
  const resend = fakeResend({}, files)
  await handleInboundEmail(webhook(), deps(resend))
  await handleInboundEmail(webhook(), deps(resend))
  assert.equal(resend.state.accepted, 1)
  assert.deepEqual(resend.sends[0].body, resend.sends[1].body)
  assert.equal((resend.sends[0].body.attachments as unknown[]).length, MAX_ATTACHMENTS)
  assert.match(String(resend.sends[0].body.text), /Not attached \(limit 20 files, 10\.0 MB total\): f20\.pdf \(0\.0 MB\), f21\.pdf .*f24\.pdf \(0\.0 MB\)\n/)
})
