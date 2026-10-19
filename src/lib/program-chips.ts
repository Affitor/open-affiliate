import { formatPercentage } from "./commission-mode"
import { termsConfirmed, UNCONFIRMED } from "./confirmed-terms"

/**
 * The short commission and cookie texts every list shows: program rows and
 * cards, the homepage rankings, the search bar, a network's table. No registry
 * import, so the search bar on every page can use them without shipping the
 * registry to the browser.
 */
export interface ChipCommission {
  type: string
  rate: string | number
  mode: string
  value: number | null
  duration?: string | null
}

export function commissionLabel(commission: ChipCommission, short = false): string {
  const type = commission.type === "recurring" ? (short ? "rec" : "recurring") : commission.type
  if (commission.type !== "recurring" || !commission.duration) return type

  const duration = String(commission.duration).toLowerCase().trim()
  if (duration === "lifetime") return `${type}/lifetime`
  const months = duration.match(/^(\d+)\s*months?$/)
  return months ? `${type}/${months[1]}mo` : `${type}/${duration}`
}

export function commissionDisplay(commission: ChipCommission): string {
  switch (commission.mode) {
    case "percentage":
      return formatPercentage(commission.rate, commission.value)
    case "flat":
      return commission.value !== null
        ? `$${commission.value.toLocaleString()}${/credit/i.test(String(commission.rate)) ? " in credits" : ""}`
        : "Not published"
    case "tiered":
    case "hybrid":
      return String(commission.rate)
    default:
      return "Not published"
  }
}

/** Rate text that says something: not empty, "none", "n/a" or a bare number with no unit. */
function saysRate(text: string): boolean {
  return Boolean(text) && !/^(none|not published|n\/a|unknown)$/i.test(text) && !/^\d+(\.\d+)?$/.test(text)
}

/**
 * "30% recurring/12mo". With no figure to read, the stored rate as written
 * ("$500 Visa gift card per referral"), "Rate varies", or "Rate not
 * published": the choice the program page makes (commissionFigure), for a
 * verified program or not. The rate and duration hold no withheld term:
 * build-registry refuses one (commissionTermProblems).
 */
export function commissionChip(c: ChipCommission, short = false): string {
  const varies = (text: string) => /^varies$/i.test(text)
  const figure = commissionDisplay(c).trim()
  // The page reads a figure unless the mode is unknown or there is no value (commissionUnknown).
  if (c.mode !== "unknown" && c.value !== null && figure !== "Not published") return varies(figure) ? "Rate varies" : `${figure} ${commissionLabel(c, short)}`
  const rate = String(c.rate ?? "").trim()
  if (varies(rate)) return "Rate varies"
  return saysRate(rate) ? rate : "Rate not published"
}

/** The cookie as the program page states it; unconfirmed until the terms are checked. */
export function cookieChip(p: { verified?: boolean | null; cookieDays?: number | null }): string {
  if (!termsConfirmed(p)) return UNCONFIRMED
  if (p.cookieDays == null) return "Cookie not published"
  return p.cookieDays === 0 ? "Code-based, no cookie" : `${p.cookieDays}d cookie`
}
