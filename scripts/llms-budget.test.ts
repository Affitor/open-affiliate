/**
 * llms.txt growth: what makes the fetch-once index bigger, and by how much.
 *
 * Builds the index in memory from the current registry, then grows one input
 * at a time and measures the bytes. Run after `npm run build` (prebuild
 * regenerates the registry), with
 * `npx tsx --test --test-force-exit scripts/llms-budget.test.ts`.
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { liveNetworks, programs } from "../src/lib/programs"
import { llmsTxt } from "./generate-md"
import { LLMS_MAX_BYTES } from "./llms-budget"

const bytes = (s: string) => Buffer.byteLength(s)

function lines(text: string, path: string): string[] {
  return text.split("\n").filter(l => l.startsWith("- [") && l.includes(path))
}

test("the index is under the cap today", () => {
  const size = bytes(llmsTxt())
  assert.ok(size <= LLMS_MAX_BYTES, `llms.txt is ${size} bytes; the cap is ${LLMS_MAX_BYTES}`)
})

test("verifying every program does not grow the verified section", () => {
  const before = llmsTxt()
  const saved = programs.map(p => p.verified)
  try {
    for (const p of programs) p.verified = true
    const after = llmsTxt()
    const rows = (t: string) => t.split("\n## ").find(s => s.startsWith("Verified programs"))!.split("\n").filter(l => l.startsWith("- ")).length
    assert.equal(rows(after), rows(before), "the inline sample must stay the same size")
    assert.ok(bytes(after) <= LLMS_MAX_BYTES, `all verified: ${bytes(after)} bytes`)
  } finally {
    programs.forEach((p, i) => (p.verified = saved[i]))
  }
})

test("each new network adds one bounded line; report the headroom", () => {
  const base = llmsTxt()
  const extra = Array.from({ length: 10 }, (_, i) => `growthnet-${i}`)
  liveNetworks.push(...extra)
  try {
    const grown = llmsTxt()
    assert.equal(lines(grown, "/networks/").length, lines(base, "/networks/").length + extra.length)
    const perLine = (bytes(grown) - bytes(base)) / extra.length
    // A network line is a name, a link and a count: well under 100 bytes for a
    // network name of today's length (partnerstack, 12 characters).
    assert.ok(perLine < 100, `a network line costs ${perLine} bytes`)
    const fit = Math.floor((LLMS_MAX_BYTES - bytes(base)) / perLine)
    console.log(`llms.txt ${bytes(base)}/${LLMS_MAX_BYTES} bytes · ${perLine.toFixed(0)} B a network · room for ${fit} more`)
  } finally {
    liveNetworks.splice(liveNetworks.length - extra.length, extra.length)
  }
  assert.equal(llmsTxt(), base, "restoring the networks restores the index")
})
