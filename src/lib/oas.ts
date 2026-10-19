/**
 * OAS, the OpenAffiliate Score: Transparency 70 + Partner value 30, one fixed
 * number per program, computed from the terms OpenAffiliate verified on the
 * program's own page (scorer: oas-v1.ts). Scores live in one generated file,
 * oas-scores.json (scripts/build-oas.ts); while it is empty no surface shows
 * OAS, the report route is a 404 and /rankings stays the commission table.
 * Pure functions take the scores and programs as arguments so the tests run on
 * fixtures.
 */
import scoresFile from "./oas-scores.json"
import { isSameTeam } from "./same-team"

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
export function improveText(c: OasCheck): string {
  if (c.conflict) return AGREE_FIX
  if (c.state === "not_public") return CHECKS[PAIRS[c.id] ?? c.id].fix
  return CHECKS[c.id]?.fix ?? ""
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

/** Terms verified more than STALE_DAYS before today, or never. */
export function isStale(checkedAt: string | null | undefined, today: Date): boolean {
  return !checkedAt || today.getTime() - Date.parse(checkedAt) > STALE_DAYS * 864e5
}

export function partEarned(s: OasScore, part: Part): number {
  return round1(s.checks.filter((c) => CHECKS[c.id]?.part === part).reduce((a, c) => a + c.points, 0))
}

/** Why a scored program has no rank. Same team first: it holds even when the score is complete. */
export type Unranked = "same-team" | "affitor" | "checking" | "no-apply-link"

export interface ProgramRef {
  slug: string
  name: string
  category: string
  network?: string | null
}

export function unrankedReason(s: OasScore, p: ProgramRef, today: Date): Unranked | null {
  if (isSameTeam(p.slug)) return "same-team"
  if (p.network === "affitor") return "affitor"
  if (oasValue(s, today) == null) return "checking"
  if (!s.page_url) return "no-apply-link"
  return null
}

export const UNRANKED_TEXT: Record<Unranked, string> = {
  "same-team": "Same team as OpenAffiliate · not ranked",
  affitor: "Runs on Affitor (same team as OpenAffiliate) · not ranked",
  checking: "Scoring in progress",
  "no-apply-link": "Not ranked: no public application link",
}

export const TEAM_DISCLOSURE = "OpenAffiliate is run by the same team as Affitor."

export interface BoardRow {
  program: ProgramRef
  score: OasScore
  oas: number | null
  /** Rank among all ranked programs; equal OAS share a rank. */
  rank: number | null
  unranked: Unranked | null
}

/** Every scored program that is in the registry, ranked first (OAS high to low, then slug). */
export function buildBoard(scores: OasScore[], programs: ProgramRef[], today: Date): BoardRow[] {
  const bySlug = new Map(programs.map((p) => [p.slug, p]))
  const rows: BoardRow[] = scores.flatMap((s) => {
    const program = bySlug.get(s.slug)
    return program ? [{ program, score: s, oas: oasValue(s, today), rank: null, unranked: unrankedReason(s, program, today) }] : []
  })
  const ranked = rows.filter((r) => !r.unranked).sort((a, b) => b.oas! - a.oas! || (a.program.slug < b.program.slug ? -1 : 1))
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
