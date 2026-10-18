/**
 * The terms the /rankings table shows beside the commission, shared by the
 * page, its JSON-LD and rankings.md so all three read the same way. Kept free
 * of imports so the client table can use it without pulling in the registry.
 */

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

/** "$50", "None" for a zero minimum, null when the program does not publish one. */
export function payoutMinText(minimum: number | null | undefined, currency: string | null | undefined): string | null {
  if (minimum == null) return null
  if (minimum === 0) return "None"
  return !currency || currency === "USD" ? `$${minimum.toLocaleString("en-US")}` : `${minimum.toLocaleString("en-US")} ${currency}`
}
