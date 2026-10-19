/**
 * Per-file rules build-registry applies, kept pure (the one import,
 * confirmed-terms, has none of its own) so scripts/no-program.test.ts can run
 * them: importing build-registry itself builds the registry.
 */
import { proseSentences, statesTerms, termsConfirmed } from "../src/lib/confirmed-terms"

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

/**
 * Alias → slug for every alias that can be a URL, across the whole registry.
 * build-registry writes `routes` into registry.json; next.config.ts turns each
 * one into a 308 from /programs/<alias> (and its .md) to the program, and the
 * REST API and MCP get_program answer it with the program
 * (src/lib/program-aliases.ts). This is the only place the rule lives:
 *
 * - An alias is compared lowercased and trimmed. One that is not slug-shaped
 *   ("eleven labs", "appqr.io") stays a search name and gets no route.
 * - A real slug always wins. Redirects run before pages, so an alias equal to
 *   another program's slug would hide that program's page; it goes to
 *   `shadowed` instead of `routes`.
 * - The same alias on two programs has no right answer: it goes to `clashes`,
 *   and build-registry fails.
 */
export function aliasRoutes(programs: readonly { slug: string; aliases?: unknown[] }[]): {
  routes: Record<string, string>
  shadowed: string[]
  clashes: string[]
} {
  const slugs = new Set(programs.map((p) => p.slug))
  const routes = new Map<string, string>()
  const shadowed: string[] = []
  const clashes: string[] = []
  for (const p of programs) {
    for (const raw of p.aliases ?? []) {
      const alias = String(raw).trim().toLowerCase()
      if (alias === p.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(alias)) continue
      if (slugs.has(alias)) {
        shadowed.push(`${p.slug}: alias "${alias}" is another program's slug, so that program keeps the URL`)
        continue
      }
      const owner = routes.get(alias)
      if (owner && owner !== p.slug) clashes.push(`alias "${alias}" is claimed by both ${owner} and ${p.slug}`)
      else routes.set(alias, p.slug)
    }
  }
  return {
    routes: Object.fromEntries([...routes].sort(([a], [b]) => a.localeCompare(b))),
    shadowed,
    clashes,
  }
}

/** The terms a `not_published` marker may name (schema: not_published.properties). */
export const NOT_PUBLISHED_FIELDS = ["commission.duration", "cookie_days", "payout.minimum", "payout.methods", "payout.frequency", "approval", "restrictions"]

/**
 * A `not_published` marker makes OAS score the term Not published, so a typo
 * must fail the build rather than leave the term unassessed: a map of known
 * term names to real YYYY-MM-DD dates, nothing else.
 */
export function notPublishedProblems(data: Record<string, unknown>): string[] {
  const marker = data.not_published
  if (marker === undefined) return []
  if (marker === null || typeof marker !== "object" || Array.isArray(marker)) return ["not_published must be a map of term to date"]
  const problems: string[] = []
  for (const [field, date] of Object.entries(marker)) {
    if (!NOT_PUBLISHED_FIELDS.includes(field)) problems.push(`not_published names an unknown term "${field}" (one of ${NOT_PUBLISHED_FIELDS.join(", ")})`)
    const ok = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date
    if (!ok) problems.push(`not_published.${field} must be a real date written YYYY-MM-DD, got ${JSON.stringify(date)}`)
  }
  return problems
}

/**
 * commission.rate and commission.duration (and the also_on Affitor
 * commission's) are shown verbatim on every surface: page, API, MCP, .md,
 * list chips. For an unverified program confirmedTerms withholds cookie,
 * payout and approval terms and drops every free-text sentence that states
 * one (statesTerms); the rate and duration get the same rule here, at data
 * entry, so no such sentence is stored where it would be shown. A verified
 * program withholds nothing. Rephrase rather than drop: "100% of the first
 * charge", not "first payment".
 */
export function commissionTermProblems(data: Record<string, unknown>): string[] {
  if (termsConfirmed(data as { verified?: boolean | null })) return []
  const alsoOn = (data.also_on as { affitor?: { commission?: unknown } } | null | undefined)?.affitor?.commission
  const problems: string[] = []
  for (const [where, commission] of [["commission", data.commission], ["also_on.affitor.commission", alsoOn]] as const) {
    for (const field of ["rate", "duration"]) {
      const value = (commission as Record<string, unknown> | null | undefined)?.[field]
      if (value == null) continue
      const sentence = proseSentences(String(value)).find((s) => statesTerms(s.sentence, "program"))
      if (sentence) problems.push(`${where}.${field} states a cookie, payout or approval term, which an unverified program withholds: ${JSON.stringify(value)}`)
    }
  }
  return problems
}

/** Frequencies that name a payment cadence and no waiting period. */
const CADENCES = new Set(["daily", "weekly", "bi-weekly", "twice-monthly", "monthly"])
const DAYS_AFTER = /\bdays?\s+(?:after|following)\b/gi
const UNITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]
const NUMBER_WORD = new RegExp(String.raw`\b(?:(${TENS.slice(2).join("|")})(?:[\s-](${UNITS.slice(1, 10).join("|")}))?|(${UNITS.join("|")}))\b`, "gi")
/** "sixty" → "60", "forty-five" → "45", "fifteen" → "15". */
const digits = (text: string) =>
  text.replace(NUMBER_WORD, (_, tens?: string, unit?: string, small?: string) =>
    String(small ? UNITS.indexOf(small.toLowerCase()) : TENS.indexOf(tens!.toLowerCase()) * 10 + (unit ? UNITS.indexOf(unit.toLowerCase()) : 0)),
  )
