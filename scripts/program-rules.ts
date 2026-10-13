/**
 * Per-file rules build-registry applies, kept pure and free of imports so
 * scripts/no-program.test.ts can run them: importing build-registry itself
 * builds the registry.
 */

/** A no_program file sets none of these: a brand with no program has no terms. */
export const NO_PROGRAM_FORBIDDEN = ["cookie_days", "payout", "signup_url", "approval", "approval_time", "restrictions"]

/**
 * The only commission a no_program file may hold. The schema requires the
 * object, so it is a fixed placeholder: these keys with exactly these values,
 * plus `duration` and `conditions` only when null. Any other key or value is
 * refused, whatever its name: an extra `bonus: {amount: 500}` or a `type` of
 * "30% recurring" would otherwise ride along into the registry.
 */
export const NO_PROGRAM_COMMISSION = { type: "one-time", rate: "none", mode: "unknown", value: null, currency: "USD" } as const
const NULL_ONLY = new Set(["duration", "conditions"])

export function noProgramProblems(data: Record<string, unknown>): string[] {
  if (data.status !== "no_program") return []
  const problems = NO_PROGRAM_FORBIDDEN.filter((field) => data[field] != null).map((field) => `sets ${field}`)
  const commission = data.commission
  if (!commission || typeof commission !== "object" || Array.isArray(commission)) {
    return [...problems, "commission is not the placeholder object"]
  }
  const placeholder: Record<string, unknown> = NO_PROGRAM_COMMISSION
  for (const [key, value] of Object.entries(commission)) {
    if (key in placeholder) {
      if (value !== placeholder[key]) problems.push(`commission.${key} is ${JSON.stringify(value)}, not ${JSON.stringify(placeholder[key])}`)
    } else if (NULL_ONLY.has(key)) {
      if (value !== null) problems.push(`commission.${key} is set`)
    } else {
      problems.push(`commission.${key} is not a placeholder key`)
    }
  }
  for (const key of Object.keys(placeholder)) {
    if (!(key in commission)) problems.push(`commission.${key} is missing`)
  }
  return problems
}

/**
 * A file whose `kind` says affiliate (the schema's default when it is missing)
 * and whose commission can rank, while its own commission text names a
 * non-cash reward. The alternatives on no-program pages read kind: affiliate
 * plus a flat or percentage figure as "pays cash", so such a file would be
 * offered as a cash program.
 *
 * This is not a money parser and decides nothing about amounts. It is kept
 * narrow on purpose, because a hit fails the build:
 * - mode unknown never ranks, so the many import placeholders that read
 *   "usage-based referral credits" are not flagged;
 * - gift cards, vouchers and store credit name the reward wherever they
 *   appear;
 * - any other "credit", account credit included, counts only in `rate`, which
 *   names the reward itself. In conditions it often describes something else:
 *   a credit the referred customer gets (Fathom, Flowith, Ticket Tailor) or
 *   credit purchases the commission is paid on (Catalister, Picturesque).
 */
const NON_CASH_ANYWHERE = /\bgift ?cards?\b|\bvouchers?\b|\bstore credits?\b/i
const CREDIT_IN_RATE = /\bcredits?\b/i

export function nonCashAffiliate(data: Record<string, unknown>): boolean {
  if (data.kind != null && data.kind !== "affiliate") return false
  const commission = (data.commission ?? {}) as Record<string, unknown>
  if (commission.mode === "unknown") return false
  const rate = String(commission.rate ?? "")
  return NON_CASH_ANYWHERE.test(`${rate} ${commission.conditions ?? ""}`) || CREDIT_IN_RATE.test(rate)
}
