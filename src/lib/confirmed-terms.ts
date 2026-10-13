/**
 * Which listed terms a reader is shown.
 *
 * Most unverified programs carry the same import defaults: a 30- or 60-day
 * cookie, a $50 monthly payout by bank or PayPal, manual approval in "1-5
 * business days". They read as facts, and hand checks found them on brands
 * that run no program at all. So until a program's terms are checked on its
 * own page, the cookie window, the payout block and approval are not shown
 * anywhere: pages, Markdown twins, llms.txt, REST API, MCP, badges. Commission
 * stays, marked UNCONFIRMED.
 *
 * Every surface decides through termsConfirmed(). Reverting this rule means
 * making it return true, and dropping the checks that pin it
 * (scripts/confirmed-terms.test.ts and the terms checks in
 * verify-machine-surfaces). It never changes the stored data, and the
 * Affiliate Score still reads the stored cookie window.
 *
 * Kept free of imports so client components can use it without pulling the
 * registry into their bundle.
 */
export function termsConfirmed(p: { verified?: boolean | null }): boolean {
  return p.verified === true
}

/** Short marker next to an unconfirmed commission, where space is tight. */
export const UNCONFIRMED = "Unconfirmed"

/** The same marker, where there is room to say what it means. */
export const UNCONFIRMED_NOTE = "Unconfirmed: not yet checked against the program's own page."
