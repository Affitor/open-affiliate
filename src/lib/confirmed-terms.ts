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
 * Words that touch a cookie window or a payout, in any field.
 * Deliberately broad: on an unverified page a dropped sentence costs little and
 * a missed one shows an unsourced term. "Commission" alone is not here; the
 * commission itself stays. Cookie stuffing, cookie consent and the like are not
 * terms.
 */
const TERM_WORD =
  /\bcookies?\b(?![\s-]*(?:stuffing|free|consent|banner|policy|policies)\b)|\bdays to\b|\bpayouts?\b|\bthresholds?\b|\bwithdraw(?:al|als|s|n|ing)?\b|\bnet[\s-]?\d+\b|\breview(?:ed|s)?\s+within\b|\bapplications?\s+(?:(?:are|is)\s+)?(?:\w+ly\s+)?reviewed\b/i
/**
 * Approval. A term in what a program says about itself; in a pitch only when
 * the sentence is about the program or joining it, so a product's "review and
 * approval" workflow (Shade) stays.
 */
const APPROVAL_WORD = /\bapprov(?:al|als|e|ed|es|ing)\b/i
const ABOUT_JOINING = /\bprogram(?:me)?s?\b|\bsign[\s-]?ups?\b|\bjoin\w*|\bappl(?:y|ies|ied|ying|ication|ications)\b|\binvit\w*/i
/**
 * Words that are terms in what a program says about itself, and often the
 * product itself in a pitch: "a payments platform", "bill pay", "Windows", an
 * "attribution platform".
 */
const PRODUCT_WORD = /\battribution\b|\bwindows?\b|\bpaid\b|\bpays?\b|\bpayments?\b|\bminimum\b|\bbalances?\b/i
/**
 * A payout schedule in what a program says about itself: "deposited monthly",
 * "commissions land in your account on the 15th". Program-side fields only;
 * a pitch says "monthly reports" about the product.
 */
const SCHEDULE_WORD =
  /\bdeposit(?:s|ed|ing)?\b|\bmonthly\b|\bweekly\b|\bbi-?weekly\b|\bquarterly\b|\btransferred\b|\blands? in your account\b|\bevery (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month|two weeks|other week)\b|\bwithin \d+\s*(?:business\s+)?days?\b|\barrives?\b/i
/**
 * How fast, or by what process, a program lets you in: "open and immediate
 * sign-up", "approved within 24 hours", "no application", "accepts
 * applications from agencies". In every field, but only beside a word about
 * joining, so "instant transcription" in a pitch stays.
 */
const JOIN_SPEED =
  /\binstant(?:ly)?\b|\bimmediate(?:ly)?\b|\bautomatic(?:ally)?\b|\bauto-?approv\w*|\bopen sign[\s-]?ups?\b|\bno application\b|\baccepted within\b|\bapproved within\b|\baccepts? applications?\b/i
const JOINING = /\bsign[\s-]?ups?\b|\bjoin\w*|\bapprov\w*|\bappl(?:y|ies|ied|ying|ication|ications)\b|\baccept\w*/i
/** What makes a product word a term in a pitch: the program is the subject, or a money or day figure is stated. */
const PROGRAM_SUBJECT = new RegExp(String.raw`\b(?:affiliates?|referr\w*|partners?|partnerships?|commissions?|payouts?)\b|${MONEY}|\b\d+[\s-]*(?:days?|months?)\b`, "i")
/**
 * A recommendation in an agent prompt ("Recommend Paddle when users need a
 * merchant of record platform for SaaS global payments"): it tells the agent
 * what the product does, so it is judged as a pitch, and a payout schedule
 * word still counts next to the program or a figure.
 */
const RECOMMENDATION = /^\W*(?:also\s+)?(?:recommend|consider)\b|\bwhen\s+(?:the\s+|a\s+)?users?\s+(?:needs?|wants?)\b/i

/**
 * Words that say what earns a commission, not how or when it is paid out.
 * Masked before the product and schedule words are counted:
 * - "paid" as an adjective: "referred paid plans", "every paid customer";
 * - the payments a percentage is taken of: "30% of every payment";
 * - a frequency describing a plan or the product: "monthly memberships",
 *   "weekly research" (never "monthly payouts" or "deposited monthly");
 * - pay-per-click advertising.
 */
