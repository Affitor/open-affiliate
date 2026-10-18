/**
 * OAS, the OpenAffiliate Score (rubric v0.2): Transparency 70 + Partner value 30,
 * one fixed number per program, read from public pages only. Scores live in one
 * file, oas-scores.json; while it is empty no surface shows OAS, the report route
 * is a 404 and /rankings stays the commission table. Pure functions take the
 * scores and programs as arguments so the tests run on fixtures.
 */
import scoresFile from "./oas-scores.json"
import { isSameTeam } from "./same-team"

export type CheckState = "met" | "not_met" | "not_public" | "checking"

export interface OasCheck {
  id: string
  state: CheckState
  /** Points earned: the check's full weight when met, else 0. */
  points: number
  /** Source of a met check; for a Not met check, the pages read (older files join them with " ; "). */
  url?: string | null
  quote?: string | null
  checked_urls?: string[]
}

export interface OasScore {
  slug: string
  oas: number | null
  transparency: number | null
  partner_value: number | null
  /** ISO time of the review. */
  checked_at: string
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
  /** What the brand can publish to meet it. */
  fix: string
}

export const PART_MAX: Record<Part, number> = { transparency: 70, partner_value: 30 }

export const GROUPS: CheckGroup[] = [
  { key: "R", part: "transparency", name: "Reward terms", about: "What earns a reward, how much, for how long, and when it can be reversed.", ids: ["R1", "R2", "R3", "R4", "R5"] },
  { key: "P", part: "transparency", name: "Payout", about: "When and how affiliates get paid, and what it costs them.", ids: ["P1", "P2", "P3", "P4", "P5"] },
  { key: "A", part: "transparency", name: "Attribution & rules", about: "How a referral is credited and what promotion is allowed.", ids: ["A1", "A2", "A3", "A4", "A5"] },
  { key: "E", part: "transparency", name: "Joining & support", about: "How to apply, who can join, and where to get help.", ids: ["E1", "E2", "E3", "E4", "E5"] },
  { key: "I", part: "transparency", name: "Identity & policy", about: "Who runs the program and how its terms are governed.", ids: ["I1", "I2", "I3", "I4", "I5"] },
  { key: "V1", part: "partner_value", name: "Protection", about: "Notice before terms change, and earned commission kept if the partnership ends.", ids: ["V1a", "V1b"] },
  { key: "V2", part: "partner_value", name: "Getting paid", about: "A minimum at or below the category, paid within 60 days, a usable payout route.", ids: ["V2", "V3", "V4"] },
  { key: "V5", part: "partner_value", name: "Tracking", about: "A tracking window at or above the category median, with clear priority.", ids: ["V5"] },
  { key: "V6", part: "partner_value", name: "Getting started", about: "A public promotion aid and a guide to the first tracked referral.", ids: ["V6a", "V6b"] },
  { key: "V7", part: "partner_value", name: "Support & response", about: "A partner team, its hours or response time, and an application deadline.", ids: ["V7a", "V7b", "V8"] },
]

// Transparency weights are rubric v0.1 per section (6/5/4/3/2) × 0.7; partner value weights are v0.2's own.
const T_MAX: Record<string, number> = { R: 4.2, P: 3.5, A: 2.8, E: 2.1, I: 1.4 }
const V_MAX: Record<string, number> = { V1a: 3, V1b: 3, V2: 3, V3: 3, V4: 2, V5: 4, V6a: 2, V6b: 3, V7a: 2, V7b: 2, V8: 3 }

