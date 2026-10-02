import { commissionDisplay, commissionUnknown, type Program } from "@/lib/programs"

/** Whitespace-separated tokens. "&" counts, so the signed cap stays at 4. */
export function ctaWordCount(label: string): number {
  return label.trim().split(/\s+/).filter(Boolean).length
}

/**
 * Program-page apply button. Signed form: "Apply & earn {commission}%",
 * no em dash, at most 4 words. A flat fee keeps its dollar sign and does
 * not gain a percent. A rate that would run past 4 words falls back to
 * "Apply & earn" rather than a truncated number.
 */
export function applyEarnLabel(commission: Program["commission"]): string {
  const prefix = "Apply & earn"
  if (commissionUnknown(commission)) return prefix
  const shown = commissionDisplay(commission)
  if (!shown || shown === "Not published") return prefix
  const label = `${prefix} ${shown}`
  if (/[—–]/.test(label) || ctaWordCount(label) > 4) return prefix
  return label
}
