/**
 * The terms the /rankings table shows beside the commission, shared by the
 * page, its JSON-LD and rankings.md so all three read the same way. Imports
 * only import-free modules, so the client table can use it without pulling in
 * the registry.
 */
import { compareText } from "./commission-order"

/**
 * How long a commission keeps paying, in months: Infinity for lifetime, 0 when
 * it pays once, null when a recurring commission does not say how long, and
 * undefined for a tiered or hybrid one that does not say whether it recurs.
 */
export function recurringMonths(c: { type: string; duration?: string | null }): number | null | undefined {
  const d = (c.duration ?? "").toLowerCase()
  if (c.type === "one-time") return 0
  if (/lifetime/.test(d)) return Infinity
  // "12 months", "2 years", "365 days", "up to 2 years", "12 calendar months from…"
  const n = d.match(/(\d+)\s*(?:calendar\s+)?(month|year|day)/)
  if (n) return n[2] === "year" ? Number(n[1]) * 12 : n[2] === "day" ? Math.round(Number(n[1]) / 30) : Number(n[1])
  // "first subscription year"
  if (/\byear\b/.test(d)) return 12
  return c.type === "recurring" ? null : undefined
}

export function recurringText(months: number | null | undefined): string {
  if (months === undefined) return "—"
  if (months === null) return "Length not published"
  if (months === 0) return "No"
  if (months === Infinity) return "Lifetime"
  if (months === 1) return "1 month"
  return months >= 24 && months % 12 === 0 ? `${months / 12} years` : `${months} months`
}

/**
 * A payout minimum in the program's own currency: "$50" for US dollars, "50 EUR"
 * for any other code. The schema defaults payout.currency to USD, so a minimum
 * stored with no currency reads as dollars. Every surface that prints
 * payout.minimum words the amount here.
 */
export function minimumAmount(minimum: number, currency: string | null | undefined): string {
  return !currency || currency === "USD" ? `$${minimum.toLocaleString("en-US")}` : `${minimum.toLocaleString("en-US")} ${currency}`
}

/** "$50", "None" for a zero minimum, null when the program does not publish one. */
export function payoutMinText(minimum: number | null | undefined, currency: string | null | undefined): string | null {
  if (minimum == null) return null
  if (minimum === 0) return "None"
  return minimumAmount(minimum, currency)
}

/**
 * Which list a commission ranks in. A percentage and a dollar amount cannot be
 * compared, so each has its own list; tiered, hybrid, unpublished, credit and
 * non-USD rewards have no single figure and go in "other", A to Z.
 */
export type CommissionGroup = "percent" | "flat" | "other"

export function commissionGroup(c: { mode: string; value: number | null; currency?: string | null; rate: string | number }): CommissionGroup {
  if (c.value == null) return "other"
  if (c.mode === "percentage") return "percent"
  if (c.mode === "flat" && (!c.currency || c.currency === "USD") && !/credit/i.test(String(c.rate))) return "flat"
  return "other"
}

/** Lifetime first, then the longest stated length, a recurring commission of unstated length, one-time, unknown. */
function recurringKey(months: number | null | undefined): number {
  return months === undefined ? -1 : months === null ? 0.5 : months
}

type Ranked = { name: string; slug: string; commission: { type: string; value: number | null; duration?: string | null } }

/**
 * Order inside the percent or flat list: the figure (`dir` -1 puts the largest
 * first), then, whatever the direction, the commission that recurs longer,
 * then the name.
 */
export function compareCommissionFigure(a: Ranked, b: Ranked, dir = -1): number {
  const [x, y] = [a.commission.value ?? 0, b.commission.value ?? 0]
  return (
    (x === y ? 0 : (x < y ? -1 : 1) * dir) ||
    recurringKey(recurringMonths(b.commission)) - recurringKey(recurringMonths(a.commission)) ||
    compareText(a.name, b.name) ||
    compareText(a.slug, b.slug)
  )
}