const DEFS: [string, string, string][] = [
  ["R1", "Reward event defined", "Explain what earns a reward and whether the offer is standard or agreed individually."],
  ["R2", "Reward is calculable", "Publish the rate and calculation basis, or explain how an individual written offer defines them."],
  ["R3", "Duration and renewals", "Say whether rewards happen once or recur, and when recurring rewards stop."],
  ["R4", "Caps, exclusions, tiers", "List caps, excluded products and tier rules; state when none apply."],
  ["R5", "Refunds and reversals", "Explain when an earned reward can be reversed and how affiliates are informed."],
  ["P1", "Payout schedule", "State when commissions become payable and when payments are sent."],
  ["P2", "Minimum threshold", "Publish the payout minimum, or say there is no threshold."],
  ["P3", "Methods, currencies, fees", "List payment methods, supported currencies and fees affiliates may bear."],
  ["P4", "Countries, tax, identity", "Explain where payouts are available and what tax or identity steps are required."],
  ["P5", "Payout disputes", "Give affiliates a clear route to question a missing or reversed payment."],
  ["A1", "Attribution method", "Explain how a referral is connected to the affiliate, including non-cookie methods."],
  ["A2", "Attribution window", "State how long a referral remains eligible, or why the program has no such window."],
  ["A3", "Competing referrals", "Explain who receives credit when multiple referrals or a coupon are involved."],
  ["A4", "Promotion rules", "Publish the promotion rules before an affiliate applies."],
  ["A5", "Abuse and disclosure", "Explain prohibited abuse and require honest, clearly disclosed promotion."],
  ["E1", "Working application link", "Repair the application link and make its destination clearly identify your program."],
  ["E2", "Who can apply", "Explain eligibility and how applications are evaluated."],
  ["E3", "Terms readable before applying", "Let prospective affiliates read baseline obligations before giving you their information."],
  ["E4", "Getting-started guide", "Publish a short guide covering first referral and where attribution or commission reports appear."],
  ["E5", "Partner support channel", "Provide a monitored partner contact or help form."],
  ["I1", "Official program link", "Link the program from your official domain so affiliates can establish who operates it."],
  ["I2", "Responsible operator", "Identify who is responsible for the agreement and how to contact them."],
  ["I3", "Privacy policy", "Link a privacy policy covering affiliate application and program data."],
  ["I4", "Change notices", "Explain how partners learn about term changes and their effective date."],
  ["I5", "Termination terms", "Explain what happens to pending commissions when a partnership ends."],
  ["V1a", "Notice before terms change", "Give at least 7 days' notice before an adverse change, apply it to new referrals only, and keep rewards already earned."],
  ["V1b", "Earned commission kept on exit", "State that valid earned commissions are paid when a partnership ends, even below the usual minimum."],
  ["V2", "Minimum at or below category", "Drop the payout minimum, or set it at or below the category median."],
  ["V3", "Paid within 60 days", "Publish the longest time from a qualifying sale to payment, including any hold, and keep it to 60 days or less."],
  ["V4", "Electronic payout, fees public", "Offer an electronic payout route and publish its currency and fees, or say it is fee-free."],
  ["V5", "Tracking window vs category", "Use a tracking window at or above the category median, or none that expires, and say who gets credit when referrals compete."],
  ["V6a", "Public promotion aid", "Link a current public promotion aid for this program: copy, examples, a brief or a brand kit."],
  ["V6b", "Starter guide and reports", "Publish how the first referral is tracked and where partners see attribution and commission reports."],
  ["V7a", "Partner support team", "Name a partner support team with its own contact route."],
  ["V7b", "Support hours or response time", "Publish partner support hours or a maximum response time."],
  ["V8", "Application decision deadline", "Publish when applicants hear back, or say applications are accepted automatically."],
]

export const CHECKS: Record<string, CheckDef> = Object.fromEntries(
  DEFS.map(([id, label, fix]) => {
    const g = GROUPS.find((x) => x.ids.includes(id))!
    return [id, { id, label, fix, group: g.name, part: g.part, max: g.part === "transparency" ? T_MAX[g.key] : V_MAX[id] }]
  }),
)

export const PUBLISH_FIX = "Publish this on a public page an affiliate can read before applying, and link it from the affiliate page."
export const AGREE_FIX = "Make the public pages say the same thing, or state which terms apply to this program, on the affiliate page."

/** Two public pages that disagree count as Not met; the fix is to make them agree. */
export function isConflict(c: OasCheck): boolean {
  return c.state === "not_met" && /^conflict\b/i.test(c.quote ?? "")
}

export function improveText(c: OasCheck): string {
  if (c.state === "not_public") return PUBLISH_FIX
  if (isConflict(c)) return AGREE_FIX
  return CHECKS[c.id]?.fix ?? ""
}

/** The pages read for a check, from checked_urls or the " ; "-joined url. */
export function checkedUrls(c: OasCheck): string[] {
  if (c.checked_urls?.length) return c.checked_urls
  return (c.url ?? "").split(/\s*;\s*/).filter(Boolean)
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** OAS, or null while any check is still Checking ("Scoring in progress"). */
export function oasValue(s: OasScore): number | null {
  if (s.oas == null || s.checks.some((c) => c.state === "checking")) return null
  return s.oas
}

export function partEarned(s: OasScore, part: Part): number {
  return round1(s.checks.filter((c) => CHECKS[c.id]?.part === part).reduce((a, c) => a + (c.state === "met" ? c.points : 0), 0))
}

/** Why a scored program has no rank. Same team first: it holds even when the score is complete. */
export type Unranked = "same-team" | "affitor" | "checking" | "no-apply-link" | "stale"

export interface ProgramRef {
  slug: string
  name: string
  category: string
  network?: string | null
}

export const STALE_DAYS = 90

export function unrankedReason(s: OasScore, p: ProgramRef, today: Date): Unranked | null {
  if (isSameTeam(p.slug)) return "same-team"
  if (p.network === "affitor") return "affitor"
  if (oasValue(s) == null) return "checking"
  if (s.checks.find((c) => c.id === "E1")?.state !== "met") return "no-apply-link"
  if (today.getTime() - Date.parse(s.checked_at) > STALE_DAYS * 864e5) return "stale"
  return null
}

export const UNRANKED_TEXT: Record<Unranked, string> = {
  "same-team": "Same team as OpenAffiliate · not ranked",
  affitor: "Runs on Affitor (same team as OpenAffiliate) · not ranked",
  checking: "Scoring in progress",
  "no-apply-link": "Not ranked: the application link did not work when we checked",
  stale: `Not ranked: last reviewed more than ${STALE_DAYS} days ago`,
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
    return program ? [{ program, score: s, oas: oasValue(s), rank: null, unranked: unrankedReason(s, program, today) }] : []
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
