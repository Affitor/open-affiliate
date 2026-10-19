import assert from "node:assert/strict"
import { test } from "node:test"
import { createdAtProblems } from "./created-at-rules"

test("missing or invalid created_at is rejected", () => {
  for (const created_at of [undefined, null, "", "today", "2026-02-30", "2026-13-01", "2026-1-01", 20261018]) assert.ok(createdAtProblems({ created_at }).length, String(created_at))
})
test("existing created_at cannot change or disappear", () => {
  for (const created_at of [undefined, "2026-10-19"]) assert.ok(createdAtProblems({ created_at }, { created_at: "2026-10-18" }).includes("existing created_at must not change"))
  assert.deepEqual(createdAtProblems({ created_at: "2026-10-18" }, { created_at: "2026-10-18" }), [])
  assert.deepEqual(createdAtProblems({ created_at: "2026-04-18" }, {}), [])
})