/** Currency signs and codes, numbers, words, and single marks, as separate tokens. */
const TOKEN = /[$€£¥₹]|\d+(?:\.\d+)?|[A-Za-z]+|[^\sA-Za-z\d]/g
const JOIN = new Set([",", "-", "–", "or", "and", "to"])
/** A number right after one of these is an amount ("$100", "USD 100") or a date ("May 31"), never days. */
const notCount = (token: string | undefined) =>
  token != null && (/^[$€£¥₹]$/.test(token) || /^[A-Z]{3}$/.test(token) || /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*$/.test(token))
/** "the end of the third month following" waits about 30 days a month. */
const ORDINALS = ["second", "third", "fourth", "fifth", "sixth"]
const MONTHS_AFTER = new RegExp(String.raw`\b(${ORDINALS.join("|")}|[2-6](?:nd|rd|th))\s+(?:calendar\s+)?months?\s+(?:following|after)\b`, "gi")
/** A clause about refunds, returns or the cookie, with no payment word, states no payout wait. */
const NOT_PAYOUT = /\b(?:refund|return|chargeback|cancel|cookie|click)/i
const PAYMENT = /\b(?:pa(?:id|y\w*)|held|hold\w*|sent|issued|released|disburs\w*|lock\w*|review\w*)\b/i

/**
 * The wait a "days after" names: the largest number of the count written
 * right before it, read token by token backwards: "45", "forty-five (45)",
 * "35-40 business", "120, 60, or 10", "120,60 or 10". A number after a
 * currency sign or code ("$100", "USD 1,500") is an amount and one after a
 * month ("May 31") a date; either, like a decimal or any other word, ends
 * the count. 0 when no count precedes. Linear: one pass over at most 200
 * characters.
 */
function waitBefore(text: string): number {
  // "$1,500": a thousands group is one number, so its last digits are not a count.
  const tokens = digits(text.slice(-200)).replace(/(\d),(?=\d{3}(?!\d))/g, "$1").match(TOKEN) ?? []
  if (/^(?:business|calendar)$/i.test(tokens.at(-1) ?? "")) tokens.pop()
  let wait = 0
  let counted = false
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i]
    if (/^\d+$/.test(t) && !notCount(tokens[i - 1])) {
      wait = Math.max(wait, Number(t))
      counted = true
    } else if (!(t === "(" || t === ")" || (counted && JOIN.has(t.toLowerCase())))) {
      break
    }
  }
  return wait
}

/**
 * The longest wait one clause states: "N days after/following", or "the
 * Nth month following" at 30 days a month. A clause about refunds, returns
 * or the cookie that names no payment ("refunds are accepted up to 60 days
 * after purchase") states none.
 */
function clauseWait(clause: string): number {
  if (NOT_PAYOUT.test(clause) && !PAYMENT.test(clause)) return 0
  const days = [...clause.matchAll(DAYS_AFTER)].map((m) => waitBefore(clause.slice(0, m.index)))
  const months = [...clause.matchAll(MONTHS_AFTER)].map((m) => {
    const word = ORDINALS.indexOf(m[1].toLowerCase())
    return 30 * (word >= 0 ? word + 2 : Number(m[1][0]))
  })
  return Math.max(0, ...days, ...months)
}

/**
 * A commission paid N days after the sale, the customer's payment or the end
 * of the month waits N days, whatever the batch cadence: up to 30 days is
 * net-30, 31 to 60 is net-60. A file whose conditions state a longer wait
 * while `payout.frequency` names a cadence scores the brand on the batch and
 * hides the wait; a 30-program accuracy check found it in hunter, vyond and
 * credit-repair-cloud. One problem per sentence, quoted. Files that predate
 * the rule are listed in schema/payout-lag-debt.json.
 */
export function payoutLagProblems(data: Record<string, unknown>): string[] {
  const payout = (data.payout ?? {}) as Record<string, unknown>
  const frequency = payout.frequency
  if (typeof frequency !== "string" || !CADENCES.has(frequency)) return []
  const commission = (data.commission ?? {}) as Record<string, unknown>
  const problems: string[] = []
  for (const [where, text] of [["payout.conditions", payout.conditions], ["commission.conditions", commission.conditions]] as const) {
    if (typeof text !== "string") continue
    for (const { sentence } of proseSentences(text)) {
      const days = Math.max(0, ...sentence.split(";").map(clauseWait))
      if (days > 30) {
        problems.push(
          `payout.frequency is ${frequency}, but ${where} states a ${days}-day wait (${JSON.stringify(sentence.trim())}); ` +
            `up to 30 days is net-30, 31-60 is net-60, and a conflict records pages that disagree`
        )
      }
    }
  }
  return problems
}
