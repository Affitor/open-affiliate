/**
 * OAS, the OpenAffiliate Score: Transparency 70 + Partner value 30, one fixed
 * number per program, computed from the terms OpenAffiliate verified on the
 * program's own page (scorer: oas-v1.ts). Scores live in one generated file,
 * oas-scores.json (scripts/build-oas.ts); while it is empty no surface shows
 * OAS, the report route is a 404 and /rankings stays the commission table.
 * Pure functions take the scores and programs as arguments so the tests run on
 * fixtures.
 */
import { compareText } from "./commission-order"
import { oasGrade } from "./oas-grade"
export { GRADE_BANDS, oasGrade, type OasGrade } from "./oas-grade"
import scoresFile from "./oas-scores.json"

/** not_public reads "Not published"; held_out is a check v1 does not assess (it never blocks a score). */
export type CheckState = "met" | "not_met" | "not_public" | "checking" | "held_out"

export interface OasCheck {
  id: string
  state: CheckState
  /** The check's weight for this program: its catalog points, scaled up when a check in its part is held out. Unrounded. */
  max: number
  /** max when met, else 0. */
  points: number
  /** What the verified terms say, e.g. "60 days"; absent when the fact is not published. */
  fact?: string | null
  /** Two of the brand's pages disagree on this term; the quote shows both. */
  conflict?: string | null
  /** Not published: the date the brand's pages were read (the data lane's not_published marker). */
  checked?: string
}

export interface OasScore {
  slug: string
  version: string
  oas: number | null
  transparency: number | null
  partner_value: number | null
  /** The date the program's terms were verified (last_verified_at). */
  checked_at: string
  /** The page the terms were checked on: the program's signup_url. */
  page_url: string | null
  checks: OasCheck[]
}

export type Part = "transparency" | "partner_value"

export interface CheckGroup {
  key: string
  part: Part
  name: string
  about: string
  ids: string[]
}

export interface CheckDef {
  id: string
  label: string
  group: string
  part: Part
  max: number
  /** The YAML term the check reads; a conflict on it fails the check. */
  field: string
  /** What the brand can publish or change to meet it. */
  fix: string
}

export const OAS_VERSION = "v1"

/** Terms verified longer ago than this show Scoring in progress until they are verified again. */
export const STALE_DAYS = 90

export const PART_MAX: Record<Part, number> = { transparency: 70, partner_value: 30 }

export const GROUPS: CheckGroup[] = [
  { key: "commission", part: "transparency", name: "Commission", about: "What a referral earns and for how long.", ids: ["T1", "T2"] },
  { key: "tracking", part: "transparency", name: "Tracking", about: "How long a click stays credited to the affiliate.", ids: ["T3"] },
  { key: "payout", part: "transparency", name: "Payout", about: "The minimum, the methods and the schedule of payments.", ids: ["T4", "T5", "T6"] },
  { key: "joining", part: "transparency", name: "Joining & rules", about: "How applications are approved and what promotion is allowed.", ids: ["T7", "T8"] },
  { key: "partner", part: "partner_value", name: "Partner terms", about: "Three terms that protect the affiliate: a long tracking window, a low minimum, and regular payment.", ids: ["V1", "V2", "V3"] },
]

const DEFS: [id: string, label: string, max: number, field: string, fix: string][] = [
  ["T1", "Commission stated", 12, "commission.rate", "Publish the commission as a number: a rate or an amount."],
  ["T2", "How long commission lasts", 10, "commission.duration", "Say how long commission is paid: a number of months, or for the customer's lifetime."],
  ["T3", "Cookie or attribution window", 10, "cookie_days", "Publish the cookie or attribution window in days, or say that it never expires."],
  ["T4", "Minimum payout", 10, "payout.minimum", "Publish the minimum payout, or say there is none."],
  ["T5", "Payout methods", 8, "payout.methods", "List the ways affiliates can be paid."],
  ["T6", "Payout schedule", 8, "payout.frequency", "Say when payouts are sent: weekly, monthly, on request, or net 30."],
  ["T7", "How joining works", 6, "approval", "Say how applications are approved: automatically or after a review."],
  ["T8", "Promotion rules", 6, "restrictions", "Publish the promotion rules, or say there are none."],
  ["V1", "Cookie of 60 days or more", 10, "cookie_days", "Keep a referral credited for 60 days or more, or for the customer's lifetime."],
  ["V2", "Minimum payout of USD 50 or less", 10, "payout.minimum", "Lower the minimum payout to USD 50 or less, or drop it."],
  ["V3", "Paid at least monthly", 10, "payout.frequency", "Pay affiliates at least once a month."],
]

