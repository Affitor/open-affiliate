/**
 * Writes src/data/oas-machine.json from a tier-1 scanner dry run:
 *
 *   npx tsx scripts/build-oas-machine.ts .internal/oas/tier1/dry-run.json
 *
 * The file is committed on purpose, unlike the registry JSON: its readings are
 * measurements (HTTP, PageSpeed, DataForSEO) that no build can derive from the
 * YAML, and each refresh is reviewed as one file. Only the checks that passed
 * the blind sample go in (A1, P5, P6), each with its source, target and typed
 * measurement. A1 only when met, and never when the listed program URL is the
 * site root (a homepage answering is not a program page); the 404s wait for the
 * data lane (a wrong URL in YAML is not the brand's page being down). P6 keeps
 * only whether the estimate reaches the threshold, not the provider's volume.
 * An unread page writes nothing for that check.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { loadProgram, P6_MIN_VOLUME, type Result } from "./oas-tier1"

/** Bumped whenever a check's rule changes, so a reading names the rule that made it. */
export const MACHINE_RULESET = "tier1-v1"

const METRIC: Record<string, string> = { LARGEST_CONTENTFUL_PAINT_MS: "LCP", INTERACTION_TO_NEXT_PAINT: "INP", CUMULATIVE_LAYOUT_SHIFT_SCORE: "CLS" }

/** What the file stores per check; the reading in words and the source are built from it (src/lib/oas-machine.ts). */
export type MachineEntryCheck =
  | { id: "A1"; met: true; target: string; measurement: { status: 200 } }
  | { id: "P5"; met: boolean; target: string; measurement: { data: "field"; notGood: string[] } | { data: "lab"; lcpMs: number; cls: number; tbtMs: number } }
  | { id: "P6"; met: boolean; target: string; measurement: { scope: "worldwide"; threshold: number; reached: boolean } }

/** A1, or null when it is not to be shown. The listed URL decides: a homepage that redirects to /en-us is still a homepage. */
function a1(listed: string | null | undefined): MachineEntryCheck | null {
  if (!listed || atSiteRoot(listed)) return null
  return { id: "A1", met: true, target: listed, measurement: { status: 200 } }
}

function p5(met: boolean, evidence: string, brandUrl: string | null | undefined): MachineEntryCheck | null {
  if (!brandUrl) return null
  const field = /^field: (.+?) (not good|good)$/.exec(evidence)
  if (field) {
    const named = field[1].split(", ").map((k) => METRIC[k] ?? k)
    const notGood = field[2] === "not good" ? named : []
    return { id: "P5", met, target: brandUrl, measurement: { data: "field", notGood } }
  }
  const lab = /^lab: LCP (\d+)ms, CLS ([\d.]+), TBT (\d+)ms/.exec(evidence)
  if (lab) {
    return { id: "P5", met, target: brandUrl, measurement: { data: "lab", lcpMs: Number(lab[1]), cls: Number(lab[2]), tbtMs: Number(lab[3]) } }
  }
  return null
}

function p6(met: boolean, evidence: string): MachineEntryCheck | null {
  const query = /^"([^"]+)": /.exec(evidence)?.[1]
  if (!query) return null
  return { id: "P6", met, target: query, measurement: { scope: "worldwide", threshold: P6_MIN_VOLUME, reached: met } }
}

/** A URL that is the site root: the homepage, not a program page. */
function atSiteRoot(url: string): boolean {
  try {
    return new URL(url).pathname.replace(/\/+$/, "") === ""
  } catch {
    return true
  }
}

export function machineData(results: Result[], listing: Map<string, { url?: string | null; signup_url?: string | null }>, generatedAt: string) {
  const programs: Record<string, { measuredAt: string; ruleset: string; checks: MachineEntryCheck[] }> = {}
  for (const r of [...results].sort((a, b) => a.slug.localeCompare(b.slug))) {
    const p = listing.get(r.slug)
    if (!p) continue
    const state = (id: string) => r.checks[id]?.state
    const evidence = (id: string) => r.checks[id]?.evidence ?? ""
    const read = (id: string) => state(id) === "met" || state(id) === "not_met"
    const checks = [
      state("A1") === "met" ? a1(p.signup_url) : null,
      read("P5") ? p5(state("P5") === "met", evidence("P5"), p.url) : null,
      read("P6") ? p6(state("P6") === "met", evidence("P6")) : null,
    ].filter((c): c is MachineEntryCheck => c != null)
    if (checks.length) programs[r.slug] = { measuredAt: r.checkedAt.slice(0, 10), ruleset: MACHINE_RULESET, checks }
  }
  return { generatedAt, programs }
}

if (process.argv[1]?.endsWith("build-oas-machine.ts")) {
  const path = process.argv[2]
  if (!path) throw new Error("usage: npx tsx scripts/build-oas-machine.ts <tier-1 dry-run.json>")
  const results: Result[] = JSON.parse(readFileSync(path, "utf8"))
  const listing = new Map<string, { url?: string | null; signup_url?: string | null }>()
  for (const r of results) {
    const p = loadProgram(join("programs", `${r.slug}.yaml`))
    if (!("error" in p)) listing.set(r.slug, p)
  }
  const out = machineData(results, listing, new Date().toISOString().slice(0, 10))
  // One program per line: a refresh reviews as a per-program diff without the bulk of full indentation.
  const lines = Object.entries(out.programs).map(([slug, entry]) => `  ${JSON.stringify(slug)}: ${JSON.stringify(entry)}`)
  writeFileSync("src/data/oas-machine.json", `{\n "generatedAt": ${JSON.stringify(out.generatedAt)},\n "programs": {\n${lines.join(",\n")}\n }\n}\n`)
  console.log(`oas-machine: ${Object.keys(out.programs).length} programs`)
}
