import assert from "node:assert/strict"
import { test } from "node:test"
import { offScale } from "./check-type-scale"

test("on-scale sizes pass", () => {
  assert.deepEqual(offScale('<p className="text-xs text-sm text-base text-lg text-meta text-title text-[13px] text-[2.125rem] md:text-display" />'), [])
})

test("hand-set and off-scale named sizes are counted", () => {
  assert.deepEqual(offScale('<p className="text-[10px] md:text-2xl text-xl text-[2.75rem]" />'), ["text-[10px]", "text-[2.75rem]", "text-2xl (24px)", "text-xl (20px)"])
})

test("colour and alignment classes are not sizes", () => {
  assert.deepEqual(offScale('<p className="text-xl-foo text-muted-foreground text-left text-[var(--x)]" />'), [])
})
