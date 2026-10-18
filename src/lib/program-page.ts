import { IN_HOUSE, commissionDisplay, commissionUnknown, isCreditReward, type Program } from "@/lib/programs"
import { confirmedProse, proseSentences, termsConfirmed } from "@/lib/confirmed-terms"
import { hasNoProgram } from "@/lib/no-program"
import { isPaused } from "@/lib/program-seo"

/**
 * Wording for the human-first program page (approved mock B+, 2026-10-17):
 * every sentence here rephrases stored fields, never adds a fact. The page
 * passes a program already run through confirmedTerms(), so an unverified
 * program arrives with no cookie window, payout or approval to word.
 */

export type PageState = "verified" | "unverified" | "paused" | "no-program"

export function pageState(p: Program): PageState {
  if (hasNoProgram(p)) return "no-program"
  if (isPaused(p)) return "paused"
  return termsConfirmed(p) ? "verified" : "unverified"
}

/**
 * The commission as a headline figure and the words after it. `kind` says how
 * to set it: a parsed number, the stored text of a rate the parser could not
 * read ("€150 per new company"), or "Rate varies". Null when nothing usable is
 * stored: no rate, "none", or a bare number with no unit ("6"), which reads as
 * a figure but says nothing.
 */
export interface Figure {
  big: string
  rest: string
  kind: "number" | "text" | "varies"
}

const durationWords = (d: string) => (d.trim().toLowerCase() === "lifetime" ? "for life" : `for ${d}`)

export function commissionFigure(p: Program): Figure | null {
  if (hasNoProgram(p)) return null
  const c = p.commission
  if (commissionUnknown(c) || commissionDisplay(c) === "Not published") {
    const text = String(c.rate ?? "").trim()
    if (!text || /^(none|not published|n\/a|unknown)$/i.test(text) || /^\d+(\.\d+)?$/.test(text)) return null
    if (/^varies$/i.test(text)) return { big: "Rate varies", rest: "", kind: "varies" }
    return { big: text, rest: "", kind: "text" }
  }
  const recurring = c.type === "recurring"
  const duration = c.duration ? durationWords(String(c.duration)) : ""
  let rest: string
  if (c.mode === "hybrid") rest = duration || (recurring ? "recurring" : "")
  else if (recurring) rest = duration ? `recurring ${duration}` : "recurring"
  else rest = isCreditReward(c) ? "per referral" : "per sale"
  return { big: commissionDisplay(c), rest, kind: "number" }
}

/** "22% recurring for 12 months", or the text alone. */
export function figureText(f: Figure): string {
  return f.rest ? `${f.big} ${f.rest}` : f.big
}

