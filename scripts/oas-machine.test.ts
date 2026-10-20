/** Tier-1 machine checks beside OAS: what the data file holds, and the same readings on every surface. */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { parse } from "yaml"
import { machineData, reading } from "./build-oas-machine"
import { programMd } from "./generate-md"
import { machineChecks, MACHINE_LABELS } from "../src/lib/oas-machine"
import { apiProgram } from "../src/lib/no-program"
import { getOasScore, oasScores, oasSummary } from "../src/lib/oas"
import { getProgram } from "../src/lib/programs"
import data from "../src/data/oas-machine.json"
import type { Result } from "./oas-tier1"

const result = (slug: string, checks: Record<string, { state: "met" | "not_met" | "unknown"; evidence?: string }>): Result =>
  ({ slug, network: "n", checkedAt: "2026-10-20T08:00:00.000Z", checks: { P1: { state: "unknown" }, P2: { state: "unknown" }, P3: { state: "unknown" }, A2: { state: "unknown" }, ...checks } })

test("data file: only A1 (met), P5 and P6, unread checks left out, readings in words", () => {
  const out = machineData([
    result("b", {
      A1: { state: "met", evidence: "https://b.test/affiliates" },
      P5: { state: "not_met", evidence: "field: LARGEST_CONTENTFUL_PAINT_MS, INTERACTION_TO_NEXT_PAINT not good" },
      P6: { state: "met", evidence: '"b": 22200/mo worldwide' },
    }),
    result("a", { A1: { state: "not_met", evidence: "HTTP 404 at https://a.test/x" }, P5: { state: "unknown", evidence: "robots.txt disallows" }, P6: { state: "not_met", evidence: '"a.com": no measurable volume' } }),
    result("c", { A1: { state: "unknown" }, P5: { state: "unknown" }, P6: { state: "unknown" } }),
    result("d", { A1: { state: "met", evidence: "https://d.test/" }, P5: { state: "unknown" }, P6: { state: "unknown" } }),
  ], "2026-10-20")
  assert.deepEqual(Object.keys(out.programs), ["a", "b"], "sorted; nothing for a program with no reading; a homepage is no program page (d)")
  assert.deepEqual(out.programs.a.checks.map((c) => c.id), ["P6"], "A1 not met and an unread P5 are left out")
  assert.deepEqual(out.programs.b, {
    measuredAt: "2026-10-20",
    checks: [
      { id: "A1", met: true, reading: "The program page answers" },
      { id: "P5", met: false, reading: "Real-user data (Chrome UX Report): LCP, INP not good" },
      { id: "P6", met: true, reading: '"b": 22,200 searches a month worldwide (Google Ads)' },
    ],
  })
  assert.equal(reading("P5", "lab: LCP 2400ms, CLS 0.05, TBT 150ms (INP proxy)"), "Lab test: LCP 2400ms, CLS 0.05, TBT 150ms, TBT standing in for INP")
  assert.equal(reading("P6", '"a.com": no measurable volume'), '"a.com": no measurable search volume (Google Ads)')
})

test("machine checks: none for an unscored program or once the reading is 90 days old", () => {
  const programs = (data as { programs: Record<string, { measuredAt: string }> }).programs
  const unscored = Object.keys(programs).find((slug) => !getOasScore(slug))
  if (unscored) assert.deepEqual(machineChecks(unscored), [], "no report, nothing to show")
  const scored = Object.keys(programs).find((slug) => getOasScore(slug))
  if (!scored) return
  const measured = new Date(`${programs[scored].measuredAt}T00:00:00Z`)
  assert.ok(machineChecks(scored, measured).length > 0)
  assert.deepEqual(machineChecks(scored, new Date(measured.getTime() + 90 * 864e5)), [], "90 days on: hidden")
  for (const c of machineChecks(scored, measured)) {
    assert.equal(c.label, MACHINE_LABELS[c.id])
    assert.equal(c.validUntil, new Date(measured.getTime() + 90 * 864e5).toISOString().slice(0, 10))
  }
  assert.ok(machineChecks(scored, new Date(measured.getTime() + 90 * 864e5 - 1)).length > 0, "shown until the day it lapses")
})

test("the report, REST/MCP and the .md twin carry the same machine checks", (t) => {
  const slug = oasScores.map((s) => s.slug).find((s) => machineChecks(s).length)
  if (!slug) return t.skip("no machine checks to show in this build")
  const checks = machineChecks(slug)
  assert.deepEqual((apiProgram(getProgram(slug)!) as { oasMachineChecks?: unknown }).oasMachineChecks, checks, "REST and MCP")
  const md = programMd(parse(readFileSync(join("programs", `${slug}.yaml`), "utf8")))
  assert.ok(md.includes("## Machine checks (not counted in OAS)"))
  for (const c of checks) assert.ok(md.includes(`${c.label}: ${c.met ? "met" : "not met"}.`) && md.includes(`valid until ${c.validUntil}`), c.id)
  // Machine checks never move the score: the OAS on REST equals the one the page shows.
  assert.equal((apiProgram(getProgram(slug)!) as { oas?: { score: number | null } }).oas?.score, oasSummary(slug)?.score)
  // A program without machine checks has neither the field nor the section.
  const none = oasScores.map((s) => s.slug).find((s) => !machineChecks(s).length && getProgram(s))
  if (none) {
    assert.ok(!("oasMachineChecks" in apiProgram(getProgram(none)!)))
    assert.doesNotMatch(programMd(parse(readFileSync(join("programs", `${none}.yaml`), "utf8"))), /## Machine checks/)
  }
})
