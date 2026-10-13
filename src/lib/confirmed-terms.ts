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

/**
 * Any word that touches a cookie window, payout or approval. Deliberately
 * broad: on an unverified page a dropped sentence costs little and a missed
 * one shows an unsourced term. "Commission" alone is not here; the commission
 * itself stays. Cookie stuffing, cookie consent and the like are not terms.
 */
const TERM_WORD =
  /\bcookies?\b(?![\s-]*(?:stuffing|free|consent|banner|policy|policies)\b)|\battribution\b|\bwindows?\b|\bdays to\b|\bpayouts?\b|\bpaid\b|\bpays?\b|\bpayments?\b|\bminimum\b|\bthresholds?\b|\bwithdraw(?:al|als|s|n|ing)?\b|\bbalances?\b|\bnet[\s-]?\d+\b|\bapprov(?:al|als|e|ed|es|ing)\b|\breview(?:ed|s)?\s+within\b|\bapplications?\s+(?:(?:are|is)\s+)?(?:\w+ly\s+)?reviewed\b/i

/** A figure or a value a term takes: a number, an amount, a schedule, a method. */
const TERM_FIGURE = new RegExp(String.raw`\d|${MONEY}|${FREQUENCY}|${PAY_METHOD}`, "i")
const TERM_VALUE = new RegExp(String.raw`${TERM_FIGURE.source}|\b(?:instant|instantly|automatic|automatically|manual|manually|immediate|immediately|invite)\b`, "i")
/** "Do not promise earnings, automatic approval or automatic payouts." */
const GUARDRAIL = /^\W*(?:do not|don't|never|avoid)\b/i
/** "No standard public commission percentage, cookie duration or payout schedule is asserted here." */
const NOT_STATED = /\b(?:not|no|never|nor|isn't|aren't)\b[^.!?]*\b(?:published|public|specified|stated|confirmed|disclosed|asserted|listed)\b/i

/**
 * A guardrail or a disclaimer, kept on every page: an instruction not to
 * promise something, or a sentence saying the terms are not published. Never
 * when it carries a figure; a disclaimer also carries no term value at all.
 */
function guarded(sentence: string): boolean {
  if (GUARDRAIL.test(sentence)) return !TERM_FIGURE.test(sentence)
  return NOT_STATED.test(sentence) && !TERM_VALUE.test(sentence)
}

/**
 * True when a sentence states a cookie window, payout term or approval term in
 * one of the phrasings registry prose uses. The verifier scans whole pages
 * with this one: it does not fire on page chrome ("rankings are never paid").
 */
export function namesTerm(sentence: string): boolean {
  if (guarded(sentence)) return false
  return TERM_SENTENCE.some((re) => re.test(sentence)) || (PAYOUT_SCHEDULE.test(sentence) && PROGRAM_CONTEXT.test(sentence))
}

/** True when confirmedProse drops this sentence for an unverified program: any term word, or a named term. */
export function statesTerms(sentence: string): boolean {
  if (guarded(sentence)) return false
  return TERM_WORD.test(sentence) || namesTerm(sentence)
}

/**
 * The sentences of a text, each with the whitespace that followed it. A
 * sentence ends at . ! or ? before whitespace, at a blank line, or before a
 * list item; a single line break inside a sentence (a wrapped line) does not
 * end it, so a sentence spread over lines is judged, and dropped, whole.
 */
export function proseSentences(text: string): { sentence: string; after: string }[] {
  const out: { sentence: string; after: string }[] = []
  let last = 0
  for (const m of text.matchAll(/(?<=[.!?])\s+|\n[^\S\n]*\n\s*|\n(?=[^\S\n]*(?:[-*•]|\d+[.)])\s)/g)) {
    out.push({ sentence: text.slice(last, m.index!), after: m[0] })
    last = m.index! + m[0].length
  }
  out.push({ sentence: text.slice(last), after: "" })
  return out
}

/**
 * Contributor free text as a reader may see it: for an unverified program,
 * every sentence that states a cookie window, payout or approval term is
 * dropped whole, never rewritten. Text with nothing to drop, and every
 * verified program's text, comes back unchanged.
 */
export function confirmedProse<T extends string | null | undefined>(p: { verified?: boolean | null }, text: T): T {
  if (termsConfirmed(p) || !text) return text
  const parts = proseSentences(text)
  const kept: { sentence: string; after: string }[] = []
  for (const part of parts) {
    if (!statesTerms(part.sentence)) {
      kept.push({ ...part })
      continue
    }
    // A dropped sentence's paragraph or list break stays with the sentence before it.
    const prev = kept.at(-1)
    if (prev && part.after.includes("\n") && !prev.after.includes("\n")) prev.after = part.after
  }
  if (kept.length === parts.length) return text
  return kept
    .map((k) => k.sentence + k.after)
    .join("")
    .trimEnd() as T
}

/** A list of free-text items (use cases, restrictions): unverified, the sentences stating a term are dropped, and items left empty go. */
export function confirmedProseList<T extends string[] | null | undefined>(p: { verified?: boolean | null }, items: T): T {
  if (termsConfirmed(p) || !items) return items
  return items.map((item) => confirmedProse(p, item)).filter((item) => item.trim() !== "") as T
}