export const CHECKS: Record<string, CheckDef> = Object.fromEntries(
  DEFS.map(([id, label, max, field, fix]) => {
    const g = GROUPS.find((x) => x.ids.includes(id))!
    return [id, { id, label, max, field, fix, group: g.name, part: g.part }]
  }),
)

export const CHECK_IDS: string[] = GROUPS.flatMap((g) => g.ids)

/** A Partner value check and the Transparency check that publishes the same term. */
export const PAIRS: Record<string, string> = { V1: "T3", V2: "T4", V3: "T6" }

export const AGREE_FIX = "Make your pages state the same term, or say on the affiliate page which one applies."
export const NOT_ASSESSED = "Not assessed in v1"

/** The fix shown under a check: agree the pages, publish the term, or change it. */
/**
 * A partner check whose term is not published: publishing the term is not enough, its value
 * has to clear the bar too, so the fix says both (the paired transparency check says publish).
 */
const PUBLISH_AT_BAR: Record<string, string> = {
  V1: "Publish a cookie or attribution window of 60 days or more, or say that it never expires.",
  V2: "Publish a minimum payout of USD 50 or less, or say there is none.",
  V3: "Publish a payout schedule of at least once a month.",
}
/** What the paired transparency check's fix also earns, when its value clears the partner check's bar. */
const BAR: Record<string, string> = { V1: "if it is 60 days or more", V2: "if it is USD 50 or less", V3: "if payment is at least monthly" }

export function improveText(c: OasCheck): string {
  if (c.conflict) return AGREE_FIX
  if (c.state === "not_public") return PUBLISH_AT_BAR[c.id] ?? CHECKS[c.id].fix
  return CHECKS[c.id]?.fix ?? ""
}

/**
 * The report's one line, from the two parts rather than the total: a program can publish every
 * term (Transparency full) and still miss a partner term. null while scoring.
 */
export function verdictText(score: OasScore, today: Date = new Date()): string | null {
  if (oasValue(score, today) == null) return null
  const t = partEarned(score, "transparency"), v = partEarned(score, "partner_value")
  if (t >= PART_MAX.transparency && v >= PART_MAX.partner_value) return "Every term published, partner terms met"
  if (t >= PART_MAX.transparency) return "Every term published, partner terms to improve"
  return "Terms to publish"
}

export interface FixItem {
  id: string
  label: string
  group: string
  fix: string
  /** Points this check adds. */
  points: number
  /** The paired partner check's points, when the same term would also clear its bar: "+10 more if it is USD 50 or less". */
  extra: string | null
  /** points plus the paired check's, for ordering. */
  total: number
}

/**
 * "Fix these gaps first": every check not met or not published, biggest first. A partner check
 * whose term is not published, or whose pages disagree, joins its transparency check as one
 * item, so the brand reads one action with the partner points stated as conditional on the bar,
 * instead of the same action twice promising both.
 */
export function fixItems(score: OasScore): FixItem[] {
  // A partner check joins its transparency check when one action serves both: publish the
  // term, or make the pages agree on it. Either way the partner points need the bar too.
  const joins = (c: OasCheck) => c.state === "not_public" || Boolean(c.conflict)
  const open = score.checks.filter((c) => c.state === "not_met" || c.state === "not_public")
  const openById = new Map(open.map((c) => [c.id, c]))
  return open
    .filter((c) => !(PAIRS[c.id] && joins(c) && openById.has(PAIRS[c.id])))
    .map((c) => {
      const v = Object.keys(PAIRS).find((k) => PAIRS[k] === c.id && openById.has(k) && joins(openById.get(k)!))
      const vc = v ? openById.get(v)! : null
      return {
        id: c.id,
        label: CHECKS[c.id].label,
        group: CHECKS[c.id].group,
        fix: improveText(c),
        points: round1(c.max),
        extra: vc ? `+${round1(vc.max)} more ${BAR[vc.id]}` : null,
        total: round1(c.max + (vc?.max ?? 0)),
      }
    })
    .sort((a, b) => b.total - a.total || (a.id < b.id ? -1 : 1))
}