/** The one-sentence answer under the title. Plain text; the page bolds nothing it cannot find. */
export function answerParts(p: Program, noProgramHeadline: string): { before: string; strong: string; after: string } {
  const state = pageState(p)
  const f = commissionFigure(p)
  if (state === "no-program") return { before: `No. ${noProgramHeadline}.`, strong: "", after: "" }
  if (state === "paused") {
    return f
      ? { before: `${p.name}'s program may have closed. Last known terms, not confirmed: `, strong: figureText(f), after: "." }
      : { before: `${p.name}'s program may have closed.`, strong: "", after: "" }
  }
  const deal = f ? (f.kind === "varies" ? "a rate that varies" : figureText(f)) : ""
  if (state === "unverified") {
    return f
      ? { before: "Submitted terms: ", strong: deal, after: `, not yet checked against ${p.name}'s own page.` }
      : { before: `${p.name} has an affiliate program listed, but its commission is not published and the listing is not verified yet.`, strong: "", after: "" }
  }
  if (!f) return { before: `${p.name} runs an affiliate program but does not publish its commission rate.`, strong: "", after: "" }
  if (f.kind === "varies") return { before: `${p.name} runs an affiliate program; its commission rate varies.`, strong: "", after: "" }
  // A free-text rate ("Individually agreed in writing") does not read after "pays".
  if (f.kind === "text") return { before: `${p.name}'s commission: `, strong: deal, after: "." }
  return { before: `${p.name} pays `, strong: deal, after: "." }
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** "Monthly, from a $50 minimum"; null when neither is stored. */
export function payoutText(p: Program): string | null {
  const parts: string[] = []
  if (p.payout?.frequency) parts.push(capitalize(p.payout.frequency))
  if (p.payout?.minimum != null) parts.push(`${parts.length ? "from" : "From"} a $${p.payout.minimum} minimum`)
  return parts.length ? parts.join(", ") : null
}

const METHODS: Record<string, string> = { paypal: "PayPal", bank: "Bank transfer", wire: "Wire transfer", ach: "ACH", sepa: "SEPA" }

export function payoutMethods(p: Program): string[] {
  return (p.payoutMethods ?? []).map((m) => METHODS[m.toLowerCase()] ?? capitalize(m))
}

export const APPROVAL_WORDS: Record<string, string> = { auto: "Automatic", manual: "Reviewed by hand", "invite-only": "By invitation" }

export function approvalText(p: Program): string | null {
  if (!p.approval || !APPROVAL_WORDS[p.approval]) return null
  return `${APPROVAL_WORDS[p.approval]}${p.approvalTime ? ` (${p.approvalTime})` : ""}`
}

/** Cookie row text for a verified program; null for an unverified one (confirmedTerms removed it). */
export function cookieText(p: Program, state: PageState): string | null {
  if (state !== "verified") return null
  if (p.cookieDays == null) return "Not published"
  return p.cookieDays === 0 ? "Code-based, no cookie" : `${p.cookieDays} days`
}

export function joinThrough(p: Program, network: string | null): string {
  return (p.network ?? IN_HOUSE) === IN_HOUSE || !network ? `${p.name} directly` : network
}

/**
 * Sentences about the affiliate deal itself. The earnings card carries the
 * terms, so the product text leaves them out. A bare "%" is not enough: "automates
 * 70% of customer interactions" is product text.
 */
const DEAL = /\b(affiliates?|commissions?|payouts?|partners get|earn|earns|earnings(?![- ]call)|per referral|referred (customers?|users?|subscriptions?|sales?)|referral (fees?|commissions?|bonus(es)?|rewards?)|(strong|high|great) conversion rates?)\b/i

export function isDealSentence(text: string): boolean {
  return DEAL.test(text)
}

/**
 * What the product is, in its own words: the description without the
 * sentences about the deal, falling back to the short description when nothing
 * is left. Expects a program already run through confirmedTerms().
 */
export function productText(p: Program): string {
  const kept = proseSentences(confirmedProse(p, p.description))
    .filter((s) => s.sentence.trim() && !isDealSentence(s.sentence))
    .map((s) => s.sentence + s.after)
    .join("")
    .trim()
  return kept || p.shortDescription
}

/** Use cases as "what people use it for": the ones about the deal itself are left out. */
export function programUseCases(p: Program): string[] {
  return (p.agentUseCases ?? []).filter((u) => u.trim() && !isDealSentence(u))
}

/** Months a recurring commission runs; null when the duration does not read as a span. */
export function durationMonths(duration: string | null | undefined): number | null {
  const d = String(duration ?? "").trim().toLowerCase()
  if (d === "lifetime") return 12
  const m = /^(\d+)\s*(months?|years?)$/.exec(d)
  if (!m) return null
  return m[2].startsWith("y") ? Number(m[1]) * 12 : Number(m[1])
}

/**
 * Inputs for the earnings estimate, or null when the page should not offer one:
 * verified terms only, a plain percentage or flat amount, and for a recurring
 * percentage a duration that reads as a span.
 */
export interface EstimateInput {
  mode: "percentage" | "flat"
  value: number
  recurring: boolean
  months: number
  label: string
}

export function estimateInput(p: Program): EstimateInput | null {
  if (pageState(p) !== "verified") return null
  const c = p.commission
  if (c.value == null || (c.mode !== "percentage" && c.mode !== "flat") || isCreditReward(c)) return null
  const recurring = c.type === "recurring"
  if (recurring && c.mode === "flat") return null
  const months = recurring ? durationMonths(c.duration) : 1
  if (months == null) return null
  const f = commissionFigure(p)
  return { mode: c.mode, value: c.value, recurring, months, label: f ? figureText(f) : commissionDisplay(c) }
}
