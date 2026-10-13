/**
 * Which listed terms a reader is shown.
 *
 * Most unverified programs carry the same import defaults: a 30- or 60-day
 * cookie, a $50 monthly payout by bank or PayPal, manual approval in "1-5
 * business days". They read as facts, and hand checks found them on brands
 * that run no program at all. So until a program's terms are checked on its
 * own page, the cookie window, the payout block and approval are not shown
 * anywhere: pages, Markdown twins, llms.txt, REST API, MCP, badges, the
 * browser's copy of the registry, and the sentences of free text that state
 * them. Commission stays, marked UNCONFIRMED.
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

const DAYS = String.raw`\d+(?:\s*(?:-|to)\s*\d+)?[\s-]*(?:day|days|d)\b`
const MONEY = String.raw`(?:[$€£]\s*\d|\b(?:usd|eur|gbp)\s*\d|\d+\s*(?:usd|eur|gbp)\b)`
const PAY_METHOD = String.raw`\b(?:paypal|stripe|wise|payoneer|bank transfer|bank|wire|ach|sepa|crypto|usdc|bitcoin|gift cards?)\b`
const FREQUENCY = String.raw`\b(?:monthly|weekly|bi-?weekly|biweekly|quarterly|daily|twice a month|every month|each month|once a month)\b`
/** Words that place a payout schedule in an affiliate program, not in the product ("fast daily payouts" for a payments app). */
const PROGRAM_CONTEXT = new RegExp(String.raw`\b(?:affiliates?|partners?|partnership|referr\w*|commissions?|earn\w*|tracking|promo\w*|programme)\b|^\W*payouts?\b|${MONEY}`, "i")
const PAYOUT_SCHEDULE = new RegExp(String.raw`\bpayouts?\b[^.!?]{0,60}(?:${FREQUENCY}|${PAY_METHOD})|(?:${FREQUENCY}|${PAY_METHOD})[^.!?]{0,30}\bpayouts?\b`, "i")

/**
 * A sentence that states a cookie window, a payout term or how approval works.
 * Matched on wording, never parsed: a hit drops the whole sentence.
 */
