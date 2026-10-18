/**
 * Programs built by the team behind OpenAffiliate (src/lib/same-team.ts) are
 * never suggested, and wherever they are listed they say so. Reads
 * src/lib/registry.json, so run it after build-registry (CI runs it after
 * `npm run build`, whose prebuild does that).
 *
 * Run with `npx tsx --test --test-force-exit scripts/same-team.test.ts`.
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import registry from "../src/lib/registry.json"
import { getRelatedPrograms } from "../src/components/related-programs"
import { getProgram, isLive, programs } from "../src/lib/programs"
import { SAME_TEAM, SAME_TEAM_SLUGS } from "../src/lib/same-team"
import { programMd } from "./generate-md"

type Entry = Parameters<typeof programMd>[0]

test("every same-team slug is a live, verified program in the registry", () => {
  for (const slug of SAME_TEAM_SLUGS) {
    const p = getProgram(slug)
    assert.ok(p && isLive(p) && p.verified, slug)
  }
})

test("no program page suggests a same-team program under How X compares", () => {
  // /programs/shortcut-chat suggested Kyma API with no same-team line (18/10).
  for (const p of programs.filter(isLive)) {
    const related = getRelatedPrograms(p, programs.length)
    assert.equal(related.some((r) => SAME_TEAM_SLUGS.has(r.slug)), false, p.slug)
  }
})

test("a same-team program's .md states the same-team sentence; others do not", () => {
  const entries = registry.programs as Entry[]
  for (const slug of SAME_TEAM_SLUGS) {
    const entry = entries.find((p) => p.slug === slug)!
    assert.ok(programMd(entry).includes(SAME_TEAM), slug)
  }
  const other = entries.find((p) => !SAME_TEAM_SLUGS.has(p.slug) && (p.status ?? "active") === "active")!
  assert.equal(programMd(other).includes(SAME_TEAM), false)
})