/**
 * The Markdown a brand copies to its team or its AI agent (Prompt to improve): what to publish,
 * where, and how to ask for a re-check. While scoring, the terms not read yet.
 */
export function improvePrompt(p: { name: string; slug: string }, score: OasScore, today: Date = new Date()): string {
  const value = oasValue(score, today)
  const items = fixItems(score)
  const waiting = score.checks.filter((c) => c.state === "checking")
  if (!items.length && !waiting.length) return ""
  const where = score.page_url ?? "its affiliate page"
  const lines = items.length
    ? items.map((f, i) => `${i + 1}. ${f.label}: ${f.fix} (+${f.points}${f.extra ? `, ${f.extra}` : ""})`)
    : waiting.map((c, i) => `${i + 1}. ${CHECKS[c.id].label}: not read yet. If ${where} states it, nothing to do; if not: ${CHECKS[c.id].fix.charAt(0).toLowerCase()}${CHECKS[c.id].fix.slice(1)}`)
  return [
    `# Raise ${p.name}'s OpenAffiliate Score (OAS ${value ?? "in progress"}${value == null ? "" : "/100"})`,
    "",
    `OpenAffiliate reads ${p.name}'s affiliate terms from ${where}. Publish these on that page, in plain words:`,
    "",
    ...lines,
    "",
    `Then ask OpenAffiliate to check again: https://openaffiliate.dev/programs/${p.slug}/oas (Report an error).`,
  ].join("\n")
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * OAS, or null ("Scoring in progress") while any check is still Checking or the
 * terms were verified more than STALE_DAYS ago. Freshness is checked when read,
 * not only when the file is built, so a score expires between deploys too.
 * Held-out checks never block it.
 */
export function oasValue(s: OasScore, today: Date = new Date()): number | null {
  if (s.oas == null || s.checks.some((c) => c.state === "checking") || isStale(s.checked_at, today)) return null
  return s.oas
}

/** Terms verified STALE_DAYS or more before today, or never: from the start of lapseDate(), exactly. */
export function isStale(checkedAt: string | null | undefined, today: Date): boolean {
  return !checkedAt || today.getTime() - Date.parse(checkedAt) >= STALE_DAYS * 864e5
}

export function partEarned(s: OasScore, part: Part): number {
  return round1(s.checks.filter((c) => CHECKS[c.id]?.part === part).reduce((a, c) => a + c.points, 0))
}

/**
 * Why a scored program has no rank. Only the score itself decides: every program,
 * whoever runs it and on whatever network, is ranked by the same rules.
 */
export type Unranked = "checking" | "no-apply-link"

export interface ProgramRef {
  slug: string
  name: string
  category: string
  network?: string | null
}

export function unrankedReason(s: OasScore, today: Date): Unranked | null {
  if (oasValue(s, today) == null) return "checking"
  if (!s.page_url) return "no-apply-link"
  return null
}

export const UNRANKED_TEXT: Record<Unranked, string> = {
  checking: "Scoring in progress",
  "no-apply-link": "Not ranked: no public application link",
}

export const TEAM_DISCLOSURE = "OpenAffiliate is maintained by Affitor."

export interface BoardRow {
  program: ProgramRef
  score: OasScore
  oas: number | null
  /** Rank among all ranked programs; equal OAS share a rank. */
  rank: number | null
  unranked: Unranked | null
}

/** Every scored program that is in the registry, ranked first (OAS high to low, then name A to Z). */
export function buildBoard(scores: OasScore[], programs: ProgramRef[], today: Date): BoardRow[] {
  const bySlug = new Map(programs.map((p) => [p.slug, p]))
  const rows: BoardRow[] = scores.flatMap((s) => {
    const program = bySlug.get(s.slug)
    return program ? [{ program, score: s, oas: oasValue(s, today), rank: null, unranked: unrankedReason(s, today) }] : []
  })
  const ranked = rows
    .filter((r) => !r.unranked)
    .sort((a, b) => b.oas! - a.oas! || compareText(a.program.name, b.program.name) || (a.program.slug < b.program.slug ? -1 : 1))
  ranked.forEach((r, i) => (r.rank = i > 0 && ranked[i - 1].oas === r.oas ? ranked[i - 1].rank : i + 1))
  return [...ranked, ...rows.filter((r) => r.unranked)]
}

/** Rank within the program's category, ties shared, or null when unranked. */
export function categoryRank(board: BoardRow[], slug: string): { rank: number; of: number; category: string } | null {
  const row = board.find((r) => r.program.slug === slug)
  if (!row || row.unranked) return null
  const peers = board.filter((r) => !r.unranked && r.program.category === row.program.category)
  const rank = peers.findIndex((r) => r.oas === row.oas) + 1
  return { rank, of: peers.length, category: row.program.category }
}

/**
 * The rank line on a report: shown only when it helps the brand (#1, top 3,
 * top half). Under 5 ranked in the category only #1 shows, with the count.
 */
export function rankText(r: { rank: number; of: number; category: string } | null): string | null {
  if (!r) return null
  if (r.of < 5) return r.rank === 1 ? `#1 of ${r.of} ranked in ${r.category}` : null
  if (r.rank === 1) return `#1 in ${r.category}`
  if (r.rank <= 3) return `Top 3 in ${r.category}`
  if (r.rank <= Math.ceil(r.of / 2)) return `Top half in ${r.category}`
  return null
}

export const oasScores: OasScore[] = scoresFile as OasScore[]

export function getOasScore(slug: string): OasScore | undefined {
  return oasScores.find((s) => s.slug === slug)
}

/** What a program without a current score says instead, on the page and every machine surface. */
export const OAS_STALE_TEXT = "Its terms were verified more than 90 days ago; the score returns once we verify them again."
export const OAS_IN_PROGRESS_TEXT = "Scoring in progress: some of its terms are not read yet."

/** The OAS a program's page shows, in the shape REST, MCP and the .md twin share. */
export interface OasSummary {
  score: number | null
  grade: string | null
  status: "scored" | "stale" | "in_progress"
  summary: string
  checkedAt: string | null
  /** The day the score lapses unless the terms are verified again (checkedAt + STALE_DAYS); null without a checked date. */
  validUntil: string | null
  version: string
  reportUrl: string
}

/** checkedAt + STALE_DAYS as YYYY-MM-DD: from midnight (UTC) that day, isStale() is true. */
export function lapseDate(checkedAt: string | null | undefined): string | null {
  return checkedAt ? new Date(Date.parse(checkedAt) + STALE_DAYS * 864e5).toISOString().slice(0, 10) : null
}

/** null when the program has no OAS entry (OAS not published, or the program is not scored). */
export function oasSummary(slug: string, today: Date = new Date()): OasSummary | null {
  const s = getOasScore(slug)
  return s ? oasSummaryOf(s, today) : null
}

export function oasSummaryOf(s: OasScore, today: Date = new Date()): OasSummary {
  const slug = s.slug
  const score = oasValue(s, today)
  const status = score != null ? "scored" : isStale(s.checked_at, today) ? "stale" : "in_progress"
  return {
    score,
    grade: score == null ? null : oasGrade(score),
    status,
    summary: status === "scored" ? verdictText(s, today)! : status === "stale" ? OAS_STALE_TEXT : OAS_IN_PROGRESS_TEXT,
    checkedAt: s.checked_at ?? null,
    validUntil: lapseDate(s.checked_at),
    version: s.version,
    reportUrl: `https://openaffiliate.dev/programs/${slug}/oas`,
  }
}