const TERM_SENTENCE: RegExp[] = [
  // Cookie window: "60-day cookie", "cookie lasts 30 days", "lifetime cookie", "cookie duration".
  new RegExp(String.raw`${DAYS}[^.!?]{0,40}\bcookies?\b|\bcookies?\b[^.!?]{0,40}${DAYS}`, "i"),
  /\b(?:lifetime|life-time|session|first-click|last-click|first-touch|last-touch)\s+cookies?\b|\bcookies?\s+(?:duration|window|length|lifetime|life)\b/i,
  // The same window by another name: "90-day attribution window", "referral period of 60 days".
  new RegExp(String.raw`${DAYS}[^.!?]{0,30}\b(?:attribution|referral|tracking|conversion|cookie)\b|\b(?:attribution|referral|tracking|conversion|cookie)\s+(?:window|period|duration)\b`, "i"),
  // "Attribution lasts 30 days", "referrals last for 30 days", "within 30 days of the click".
  new RegExp(String.raw`\b(?:attribution|referrals?|tracking)\b[^.!?]{0,20}\b(?:lasts?|for|of|up to|is)\b[^.!?]{0,15}${DAYS}|${DAYS}\s+(?:of|after|from)\s+(?:the\s+)?(?:first\s+)?click`, "i"),
  // Payout minimum or threshold: "$50 minimum payout", "payout threshold", "USD 50 minimum".
  /\b(?:minimum|min\.?)\b[^.!?]{0,30}\b(?:payout|withdrawal|threshold|balance|cash-?out)s?\b|\bminimum\s+payments?\b|\b(?:payout|withdrawal|payment|cash-?out)s?\s+(?:minimum|threshold)\b|\bthreshold of\b/i,
  // Withdrawals: "can be requested from 25 USD", "are manually reviewed".
  new RegExp(String.raw`\bwithdrawals?\b[^.!?]{0,40}(?:${MONEY}|\bminimum\b|${FREQUENCY}|${DAYS}|\breviewed\b|\brequested\b)`, "i"),
  new RegExp(String.raw`${MONEY}[^.!?]{0,15}\bminimum\b|\bminimum\b[^.!?]{0,15}${MONEY}`, "i"),
  // Payment terms: "NET-30", "net 15".
  /\bnet[\s-]?\d{1,2}\b(?!\s*%)/i,
  // Payout minimum, hold or schedule: "payout needs $50", "payouts after 30 days", "Payouts are monthly".
  new RegExp(String.raw`\bpayouts?\b[^.!?]{0,60}(?:\bminimum\b|${DAYS})|\bpayouts?\b[^.!?]{0,15}\b(?:needs?|requires?|from|at least|over)\b[^.!?]{0,10}${MONEY}`, "i"),
  new RegExp(String.raw`\bpaid\s+(?:out\s+)?(?:${FREQUENCY}|via\b|through\b|by\s+(?:paypal|bank|wire|stripe))`, "i"),
  new RegExp(String.raw`\b(?:payable|paid out|on hold|hold period|holding period|held|clears?|cleared|validated|validation|availability)\b[^.!?]{0,30}${DAYS}|${DAYS}[^.!?]{0,10}\b(?:hold|holding period)\b`, "i"),
  /\bpaid\s+manually\b|\bmanual\s+payouts?\b/i,
  // Approval: "Applications are reviewed", "instant approval", "approved within 48 hours", "invite-only".
  /\b(?:applications?|applicants?|affiliates?|partners?|creators?|sign-?ups?)\s+(?:are|is|will be|must be|get|gets|need to be)\s+(?:\w+ly\s+)?(?:reviewed|approved|vetted|screened)\b/i,
  /\b(?:instant|instantly|automatic|automatically|auto|manual|manually|immediate|immediately)[\s-]+(?:approv\w*)|\bapprov\w*\s+(?:is\s+)?(?:instant|automatic|manual|immediate)\w*|\b(?:partner|affiliate|application)\s+approval\b/i,
  /\bapprov\w*\b[^.!?]{0,30}\bwithin\b|\bapproval\s+(?:time|process|takes)\b/i,
  /\binvit(?:e|ation)[\s-]only\b|\bby invitation\b|\bno\s+(?:approval|invite|invitation)\b/i,
]

/** True when this sentence states a cookie window, payout term or approval term. */
export function statesTerms(sentence: string): boolean {
  return TERM_SENTENCE.some((re) => re.test(sentence)) || (PAYOUT_SCHEDULE.test(sentence) && PROGRAM_CONTEXT.test(sentence))
}

/**
 * Contributor free text as a reader may see it: for an unverified program,
 * every sentence that states a cookie window, payout or approval term is
 * dropped whole (never rewritten); lines left empty by that go too. Verified
 * programs get their text unchanged.
 */
export function confirmedProse<T extends string | null | undefined>(p: { verified?: boolean | null }, text: T): T {
  if (termsConfirmed(p) || !text) return text
  const kept = text
    .split("\n")
    .map((line) => {
      const sentences = line.split(/(?<=[.!?])\s+/)
      const left = sentences.filter((s) => !statesTerms(s))
      return { line: left.length === sentences.length ? line : left.join(" "), emptied: left.length === 0 && line.trim() !== "" }
    })
    .filter((l) => !l.emptied)
    .map((l) => l.line)
  return kept.join("\n") as T
}

/** A list of free-text items (use cases, restrictions): unverified, items that state such a term are dropped. */
export function confirmedProseList<T extends string[] | null | undefined>(p: { verified?: boolean | null }, items: T): T {
  if (termsConfirmed(p) || !items) return items
  return items.map((item) => confirmedProse(p, item)).filter((item) => item.trim() !== "") as T
}
