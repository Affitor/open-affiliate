import assert from "node:assert/strict"
import { test } from "node:test"
import type { CaptureResult } from "posthog-js"
import { dropNoisyException } from "../src/lib/posthog-noise"

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
