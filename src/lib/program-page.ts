import { IN_HOUSE, commissionDisplay, commissionUnknown, isCreditReward, type Program } from "@/lib/programs"
import { namesTerm, proseSentences, statesTerms, termsConfirmed } from "@/lib/confirmed-terms"
import { hasNoProgram } from "@/lib/no-program"
import { frequencyLabel } from "@/lib/claims/form"
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

/** The duration field in words after "recurring": "for 12 months", "for life", or the stored phrase as it reads. */
function durationWords(raw: string): string {
  const d = raw.trim()
  const lower = d.charAt(0).toLowerCase() + d.slice(1)
  if (/^lifetime$/i.test(d)) return "for life"
  if (/^\d/.test(d)) return `for ${d}`
  if (/^(for|while|until|up to|on|during)\b/i.test(d)) return lower
  if (/^lifetime\b/i.test(d)) return `for the ${lower}`
  return `(${d})`
}

/** The stored rate says for how long, so the duration field is not repeated after it. */
const SAYS_DURATION = /\b(months?|years?|lifetime|life|renewals?|first (payment|purchase|transaction))\b/i

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
  const stored = String(c.rate ?? "").trim()
  const display = commissionDisplay(c)
  const numericFigure = c.mode === "percentage" && c.value != null ? `${c.value}%` : display
  const saysDuration = SAYS_DURATION.test(stored)
  const duration = c.duration && !saysDuration ? durationWords(String(c.duration)) : ""
  // The stored rate qualifies the figure ("up to 30%", "$15 to $1,000", "25% of net revenue",
  // "$75 per qualified lead"): show it as written. A bare number ("25") says less than the figure.
  if (stored && !/^\d+(\.\d+)?$/.test(stored) && sameFigure(stored, numericFigure) === false) {
    const rest = recurring
      ? (saysDuration ? "" : duration ? `recurring ${duration}` : /recurr/i.test(stored) ? "" : "recurring")
      : isCreditReward(c) && !/\bper\b/i.test(stored) ? "per referral" : ""
    return { big: stored, rest, kind: "text" }
  }
  let rest: string
  if (c.mode === "hybrid") rest = duration || (recurring && !saysDuration ? "recurring" : "")
  else if (recurring) rest = duration ? `recurring ${duration}` : saysDuration ? "" : "recurring"
  else rest = isCreditReward(c) ? "per referral" : "per sale"
  return { big: display, rest, kind: "number" }
}

/** True when the stored rate is the displayed figure, written another way ("$1000" for "$1,000"). */
function sameFigure(stored: string, display: string): boolean {
  const norm = (x: string) => x.replace(/[\s,]/g, "").replace(/\.0+(?=\D|$)/, "").toLowerCase()
  return norm(stored) === norm(display)
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
  if (p.payout?.frequency) parts.push(frequencyLabel(p.payout.frequency))
  if (p.payout?.minimum != null) {
    const min = p.payout.minimum === 0 ? "no minimum" : `from a $${p.payout.minimum} minimum`
    parts.push(parts.length ? min : min.charAt(0).toUpperCase() + min.slice(1))
  }
  return parts.length ? parts.join(", ") : null
}

const METHODS: Record<string, string> = { paypal: "PayPal", bank: "Bank transfer", wire: "Wire transfer", ach: "ACH", sepa: "SEPA" }

export function payoutMethods(p: Program): string[] {
  return (p.payoutMethods ?? []).map((m) => METHODS[m.toLowerCase()] ?? capitalize(m))
}

export const APPROVAL_WORDS: Record<string, string> = { auto: "Automatic", manual: "Reviewed by hand", "invite-only": "By invitation" }

/** "Automatic (instant)"; the approval time alone when no approval kind is stored. */
export function approvalText(p: Program): string | null {
  const words = p.approval ? APPROVAL_WORDS[p.approval] : undefined
  if (words) return `${words}${p.approvalTime ? ` (${p.approvalTime})` : ""}`
  return p.approvalTime ? p.approvalTime : null
}

/** Cookie row text for a verified program; null for an unverified one (confirmedTerms removed it). */
export function cookieText(p: Program): string | null {
  // Same rule as payout and approval: only confirmed terms (confirmedTerms removed the rest).
  if (!termsConfirmed(p) || hasNoProgram(p)) return null
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
const DEAL = /\b(affiliates?|commissions?|payouts?|partners get|earn|earns|earnings(?![- ]call)|per referral|referred (customers?|users?|subscriptions?|sales?)|referral (fees?|commissions?|bonus(es)?|rewards?)|(strong|high|great) conversion rates?|apply (at|through|via|on))\b/i

export function isDealSentence(text: string): boolean {
  return DEAL.test(text)
}

/**
 * What the product is, in its own words: the description without the
 * sentences about the deal, falling back to the short description when nothing
 * is left. Expects a program already run through confirmedTerms().
 */
export function productText(p: Program): string {
  // p.description is already filtered for an unverified program (confirmedTerms, pitch rules).
  // Sentences stating a term ("The cookie lasts 45 days.") are left out on every page: the
  // earnings card carries them. statesTerms alone would also drop a cookie-consent product's
  // own sentences ("scans sites for cookies"), so a sentence about cookies needs namesTerm.
  const kept = proseSentences(p.description)
    .filter((s) => s.sentence.trim() && !isDealSentence(s.sentence) && !statesTermForReader(s.sentence))
    .map((s) => s.sentence + s.after)
    .join("")
    .trim()
  return kept || p.shortDescription
}

function statesTermForReader(sentence: string): boolean {
  return namesTerm(sentence) || (statesTerms(sentence, "pitch") && !/\bcookies?\b/i.test(sentence))
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

/**
 * The stored rate must be exactly the figure ("22%", "$100"), in US dollars: a range
 * ("$20–$500"), a gift card, a tier or another currency is not a fixed cash amount
 * the estimate could multiply.
 */
function plainRate(c: Program["commission"]): boolean {
  const norm = (s: string) => s.replace(/[\s,]/g, "").toLowerCase()
  const numericFigure = c.mode === "percentage" && c.value != null ? `${c.value}%` : commissionDisplay(c)
  return (c.currency ?? "USD").toUpperCase() === "USD" && norm(String(c.rate)) === norm(numericFigure)
}

/**
 * Text that puts a number on a ceiling ("capped at $400 per sale", "up to 300 USD per sale"):
 * the estimate would ignore it. Read in the conditions, the description and the agent notes.
 */
const CAPPED = /\bcap(?:ped|s)?\s+(?:at|of)\s+[$€£]?\s?\d|\bmax(?:imum)?\s+(?:of\s+)?[$€£]\s?\d|\bup to\s+[$€£]\s?\d|\bup to\s+\d[\d,.]*\s*(?:usd|eur|gbp)\b|\blimited to\s+[$€£]?\s?\d/i

export function estimateInput(p: Program): EstimateInput | null {
  if (pageState(p) !== "verified") return null
  const c = p.commission
  if (c.value == null || (c.mode !== "percentage" && c.mode !== "flat") || isCreditReward(c) || !plainRate(c)) return null
  if ([p.commissionConditions, p.description, p.agentPrompt].some((t) => CAPPED.test(t ?? ""))) return null
  const recurring = c.type === "recurring"
  if (recurring && c.mode === "flat") return null
  const months = recurring ? durationMonths(c.duration) : 1
  if (months == null) return null
  const f = commissionFigure(p)
  return { mode: c.mode, value: c.value, recurring, months, label: f ? figureText(f) : commissionDisplay(c) }
}
