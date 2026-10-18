/**
 * The payout and cookie facts a hub list (best-lists.ts) and the /programs
 * filters (client-programs.ts) both filter on, so a hub and its filter never
 * disagree. Pure, with no registry import: the client bundle reads it too.
 */

/** payout.methods values that mean a transfer to a bank account. Wise is its own method. */
export const BANK_METHODS: ReadonlySet<string> = new Set(["bank", "wire", "ach", "sepa"])

/** A cookie window at least this long counts as long. */
export const LONG_COOKIE_DAYS = 90

export type PayoutMethodFilter = "paypal" | "bank"

export function paysBy(methods: readonly string[] | undefined, filter: PayoutMethodFilter): boolean {
  return (methods ?? []).some((m) => (filter === "paypal" ? m.toLowerCase() === "paypal" : BANK_METHODS.has(m.toLowerCase())))
}
