/** Tier-1 machine checks beside OAS: what the data file holds, and the same readings on every surface. */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { parse } from "yaml"
import { machineData, MACHINE_RULESET } from "./build-oas-machine"
import { programMd } from "./generate-md"
import { machineChecks, MACHINE_LABELS, readingOf } from "../src/lib/oas-machine"
import { apiProgram } from "../src/lib/no-program"
import { getOasScore, oasScores, oasSummary } from "../src/lib/oas"
import { getProgram } from "../src/lib/programs"
import data from "../src/data/oas-machine.json"
import type { Result } from "./oas-tier1"

const result = (slug: string, checks: Record<string, { state: "met" | "not_met" | "unknown"; evidence?: string }>): Result =>
  ({ slug, network: "n", checkedAt: "2026-10-20T08:00:00.000Z", checks: { P1: { state: "unknown" }, P2: { state: "unknown" }, P3: { state: "unknown" }, A2: { state: "unknown" }, ...checks } })
const stored = (data as unknown as { programs: Record<string, { measuredAt: string; checks: unknown[] }> }).programs

test("data file: A1 (met, listed URL not the site root), P5 and P6 with provenance; unread left out; no raw search volume", () => {
  const listing = new Map([
    ["a", { url: "https://a.test", signup_url: "https://a.test/partners" }],
    ["b", { url: "https://b.test", signup_url: "https://b.test/affiliates" }],
    ["c", { url: "https://c.test", signup_url: "https://c.test/x" }],
    ["home", { url: "https://home.test", signup_url: "https://home.test/" }],
  ])
  const out = machineData([
    result("b", {
      A1: { state: "met", evidence: "https://b.test/affiliates" },
      P5: { state: "not_met", evidence: "field: LARGEST_CONTENTFUL_PAINT_MS, INTERACTION_TO_NEXT_PAINT not good" },
      P6: { state: "met", evidence: '"b": 22200/mo worldwide' },
    }),
    result("a", { A1: { state: "not_met", evidence: "HTTP 404 at https://a.test/partners" }, P5: { state: "met", evidence: "lab: LCP 2400ms, CLS 0.05, TBT 150ms (INP proxy)" }, P6: { state: "not_met", evidence: '"a.com": no measurable volume' } }),
    result("c", { A1: { state: "unknown" }, P5: { state: "unknown" }, P6: { state: "unknown" } }),
    // The listed URL is the homepage; the scanner followed its redirect to /en-us and saw a 200.
    result("home", { A1: { state: "met", evidence: "https://home.test/en-us" }, P5: { state: "unknown" }, P6: { state: "unknown" } }),
    result("not-listed", { A1: { state: "met", evidence: "https://x.test/p" } }),
  ], listing, "2026-10-20")
  assert.deepEqual(Object.keys(out.programs), ["a", "b"], "sorted; nothing without a reading, for a homepage, or unlisted")
  assert.deepEqual(out.programs.b, {
    measuredAt: "2026-10-20", ruleset: MACHINE_RULESET,
    checks: [
      { id: "A1", met: true, target: "https://b.test/affiliates", measurement: { status: 200 } },
      { id: "P5", met: false, target: "https://b.test", measurement: { data: "field", notGood: ["LCP", "INP"] } },
      { id: "P6", met: true, target: "b", measurement: { scope: "worldwide", threshold: 1000, reached: true } },
    ],
  })
  assert.deepEqual(out.programs.a.checks.map((c) => c.id), ["P5", "P6"], "A1 not met is left out")
  assert.deepEqual(out.programs.a.checks[0].measurement, { data: "lab", lcpMs: 2400, cls: 0.05, tbtMs: 150 })
  assert.doesNotMatch(JSON.stringify(out), /22200|22,200/, "the provider's volume is not stored")
})

test("readings in words name their data and thresholds", () => {
  assert.equal(readingOf({ id: "P5", met: false, target: "https://b.test", measurement: { data: "field", notGood: ["LCP"] } }), "Real-user data (Chrome UX Report, last 28 days): LCP not in the good range")
  assert.match(readingOf({ id: "P5", met: true, target: "https://a.test", measurement: { data: "lab", lcpMs: 2400, cls: 0.05, tbtMs: 150 } }), /^Lab test, no real-user data \(thresholds LCP ≤ 2,500 ms, CLS ≤ 0.1, TBT ≤ 200 ms standing in for INP\): LCP 2,400 ms/)
  assert.equal(readingOf({ id: "P6", met: false, target: "a.com", measurement: { scope: "worldwide", threshold: 1000, reached: false } }), 'Estimated searches for "a.com" (Google Ads, worldwide): under 1,000 a month')
})

test("machine checks: none for an unscored program, an invalid date, or from the day the reading lapses", () => {
  const unscored = Object.keys(stored).find((slug) => !getOasScore(slug))
  if (unscored) assert.deepEqual(machineChecks(unscored), [], "no report, nothing to show")
  const scored = Object.keys(stored).find((slug) => getOasScore(slug))
  if (!scored) return
  const measuredAt = stored[scored].measuredAt
  const measured = new Date(`${measuredAt}T00:00:00Z`)
  const lapse = new Date(measured.getTime() + 90 * 864e5)
  assert.ok(machineChecks(scored, measured).length > 0)
  for (const c of machineChecks(scored, measured)) {
    assert.equal(c.label, MACHINE_LABELS[c.id])
    assert.equal(c.validUntil, lapse.toISOString().slice(0, 10))
  }
  assert.ok(machineChecks(scored, new Date(lapse.getTime() - 1)).length > 0, "shown until the day it lapses")
  assert.deepEqual(machineChecks(scored, lapse), [], "lapsed from that day")
  // Output cached for a day (the report revalidates daily) drops it a day early, so no cached copy outlives it.
  assert.deepEqual(machineChecks(scored, new Date(lapse.getTime() - 864e5), 1), [])
  assert.ok(machineChecks(scored, new Date(lapse.getTime() - 864e5 - 1), 1).length > 0)
  try {
    for (const bad of ["not-a-date", "2026-13-40", "2026-02-30", ""]) {
      stored[scored].measuredAt = bad
      assert.deepEqual(machineChecks(scored, measured), [], `measuredAt ${JSON.stringify(bad)}`)
    }
  } finally {
    stored[scored].measuredAt = measuredAt
  }
})

test("the report, REST/MCP and the .md twin carry the same machine checks; the OAS score is untouched", (t) => {
  const slug = oasScores.map((s) => s.slug).find((s) => machineChecks(s).length)
  if (!slug) return t.skip("no machine checks to show in this build")
  const checks = machineChecks(slug)
  assert.deepEqual((apiProgram(getProgram(slug)!) as { oasMachineChecks?: unknown }).oasMachineChecks, checks, "REST and MCP")
  assert.equal((apiProgram(getProgram(slug)!) as { oas?: { score: number | null } }).oas?.score, oasSummary(slug)?.score)
  const md = programMd(parse(readFileSync(join("programs", `${slug}.yaml`), "utf8")))
  assert.ok(md.includes("## Machine checks (not counted in OAS)"))
  for (const c of checks) assert.ok(md.includes(`${c.label}: ${c.met ? "met" : "not met"}.`) && md.includes(`valid until ${c.validUntil}`), c.id)
  const none = oasScores.map((s) => s.slug).find((s) => !machineChecks(s).length && getProgram(s))
  if (none) {
    assert.ok(!("oasMachineChecks" in apiProgram(getProgram(none)!)))
    assert.doesNotMatch(programMd(parse(readFileSync(join("programs", `${none}.yaml`), "utf8"))), /## Machine checks/)
  }
})
