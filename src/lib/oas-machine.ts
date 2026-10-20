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
  P6: "Estimated brand search volume",
}

type Measurement =
  | { status: 200 }
  | { data: "field"; notGood: string[] }
  | { data: "lab"; lcpMs: number; cls: number; tbtMs: number }
  | { scope: "worldwide"; threshold: number; reached: boolean }

export interface MachineCheck {
  id: MachineCheckId
  label: string
  met: boolean
  /** The reading in words, naming its data and thresholds. */
  reading: string
  /** http (A1), pagespeed (P5) or dataforseo (P6). */
  source: "http" | "pagespeed" | "dataforseo"
  /** What was measured: the listed program URL, the brand URL, or the exact search query. */
  target: string
  measurement: Measurement
  /** The rule set that produced the reading. */
  ruleset: string
  measuredAt: string
  /** The day the reading lapses (measuredAt + 90 days); written-at-build surfaces name it. */
  validUntil: string
}

type Stored = { id: MachineCheckId; met: boolean; target: string; measurement: Measurement }
type Entry = { measuredAt: string; ruleset: string; checks: Stored[] }

const SOURCE: Record<MachineCheckId, MachineCheck["source"]> = { A1: "http", P5: "pagespeed", P6: "dataforseo" }
const SOURCE_NAME: Record<MachineCheck["source"], string> = { http: "HTTP request", pagespeed: "PageSpeed Insights (mobile)", dataforseo: "DataForSEO (Google Ads estimate)" }

/** Where a reading comes from, on what, under which rule: one line every surface prints the same way. */
export function provenanceOf(c: Pick<MachineCheck, "source" | "target" | "ruleset">): string {
  return `Source: ${SOURCE_NAME[c.source]} · ${c.source === "dataforseo" ? `query "${c.target}"` : c.target} · rule ${c.ruleset}`
}

/** The reading in words, from the typed measurement: it names its data and thresholds. */
export function readingOf(c: Stored): string {
  const m = c.measurement
  if ("status" in m) return "The listed program page answers (HTTP 200)"
  if ("data" in m && m.data === "field") {
    return m.notGood.length
      ? `Real-user data (Chrome UX Report, last 28 days): ${m.notGood.join(", ")} not in the good range`
      : "Real-user data (Chrome UX Report, last 28 days): LCP, INP and CLS in the good range"
  }
  if ("data" in m) {
    return `Lab test, no real-user data (thresholds LCP ≤ 2,500 ms, CLS ≤ 0.1, TBT ≤ 200 ms standing in for INP): LCP ${m.lcpMs.toLocaleString("en-US")} ms, CLS ${m.cls}, TBT ${m.tbtMs} ms`
  }
  const threshold = m.threshold.toLocaleString("en-US")
  return `Estimated searches for "${c.target}" (Google Ads, worldwide): ${m.reached ? `${threshold} or more a month` : `under ${threshold} a month`}`
}
const programs = (data as unknown as { programs: Record<string, Entry> }).programs

/** A real calendar date in YYYY-MM-DD form; anything else hides the reading. */
const validDate = (d: unknown): d is string =>
  typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) &&
  new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d

/**
 * The machine checks a program's OAS report shows: none when unpublished, when the
 * program has no OAS entry (no report to show them on; with OAS unpublished there
 * are none), when the measured date is not a real date, or from the day the reading
 * lapses. `horizonDays` hides it that many days earlier, for output cached that long
 * (the report revalidates daily). They never enter the OAS number, its grade or the ranking.
 */
export function machineChecks(slug: string, today: Date = new Date(), horizonDays = 0): MachineCheck[] {
  if (!TIER1_PUBLISHED || !getOasScore(slug)) return []
  const entry = programs[slug]
  if (!entry || !validDate(entry.measuredAt)) return []
  if (isStale(entry.measuredAt, new Date(today.getTime() + horizonDays * 864e5))) return []
  const validUntil = lapseDate(entry.measuredAt)!
  return entry.checks.map((c) => ({
    id: c.id, label: MACHINE_LABELS[c.id], met: c.met, reading: readingOf(c), source: SOURCE[c.id], target: c.target,
    measurement: c.measurement, ruleset: entry.ruleset, measuredAt: entry.measuredAt, validUntil,
  }))
}
