import assert from "node:assert/strict"
import { test } from "node:test"
import type { CaptureResult } from "posthog-js"
import { dropNoisyException } from "../src/lib/posthog-noise"
import { AFFITOR_CLICK } from "../src/lib/affitor-link"

function exception(value: string, filenames: string[]): CaptureResult {
  return {
    uuid: "00000000-0000-4000-8000-000000000001",
    event: "$exception",
    properties: {
      $exception_list: [
        {
          value,
          stacktrace: { frames: filenames.map((filename) => ({ filename })) },
        },
      ],
    },
  }
}

test("keeps a normal app exception", () => {
  const event = exception("Cannot read properties of undefined", ["https://openaffiliate.dev/_next/static/chunks/app.js"])
  assert.equal(dropNoisyException(event), event)
})

test("drops Script error, Zalo, postMessage, and extension disconnects", () => {
  assert.equal(dropNoisyException(exception("Script error.", [])), null)
  assert.equal(dropNoisyException(exception("zaloJSV2 is not defined", [])), null)
  assert.equal(dropNoisyException(exception("Error invoking postMessage: Java object is gone", [])), null)
  assert.equal(dropNoisyException(exception("Receiving end does not exist", [])), null)
})

test("drops a stack that is only the Facebook in-app browser or an extension", () => {
  assert.equal(dropNoisyException(exception("TypeError", ["iabjs://facebook/init.js"])), null)
  assert.equal(dropNoisyException(exception("TypeError", ["chrome-extension://abc/content.js"])), null)
  assert.equal(dropNoisyException(exception("TypeError", ["moz-extension://abc/content.js"])), null)
  assert.equal(dropNoisyException(exception("TypeError", ["safari-web-extension:injector.js"])), null)
})

test("keeps an app exception even when an extension frame is also on the stack", () => {
  const event = exception("Cannot read properties of undefined", [
    "chrome-extension://abc/content.js",
    "https://openaffiliate.dev/_next/static/chunks/app.js",
  ])
  assert.equal(dropNoisyException(event), event)
})

test("does not touch pageviews", () => {
  const event: CaptureResult = {
    uuid: "00000000-0000-4000-8000-000000000002",
    event: "$pageview",
    properties: {},
  }
  assert.equal(dropNoisyException(event), event)
  assert.equal(dropNoisyException(null), null)
})

test("keeps the OA → Affitor click event", () => {
  const event: CaptureResult = {
    uuid: "00000000-0000-4000-8000-000000000003",
    event: AFFITOR_CLICK,
    properties: { source: "program_page", slug: "kyma-api", cta: "apply" },
  }
  assert.equal(dropNoisyException(event), event)
})

test("submission ids never reach analytics, in any property", async () => {
  const { maskSubmissionIds } = await import("../src/lib/posthog-noise")
  const id = "0b9c2c1e-5a3f-4c7d-9e2b-1f0a8d6c4b3a"
  const event = {
    event: "$pageview",
    uuid: "u",
    properties: {
      $current_url: `https://openaffiliate.dev/submissions/${id}?x=1`,
      $pathname: `/submissions/${id}`,
      $referrer: `https://openaffiliate.dev/submissions/${id}`,
      $elements: [{ attr__href: `/submissions/${id}` }],
      $elements_chain: `a:href="/submissions/${id}"`,
      kept: "/programs/vercel",
    },
    $set_once: { $initial_referrer: `https://openaffiliate.dev/api/submissions/${id}` },
  }
  const out = maskSubmissionIds(event as never)
  assert.ok(!JSON.stringify(out).includes(id))
  assert.equal((out as typeof event).properties.kept, "/programs/vercel")
  assert.equal((out as typeof event).properties.$pathname, "/submissions/{id}")
  assert.equal(maskSubmissionIds(null), null)
})
