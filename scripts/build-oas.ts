/**
 * Writes src/lib/oas-scores.json from programs/*.yaml (run first in prebuild,
 * before build-registry.ts, which ships each score to the browser, and
 * generate-md.ts). It reads the YAML files themselves, not the mapped programs
 * or the committed registry.json (spec 7b.1).
 *
 * While OAS_PUBLISHED is false it writes [], so no surface shows OAS. Publishing
 * after the correctness gate, and rolling back, are each this one line.
 *
 *   npx tsx scripts/build-oas.ts             the served file
 *   npx tsx scripts/build-oas.ts --dry-run   every score to .internal/oas/dry-run.json, for the gate; the served file is not touched
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { parse } from "yaml"
import { scoreAll, type ProgramYaml } from "../src/lib/oas-v1"

const OAS_PUBLISHED = true

const root = process.cwd()

/** Scored only when needed: an unpublished build writes [] without running the scorer. */
function scores() {
  const dir = join(root, "programs")
  const programs = readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => parse(readFileSync(join(dir, f), "utf8")) as ProgramYaml)
  return scoreAll(programs, new Date())
}

if (process.argv.includes("--dry-run")) {
  const all = scores()
  const out = join(root, ".internal", "oas", "dry-run.json")
  mkdirSync(join(root, ".internal", "oas"), { recursive: true })
  writeFileSync(out, JSON.stringify(all, null, 2) + "\n")
  console.log(`OAS dry run: ${all.length} programs scored, ${all.filter((s) => s.oas != null).length} with a number → ${out}`)
} else {
  const served = OAS_PUBLISHED ? scores() : []
  writeFileSync(join(root, "src", "lib", "oas-scores.json"), JSON.stringify(served, null, 2) + "\n")
  console.log(OAS_PUBLISHED ? `OAS: ${served.length} programs scored` : "OAS: not published (OAS_PUBLISHED is false), wrote []")
}
