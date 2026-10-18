export type CommissionMode = "percentage" | "flat" | "tiered" | "hybrid" | "unknown"
export type ParsedCommission = { mode: CommissionMode; value: number | null; why: string }

/**
 * Read `commission.mode` and `commission.value` from the free-text rate.
 * Moved here from scripts/migrate-commission.ts so the claim owner panel can
 * preview its reading with the same rules; the script keeps its per-program
 * rulings for bare numbers and calls this for everything else.
 */
export function parseCommissionMode(raw: string): ParsedCommission {
  const r = raw.trim()

  if (!r || /^(varies|unknown|n\/a|tbd)$/i.test(r)) {
    return { mode: "unknown", value: null, why: "no figure recorded" }
  }

  // A bare number carries no unit and cannot be read without evidence.
  if (/^\d+(\.\d+)?$/.test(r)) {
    return { mode: "unknown", value: null, why: "bare number with no unit and no ruling" }
  }

  const hasPct = /%/.test(r)
  const hasDollar = /\$/.test(r)

  // Both symbols means two components — a flat bounty plus a share, or a choice
  // between them. Neither number alone describes the deal.
  if (hasPct && hasDollar) {
    const pct = r.match(/(\d+(?:\.\d+)?)\s*%/)
    return {
      mode: "hybrid",
      value: pct ? parseFloat(pct[1]) : null,
      why: "contains both a flat amount and a percentage",
    }
  }

  if (hasPct) {
    // "20-30%" and "75-125% CPA + 25% annual" — a band, not a single rate.
    // Take the top of the band, which is what a reader compares on, and say so.
    const range = r.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*%/)
    if (range) {
      return { mode: "tiered", value: parseFloat(range[2]), why: "range, using the upper bound" }
    }
    const one = r.match(/(\d+(?:\.\d+)?)\s*%/)
    if (one) {
      return { mode: "percentage", value: parseFloat(one[1]), why: "single percentage" }
    }
  }

  if (hasDollar) {
    const range = r.match(/\$\s*(\d[\d,]*(?:\.\d+)?)\s*[-–]\s*\$?\s*(\d[\d,]*(?:\.\d+)?)/)
    if (range) {
      return {
        mode: "tiered",
        value: parseFloat(range[2].replace(/,/g, "")),
        why: "flat range, using the upper bound",
      }
    }
    const one = r.match(/\$\s*(\d[\d,]*(?:\.\d+)?)/)
    if (one) {
      return { mode: "flat", value: parseFloat(one[1].replace(/,/g, "")), why: "single flat amount" }
    }
  }

  return { mode: "unknown", value: null, why: "unrecognised format" }
}

/** Keep a percentage qualifier as stored; a missing value never becomes a claim. */
export function formatPercentage(rate: string | number | null | undefined, value: number | null | undefined): string {
  if (value == null) return "Not published"
  const stored = String(rate ?? "").trim()
  return /\d/.test(stored) && !/^\d+(?:\.\d+)?\s*%?$/.test(stored)
    ? stored
    : `${value}%`
}
