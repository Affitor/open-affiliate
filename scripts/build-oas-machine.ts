/**
 * Writes src/data/oas-machine.json from a tier-1 scanner dry run:
 *
 *   npx tsx scripts/build-oas-machine.ts .internal/oas/tier1/dry-run.json
 *
 * The file is committed on purpose, unlike the registry JSON: its readings are
 * measurements (HTTP, PageSpeed, DataForSEO) that no build can derive from the
 * YAML, and each refresh is reviewed as one file. Only the checks that passed
 * the blind sample go in (A1, P5, P6); A1 only when met, until the data lane has
 * fixed the program URLs that answer 404 (a wrong URL in YAML is not the brand's
 * page being down), and never when the program URL is the site root (a homepage
 * answering is not a program page). An unread page writes nothing for that check.
 */
import { readFileSync, writeFileSync } from "node:fs"
import type { Result } from "./oas-tier1"

const METRIC: Record<string, string> = { LARGEST_CONTENTFUL_PAINT_MS: "LCP", INTERACTION_TO_NEXT_PAINT: "INP", CUMULATIVE_LAYOUT_SHIFT_SCORE: "CLS" }

/** The scanner's evidence as a reader-facing line. */
export function reading(id: "A1" | "P5" | "P6", evidence: string): string {
  if (id === "A1") return "The program page answers"
  if (id === "P5") {
    const metrics = (s: string) => s.replace(/[A-Z_]+/g, (k) => METRIC[k] ?? k)
    if (evidence.startsWith("field: ")) return `Real-user data (Chrome UX Report): ${metrics(evidence.slice(7))}`
    if (evidence.startsWith("lab: ")) return `Lab test: ${evidence.slice(5).replace(" (INP proxy)", ", TBT standing in for INP")}`
    return evidence
  }
  const m = /^"([^"]+)": (\d+)\/mo worldwide$/.exec(evidence)
  if (m) return `"${m[1]}": ${Number(m[2]).toLocaleString("en-US")} searches a month worldwide (Google Ads)`
  const none = /^"([^"]+)": no measurable volume$/.exec(evidence)
  return none ? `"${none[1]}": no measurable search volume (Google Ads)` : evidence
}

/** A program URL that is the site root is the homepage, not a program page (the sample's one A1 miss). */
function atSiteRoot(url: string | undefined): boolean {
  try {
    return new URL(url ?? "").pathname.replace(/\/+$/, "") === ""
  } catch {
    return true
  }
}

export function machineData(results: Result[], generatedAt: string) {
  const programs: Record<string, { measuredAt: string; checks: { id: "A1" | "P5" | "P6"; met: boolean; reading: string }[] }> = {}
  for (const r of [...results].sort((a, b) => a.slug.localeCompare(b.slug))) {
    const checks = (["A1", "P5", "P6"] as const)
      .filter((id) => r.checks[id] && r.checks[id].state !== "unknown" && (id !== "A1" || (r.checks[id].state === "met" && !atSiteRoot(r.checks[id].evidence))))
      .map((id) => ({ id, met: r.checks[id].state === "met", reading: reading(id, r.checks[id].evidence ?? "") }))
    if (checks.length) programs[r.slug] = { measuredAt: r.checkedAt.slice(0, 10), checks }
  }
  return { generatedAt, programs }
}

if (process.argv[1]?.endsWith("build-oas-machine.ts")) {
  const path = process.argv[2]
  if (!path) throw new Error("usage: npx tsx scripts/build-oas-machine.ts <tier-1 dry-run.json>")
  const out = machineData(JSON.parse(readFileSync(path, "utf8")), new Date().toISOString().slice(0, 10))
  // One program per line: a refresh reviews as a per-program diff without the bulk of full indentation.
  const lines = Object.entries(out.programs).map(([slug, entry]) => `  ${JSON.stringify(slug)}: ${JSON.stringify(entry)}`)
  writeFileSync("src/data/oas-machine.json", `{\n "generatedAt": ${JSON.stringify(out.generatedAt)},\n "programs": {\n${lines.join(",\n")}\n }\n}\n`)
  console.log(`oas-machine: ${Object.keys(out.programs).length} programs`)
}
