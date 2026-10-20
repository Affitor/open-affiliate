import data from "@/data/oas-machine.json"
import { getOasScore, isStale, lapseDate } from "./oas"

/**
 * Tier-1 machine checks (OAS v2 groundwork), shown beside OAS and never counted
 * in it. Only the checks that passed the blind sample (.internal/oas/tier1/
 * SAMPLE-40.md: A1 97%, P5 100%, P6 100%) are in the data file; the others stay
 * out until they pass a fresh sample. Set false to hide every surface at once.
 */
export const TIER1_PUBLISHED = true

export type MachineCheckId = "A1" | "P5" | "P6"
export const MACHINE_LABELS: Record<MachineCheckId, string> = {
  A1: "Program page is live",
  P5: "Core Web Vitals (mobile)",
  P6: "Buyer search demand",
}

export interface MachineCheck {
  id: MachineCheckId
  label: string
  met: boolean
  reading: string
  measuredAt: string
  /** The day the reading lapses (measuredAt + 90 days); written-at-build surfaces name it. */
  validUntil: string
}

type Entry = { measuredAt: string; checks: { id: MachineCheckId; met: boolean; reading: string }[] }
const programs = (data as { programs: Record<string, Entry> }).programs

/**
 * The machine checks a program's OAS report shows: none when unpublished, when the
 * program has no OAS entry (no report to show them on; with OAS unpublished there
 * are none), or when the reading is 90 days old or more (the same rule as OAS
 * terms). They never enter the OAS number, its grade or the ranking.
 */
export function machineChecks(slug: string, today: Date = new Date()): MachineCheck[] {
  if (!TIER1_PUBLISHED || !getOasScore(slug)) return []
  const entry = programs[slug]
  if (!entry || isStale(entry.measuredAt, today)) return []
  const validUntil = lapseDate(entry.measuredAt)!
  return entry.checks.map((c) => ({ id: c.id, label: MACHINE_LABELS[c.id], met: c.met, reading: c.reading, measuredAt: entry.measuredAt, validUntil }))
}