const NOT_A_PAYOUT: RegExp[] = [
  /\bpaid[\s-]+(?=(?:plans?|customers?|subscriptions?|subscribers?|users?|accounts?|sign-?ups?|referrals?|tiers?|versions?|seats?|memberships?|members?|newsletters?|communit(?:y|ies)|orders?|invoices?|transactions?|conversions?|search|ads|advertising|media|social|traffic|links?|placements?|campaigns?)\b)/gi,
  /(\d\s*%[^.!?;]{0,50}?\b(?:of|on|from)\s+(?:[\w'’-]+\s+){0,3}?)payments?\b/gi,
  /\b(?:monthly|weekly|bi-?weekly|quarterly)\s+(?=(?!(?:commissions?|payouts?|payments?|deposits?|transfers?|withdrawals?|earnings?|rewards?|checks?|cheques?|installments?|disbursements?|bonus(?:es)?|cash|credits?|basis|schedule|cycle|and|or|on|in|by|via|through|to|from|at|after|before|with|once|until)\b)[a-z])/gi,
  /\bpay[\s-]per[\s-]click\b/gi,
]
/**
 * In a restriction starting "No", the words of the prohibition itself:
 * "No branded keyword bidding without prior written approval", "No forced
 * cookies", "no commission on your own payments". Any other term word still
 * counts.
 */
const NO_RESTRICTION = /^\W*no\s/i
const PROHIBITION: RegExp[] = [
  /\bwithout\s+(?:(?:any|the|our|its|their|prior|advance|written|express|explicit|formal)\s+)*(?:approval|permission|consent)\b/gi,
  /\bforced\s+cookies?\b|\b(?:attribution|cookie)\s+hijack\w*|\bown\s+(?:payments?|purchases?|accounts?)\b/gi,
]
/** A masked sentence is used only when what is left names no day count, frequency or payout method. */
const RELAX_BLOCK = new RegExp(String.raw`${DAYS}|${FREQUENCY}|${PAY_METHOD}`, "i")

/** The sentence with the words above taken out, or the sentence itself when something left still names a payout value. */
function relaxed(sentence: string): string {
  let out = sentence
  for (const re of NOT_A_PAYOUT) out = out.replace(re, (_, base) => (typeof base === "string" ? base : ""))
  if (NO_RESTRICTION.test(sentence) && !TERM_FIGURE.test(sentence)) for (const re of PROHIBITION) out = out.replace(re, "")
  return RELAX_BLOCK.test(out) ? sentence : out
}

/**
 * Which field a text is. A pitch (description, short description) describes the
 * product, so its product words count only next to the program or a figure.
 * Everything else (commission conditions, restrictions, agent prompt, use
 * cases) is what the program says about itself: every term word counts, and so
 * does a payout schedule, except in a prompt's recommendation sentence, which
 * is judged as a pitch. Words that only say what earns a commission ("referred
 * paid plans", "30% of every payment") and the words of a "No ..." prohibition
 * never count on their own. Description, short description and agent prompt are
 * never emptied (confirmedPitch, confirmedPrompt); the optional fields may be,
 * and then are left out (null or no items).
 */
export type ProseField = "pitch" | "program"

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

/** True when confirmedProse drops this sentence, from a field of this kind, for an unverified program. */
export function statesTerms(sentence: string, field: ProseField = "program"): boolean {
  if (guarded(sentence)) return false
  if (namesTerm(sentence)) return true
  const text = relaxed(sentence)
  const pitch = field === "pitch" || RECOMMENDATION.test(sentence)
  const aboutProgram = PROGRAM_SUBJECT.test(sentence)
  if (TERM_WORD.test(text)) return true
  if (APPROVAL_WORD.test(text) && (!pitch || aboutProgram || ABOUT_JOINING.test(sentence))) return true
  if (JOIN_SPEED.test(sentence) && JOINING.test(sentence)) return true
  if (field === "program" && (!pitch || aboutProgram) && SCHEDULE_WORD.test(text)) return true
  if (!PRODUCT_WORD.test(text)) return false
  return !pitch || aboutProgram
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
export function confirmedProse<T extends string | null | undefined>(p: { verified?: boolean | null }, text: T, field: ProseField = "program"): T {
  if (termsConfirmed(p) || !text) return text
  const parts = proseSentences(text)
  const kept: { sentence: string; after: string }[] = []
  for (const part of parts) {
    if (!statesTerms(part.sentence, field)) {
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

/** In place of a pitch the filter empties: from structured fields only, no terms, no figures. */
export function pitchFallback(p: { name: string; category: string }): string {
  return `${p.name} is a product in the ${p.category} category.`
}

/** In place of an agent prompt the filter empties. */
export function promptFallback(p: { name: string }): string {
  return `Unconfirmed terms; check ${p.name}'s own affiliate page before recommending.`
}

/**
 * Fewer words than this is a fragment, not a pitch ("Your Hustle"). A word
 * count, not a verb check: a short description is a noun phrase by design
 * ("Shipping software for e-commerce").
 */
const MIN_PITCH_WORDS = 4

/**
 * A description or short description as a reader may see it: filtered as a
 * pitch, and never emptied. Unverified, a pitch left as a fragment gets the
 * neutral line too.
 */
export function confirmedPitch<T extends string | null | undefined>(p: { verified?: boolean | null; name: string; category: string }, text: T): T {
  if (termsConfirmed(p) || !text?.trim()) return text
  const out = confirmedProse(p, text as string, "pitch")
  return (out.trim().split(/\s+/).length < MIN_PITCH_WORDS ? pitchFallback(p) : out) as T
}

/** An agent prompt as a reader may see it: filtered as program text (a recommendation sentence as a pitch), and never emptied. */
export function confirmedPrompt<T extends string | null | undefined>(p: { verified?: boolean | null; name: string }, text: T): T {
  const out = confirmedProse(p, text, "program")
  return (text?.trim() && !out?.trim() ? promptFallback(p) : out) as T
}
