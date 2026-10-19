/**
 * OAS v1 scorer: a pure function of one program's YAML, so the same YAML always
 * gives the same number. It reads the raw YAML, never the mapped Program
 * (programs.ts turns a null `restrictions` into [], which v1 reads as "the brand
 * says there are none"). Only verified, live affiliate programs are scored.
 * A term that is absent counts as Not published only when the data lane wrote a
 * `not_published` marker for it after reading the brand's pages; absent with no
 * marker, the check is not assessed yet (Checking), and the program has no
 * number until every check is assessed: thin YAML never earns free points, and
 * our missing work never costs a brand any. The first gate found unmarked
 * absences wrong 40-93% of the time. Only a check held out for every program
 * after a gate (HELD_OUT) has its points spread inside its part. The rules are
 * stated on /methodology#oas.
 */
import { FREQUENCIES, PAYOUT_METHODS } from "./claims/form"
import { CHECK_IDS, CHECKS, isStale, OAS_VERSION, PAIRS, PART_MAX, round1, type CheckState, type OasCheck, type OasScore, type Part } from "./oas"

/** The YAML keys v1 reads. */
export interface ProgramYaml {
  slug: string
  kind?: string
  verified?: boolean
  status?: string
  last_verified_at?: string | null
  signup_url?: string | null
  commission: { type?: string; rate?: string | number; duration?: string | null }
  cookie_days?: number
  cookie_lifetime?: boolean
  payout?: { minimum?: number; currency?: string; frequency?: string; methods?: string[] } | null
  approval?: string
  restrictions?: string[] | null
  conflicts?: { field: string; quote: string }[] | null
  /** Terms the brand does not publish, each with the date its pages were read. */
  not_published?: Record<string, string> | null
}

/** USD per unit, frozen for v1 (ECB 2026-10-16). Another currency leaves V2 Checking. */
export const FX_USD: Record<string, number> = { USD: 1, EUR: 1.08, GBP: 1.29, CAD: 0.72, AUD: 0.65, CHF: 1.15 }

/** v1 policy values: the median cookie and minimum of verified programs, and the common schedule. */
export const COOKIE_DAYS_MIN = 60
export const MINIMUM_USD_MAX = 50
const AT_LEAST_MONTHLY = new Set(["daily", "weekly", "bi-weekly", "twice-monthly", "monthly", "on-request", "net-30"])

/** Checks the correctness gate held out (spec §4): shown as Not assessed, their points spread over the rest of their part. */
export const HELD_OUT: string[] = []

/** Scored: verified, live, a commission program (not a credit referral). Everything else gets no OAS entry. */
export function isScored(p: ProgramYaml): boolean {
  return p.verified === true && (p.status ?? "active") === "active" && (p.kind ?? "affiliate") === "affiliate"
}

const APPROVAL: Record<string, string> = { auto: "Automatic", manual: "After a review", "invite-only": "By invitation" }
const label = (list: [string, string][], v: string) => list.find(([k]) => k === v)?.[1] ?? v
const money = (n: number, currency: string) => (n === 0 ? "No minimum" : currency === "USD" ? `$${n}` : `${currency} ${n}`)
const days = (p: ProgramYaml) => (p.cookie_lifetime ? "Lifetime" : p.cookie_days === 0 ? "0 days (code-based, no cookie)" : `${p.cookie_days} days`)

type Result = { state: Exclude<CheckState, "held_out">; fact?: string }

/** Each check's state from the YAML alone, before conflicts and hold-outs. */
function judge(id: string, p: ProgramYaml): Result {
  const pay = p.payout ?? {}
  const hasCookie = typeof p.cookie_days === "number" || p.cookie_lifetime === true
  const currency = pay.currency ?? "USD"
  switch (id) {
    case "T1": {
      const rate = p.commission.rate == null ? "" : String(p.commission.rate)
      return p.commission.type && /\d/.test(rate) ? { state: "met", fact: rate } : { state: "not_met", fact: rate ? `"${rate}", no number` : undefined }
    }
    case "T2":
      if (p.commission.type === "one-time") return { state: "met", fact: "One-time" }
      return p.commission.duration ? { state: "met", fact: p.commission.duration } : { state: "not_public" }
    case "T3":
      return hasCookie ? { state: "met", fact: days(p) } : { state: "not_public" }
    case "T4":
      return typeof pay.minimum === "number" ? { state: "met", fact: money(pay.minimum, currency) } : { state: "not_public" }
    case "T5":
      return pay.methods?.length ? { state: "met", fact: pay.methods.map((m) => label(PAYOUT_METHODS, m)).join(", ") } : { state: "not_public" }
    case "T6":
      return pay.frequency ? { state: "met", fact: label(FREQUENCIES, pay.frequency) } : { state: "not_public" }
    case "T7":
      return p.approval ? { state: "met", fact: APPROVAL[p.approval] ?? p.approval } : { state: "not_public" }
    case "T8":
      if (!Array.isArray(p.restrictions)) return { state: "not_public" }
      return { state: "met", fact: p.restrictions.length ? `${p.restrictions.length} rule${p.restrictions.length > 1 ? "s" : ""}` : "None, the program says" }
    case "V1":
      if (!hasCookie) return { state: "not_public" }
      return { state: p.cookie_lifetime || p.cookie_days! >= COOKIE_DAYS_MIN ? "met" : "not_met", fact: days(p) }
    case "V2": {
      if (typeof pay.minimum !== "number") return { state: "not_public" }
      const fact = money(pay.minimum, currency)
      const fx = FX_USD[currency]
      if (fx == null) return { state: "checking", fact: `${fact}: currency not supported yet` }
      // Compared unrounded: EUR 46.30 is USD 50.004, over the line.
      return { state: pay.minimum * fx <= MINIMUM_USD_MAX ? "met" : "not_met", fact }
    }
    case "V3":
      if (!pay.frequency) return { state: "not_public" }
      return { state: AT_LEAST_MONTHLY.has(pay.frequency) ? "met" : "not_met", fact: label(FREQUENCIES, pay.frequency) }
  }
  throw new Error(`unknown OAS check ${id}`)
}

/**
 * The OAS entry for one scored program. A review older than 90 days is
 * Scoring in progress: every check Checking, no number, nothing counted
 * against the brand while we re-verify.
 */
export function scoreProgram(p: ProgramYaml, today: Date, heldOut: string[] = HELD_OUT): OasScore {
  const checked_at = p.last_verified_at ?? ""
  const stale = isStale(checked_at, today)
  const conflicts = new Map((p.conflicts ?? []).map((c) => [c.field, c.quote]))

  const states = new Map<string, OasCheck>()
  const absent = new Set<string>()
  for (const id of CHECK_IDS) {
    const conflict = conflicts.get(CHECKS[id].field) ?? null
    const r: Result = stale ? { state: "checking" } : conflict ? { state: "not_met" } : judge(id, p)
    if (r.state === "not_public") {
      // Absent: Not published only with the data lane's marker; otherwise not assessed yet (Checking: no number).
      absent.add(id)
      const marked = p.not_published?.[CHECKS[id].field]
      states.set(id, marked ? { id, state: "not_public", max: 0, points: 0, checked: String(marked) } : { id, state: "checking", max: 0, points: 0 })
      continue
    }
    states.set(id, { id, state: r.state, max: 0, points: 0, ...(r.fact ? { fact: r.fact } : {}), ...(conflict && !stale ? { conflict } : {}) })
  }
  // A held-out T check takes its V pair with it where the term is absent: the V check would only repeat the unverified absence.
  for (const id of CHECK_IDS) {
    if (stale) continue
    const pair = PAIRS[id]
    if (heldOut.includes(id) || (pair && heldOut.includes(pair) && absent.has(id))) {
      states.set(id, { id, state: "held_out", max: 0, points: 0 })
    }
  }

  // Points of held-out checks are spread over the rest of their part, so the parts stay /70 and /30. Unrounded.
  for (const part of Object.keys(PART_MAX) as Part[]) {
    const ids = CHECK_IDS.filter((id) => CHECKS[id].part === part)
    // Nothing left to assess in this part for this program (e.g. T3, T4 and T6 held out, and none of
    // their terms stated): the program is Scoring in progress, with no number. It is our gap, so it
    // never costs the brand points, and spreading the part elsewhere would break the 70/30 split.
    if (ids.every((id) => states.get(id)!.state === "held_out")) {
      for (const id of ids) states.set(id, { id, state: "checking", max: 0, points: 0 })
    }
    const active = ids.filter((id) => states.get(id)!.state !== "held_out")
    const base = active.reduce((a, id) => a + CHECKS[id].max, 0)
    for (const id of active) {
      const c = states.get(id)!
      c.max = (CHECKS[id].max * PART_MAX[part]) / base
      c.points = c.state === "met" ? c.max : 0
    }
  }

  const checks = CHECK_IDS.map((id) => states.get(id)!)
  const scoring = checks.some((c) => c.state === "checking")
  const sum = (part: Part) => round1(checks.filter((c) => CHECKS[c.id].part === part).reduce((a, c) => a + c.points, 0))
  const transparency = scoring ? null : sum("transparency")
  const partner_value = scoring ? null : sum("partner_value")
  return {
    slug: p.slug,
    version: OAS_VERSION,
    // The sum of the two rounded parts, so the numbers a reader sees add up.
    oas: transparency == null || partner_value == null ? null : round1(transparency + partner_value),
    transparency,
    partner_value,
    checked_at,
    page_url: p.signup_url ?? null,
    checks,
  }
}

/** Scores for every scored program, by slug. */
export function scoreAll(programs: ProgramYaml[], today: Date, heldOut: string[] = HELD_OUT): OasScore[] {
  return programs
    .filter(isScored)
    .sort((a, b) => (a.slug < b.slug ? -1 : 1))
    .map((p) => scoreProgram(p, today, heldOut))
}
