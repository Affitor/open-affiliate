/**
 * A program's structured money fields agree with the figures its own prose
 * states. Three bugs of this class shipped on 2026-10-21: Seerist had
 * payout.minimum 50 while its conditions said $20; StoryChief had rate "50%"
 * while its conditions said "50% ... then 20%"; and a listing whose minimum is
 * in `conflicts` still stated "$20" in its conditions (#403).
 *
 * Detection only: these patterns flag a disagreement for a person to fix from
 * the brand's page. Nothing here may be used to fill a field from prose
 * (lessons 13/10 and 21/10, #184/#171/#389).
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { parse as parseYaml } from "yaml"

type Doc = {
  slug?: string
  description?: string
  short_description?: string
  cookie_days?: number | null
  commission?: { rate?: string; duration?: string | null; conditions?: string | null }
  payout?: { minimum?: number | null; currency?: string | null; frequency?: string | null; conditions?: string | null }
  agents?: { prompt?: string }
  conflicts?: { field?: string; values?: unknown[] }[]
}

const DIR = join(process.cwd(), "programs")
const registry = (): [string, Doc][] =>
  readdirSync(DIR)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => [f.replace(/\.yaml$/, ""), parseYaml(readFileSync(join(DIR, f), "utf8")) as Doc])

const sentences = (t: unknown): string[] => (typeof t === "string" ? t.split(/(?<=[.!?])\s+/) : [])

// ---------- payout minimum ----------

const CODES = "USD|EUR|GBP|CAD|AUD|CHF"
const MONEY = String.raw`(?:([$€£])\s?(\d[\d,]*(?:\.\d+)?)(?:\s?(${CODES}))?|(\d[\d,]*(?:\.\d+)?)\s?(${CODES})\b)`
/** Each pattern puts MONEY where the minimum's figure stands. Narrowed on the whole registry (see PR). */
const MINIMUM_FORMS = [
  // "$20 minimum", "a $50 payout threshold", "$25 withdrawal threshold", "($200 minimum)"
  String.raw`${MONEY}\s+(?:payout\s+|withdrawal\s+|payment\s+)?(?:minimum|threshold)\b`,
  // "minimum payout is $50", "minimum of 100 USD", "Payment Threshold €250", "minimum balance of 25 EUR"
  String.raw`\b(?:minimum|threshold)(?:\s+(?:payout|payment|balance|withdrawal|commission balance|payment threshold))?(?:\s+(?:is|of))?\s+${MONEY}`,
  // "once the balance is at least $20", "A payout needs at least $210", "At least $20 must be available"
  String.raw`\b(?:balance|once|payouts?|withdraw\w*|request\w*|needs?|owed|due|accumulat\w*|commissions? of)\b[^.;]{0,30}?\bat least\s+${MONEY}`,
  String.raw`\bat least\s+${MONEY}(?=\s+(?:must be available|is (?:earned|due|available)))`,
  // "once the balance reaches $50", "once earnings reach $100", "once you reach $50"
  String.raw`\b(?:balance|earnings|commissions?|statement|wallet|you)\s+(?:has\s+)?reach(?:es|ed)?\s+(?:the\s+|a\s+)?(?:minimum of\s+)?${MONEY}`,
  // "once $50 is reached"
  String.raw`\bonce\s+${MONEY}\s+is reached`,
].map((s) => new RegExp(s, "gi"))
const NO_MINIMUM = /\bno (?:payout )?minimum\b|\bno (?:payout )?thresholds?\b/i
const BY_WIRE = /\b(?:wire|bank transfer|bank wire)/i

type Figure = { amount: number; currency: string }
const SYMBOL: Record<string, string> = { "€": "EUR", "£": "GBP" }

/** The payout minimums a text states, with currency ("$" is read as the program's dollar currency). */
export function statedMinimums(text: string, dollar = "USD"): Figure[] {
  const out: Figure[] = []
  for (const re of MINIMUM_FORMS) {
    for (const m of text.matchAll(re)) {
      const [sym, a1, c1, a2, c2] = m.slice(1, 6)
      const amount = Number((a1 ?? a2).replace(/,/g, ""))
      const currency = (c1 ?? c2)?.toUpperCase() ?? (sym === "$" ? dollar : SYMBOL[sym])
      if (!out.some((f) => f.amount === amount && f.currency === currency)) out.push({ amount, currency })
    }
  }
  if (NO_MINIMUM.test(text)) out.push({ amount: 0, currency: "*" })
  return out
}

/** Programs whose conditions state a minimum, none of which is payout.minimum. */
export function minimumMismatches(docs: [string, Doc][]): string[] {
  const out: string[] = []
  for (const [slug, d] of docs) {
    const min = d.payout?.minimum
    if (typeof min !== "number") continue
    const currency = (d.payout?.currency ?? "USD").toUpperCase()
    const dollar = ["CAD", "AUD"].includes(currency) ? currency : "USD"
    // A wire or bank-transfer minimum is a second, higher floor for that method (Icons8, pCloud, Rocket.net).
    const text = [d.commission?.conditions, d.payout?.conditions].flatMap(sentences).filter((s) => !BY_WIRE.test(s)).join(" ")
    const stated = statedMinimums(text, dollar).filter((f) => f.currency === currency || f.currency === "*")
    if (stated.length && !stated.some((f) => f.amount === min))
      out.push(`${slug}: payout.minimum ${min} ${currency}, conditions state ${stated.map((f) => f.amount).join(" / ")}`)
  }
  return out
}

// ---------- commission rate step-down ----------

const STEP_DOWN = [
  // "50% of the first invoice, then 20% of every invoice after it"
  /(\d+(?:\.\d+)?)%[^.;]{0,120}?\bfirst\b[^.;]{0,60}?\bthen\s+(\d+(?:\.\d+)?)%/i,
  // "40% on the first year ...; 15% of ... after the first year"
  /()(\d+(?:\.\d+)?)%[^.;%]{0,60}?\bafter the first\b/i,
]

/**
 * Instapage (unverified, imported from PartnerStack) lists three plan-specific rates (40% then 15% on
 * annual plans, 30% on monthly ones) under type one-time and a 12-month duration; which rate string fits
 * needs a maintainer reading the brand's page. Remove it from here when fixed.
 */
const OPEN_RATE = new Set(["instapage"])

/** Programs with a single-percentage rate whose conditions step that rate down to another percentage. */
export function rateMismatches(docs: [string, Doc][]): string[] {
  const out: string[] = []
  for (const [slug, d] of docs) {
    if (OPEN_RATE.has(slug)) continue
    const rate = String(d.commission?.rate ?? "")
    if (!/^\d+(?:\.\d+)?%$/.test(rate.trim())) continue
    const value = parseFloat(rate)
    for (const s of sentences(d.commission?.conditions).flatMap((x) => x.split(/;\s*/))) {
      const m = STEP_DOWN.map((re) => s.match(re)).find(Boolean)
      if (m && parseFloat(m[2]) !== value) {
        out.push(`${slug}: rate "${rate}", conditions: ${s.trim()}`)
        break
      }
    }
  }
  return out
}

// ---------- a term stated two ways ----------

const PROSE: [string, (d: Doc) => unknown][] = [
  ["description", (d) => d.description],
  ["short_description", (d) => d.short_description],
  ["commission.conditions", (d) => d.commission?.conditions],
  ["payout.conditions", (d) => d.payout?.conditions],
  ["agents.prompt", (d) => d.agents?.prompt],
]

/** The figures a sentence states for a term, normalised so two spellings of one value count once. */
const FIGURES: Record<string, (s: string) => string[]> = {
  "payout.minimum": (s) => statedMinimums(s).map((f) => `${f.amount} ${f.currency}`),
  cookie_days: (s) =>
    [...s.matchAll(/\b(\d+)[- ]days?\s+(?:(?:first|last)[- ]click\s+)?(?:cookie|attribution|tracking|referral window)|\b(?:cookie|attribution window|tracking window)\b[^.;\d]{0,30}?\b(\d+)[- ]days?\b/gi)].map((m) => m[1] ?? m[2]),
  // A customer discount ("10% off") is not the commission.
  "commission.rate": (s) => [...s.matchAll(/\b(\d+(?:\.\d+)?)\s?%(?!\s+(?:off|discount)\b)/g)].map((m) => m[1]),
  // Only in a sentence about the commission: "inactive for 12 months" is not its length.
  "commission.duration": (s) =>
    !/commission|%|\bearn|\bpays?\b|\bpaid\b/i.test(s)
      ? []
      : [...s.matchAll(/\b(lifetime|for life)\b|\b(?:first|for|up to)\s+(\d+)\s+(months?|years?)\b|\b(\d+)[- ](month|year)s?\b/gi)].map((m) =>
          m[1] ? "lifetime" : `${m[2] ?? m[4]} ${(m[3] ?? m[5]).replace(/s$/, "").toLowerCase()}`,
        ),
  "payout.frequency": (s) =>
    // "monthly" alone is often a plan ("monthly Bronze plan"), so only a schedule of payment counts.
    [...s.matchAll(/\b(net[- ]?\d+|held \d+ days?|(?:paid|payouts?(?: are| go out)?)\s+(?:out\s+)?(?:monthly|weekly|bi-weekly|quarterly|twice a month))\b/gi)].map((m) => m[1].toLowerCase()),
}

/**
 * A sentence that says the term is stated two ways, or whose source it is ("the terms say ..."), is
 * the allowed form; the bug is an unattributed figure such as Affitor's "At least $20 must be available"
 * on a listing whose brand page states another minimum (#403).
 */
const TWO_WAYS =
  /two ways|\bboth\b|\bwhile\b|\bwhereas\b|\binstead\b|\banother\b|\bdisagree|\bconflict|\bseparately\b|\b(?:page|terms|agreement|FAQ|listing|headline|guide|policy|help center)\b[^.;]{0,25}\b(?:says?|lists?|states?|gives?|offers?|advertises?|sets?|describes?|limits?)\b/i

/** Every figure of the term's unit in a sentence, wherever it stands: two of them name both values. */
const UNIT: Record<string, RegExp> = {
  "payout.minimum": new RegExp(MONEY, "gi"),
  cookie_days: /\b\d+[- ]days?\b/gi,
  "commission.rate": /\b\d+(?:\.\d+)?\s?%/g,
  "commission.duration": /\b(?:lifetime|for life|\d+[- ](?:months?|years?))\b/gi,
  "payout.frequency": /\b(?:net[- ]?\d+|monthly|weekly|bi-weekly|quarterly|twice a month|held \d+ days?)\b/gi,
}

/** Sentences that state one figure for a term the program records as stated two ways. */
export function conflictStatements(docs: [string, Doc][]): string[] {
  const out: string[] = []
  for (const [slug, d] of docs) {
    for (const field of new Set((d.conflicts ?? []).map((c) => String(c.field)))) {
      const figures = FIGURES[field]
      // An open field conflict: the prose agrees with the recorded value, and both wait on one decision.
      if (!figures || OPEN_FIELD_CONFLICTS.some((o) => o.startsWith(`${slug}: ${field} =`))) continue
      for (const [name, get] of PROSE)
        for (const s of sentences(get(d))) {
          const found = new Set(figures(s))
          // A sentence naming both values ("60 days on the brand's page and 90 days on Affitor") is allowed.
          const named = new Set((s.match(UNIT[field]) ?? []).map((x) => x.toLowerCase().replace(/[^a-z0-9.]/g, "")))
          if (found.size > 0 && named.size < 2 && !TWO_WAYS.test(s)) out.push(`${slug} ${name} states ${field} ${[...found].join(" / ")}: ${s.trim()}`)
        }
    }
  }
  return out
}

/**
 * commission.rate and commission.duration still carrying a value while `conflicts` names them. The
 * schema requires a rate, so the convention is a placeholder ("varies", mode unknown); a duration is
 * left out. Each of these needs a decision a maintainer has not made yet (listed in the PR that added this test):
 * the first two are owned by the Affitor sync, which rewrites them; the last two record a conflict
 * that may describe a plan-specific rate or a cap rather than two rates. Remove a line when it is fixed.
 */
const OPEN_FIELD_CONFLICTS = [
  `adliked: commission.rate = "80%"`,
  `review-reply-ai: commission.duration = "lifetime"`,
  `eleven-labs-inc: commission.rate = "22%"`,
  `flowmattic: commission.rate = "20%"`,
]

export function fieldConflicts(docs: [string, Doc][]): string[] {
  const out: string[] = []
  for (const [slug, d] of docs)
    for (const c of d.conflicts ?? []) {
      if (c.field === "commission.rate" && /\d/.test(d.commission?.rate ?? "")) out.push(`${slug}: commission.rate = ${JSON.stringify(d.commission?.rate)}`)
      if (c.field === "commission.duration" && d.commission?.duration != null) out.push(`${slug}: commission.duration = ${JSON.stringify(d.commission.duration)}`)
    }
  return out
}

// ---------- tests ----------

test("payout.minimum equals the minimum its own conditions state", () => {
  assert.deepEqual(minimumMismatches(registry()), [], "fix the field or the sentence from the brand's page; never copy a figure from prose")
})

test("a single-percentage commission.rate is not stepped down by its own conditions", () => {
  assert.deepEqual(rateMismatches(registry()), [], 'write the step into the rate ("50% then 20%"), as the page states it')
})

test("no prose field states one figure for a term recorded as stated two ways", () => {
  assert.deepEqual(conflictStatements(registry()), [], "remove the figure, or name both values in one sentence")
})

test("commission.rate and commission.duration in conflicts carry no value, apart from the open list", () => {
  assert.deepEqual(fieldConflicts(registry()).sort(), [...OPEN_FIELD_CONFLICTS].sort())
})

test("the checks catch each bug that shipped (fixtures)", () => {
  const doc = (d: Doc): [string, Doc][] => [["fixture", d]]
  // Seerist, 2026-10-21: minimum 50, conditions "$20".
  const seerist: Doc = { payout: { minimum: 50, currency: "USD" }, commission: { conditions: "At least $20 must be available before a withdrawal request." } }
  assert.equal(minimumMismatches(doc(seerist)).length, 1)
  assert.equal(minimumMismatches(doc({ ...seerist, payout: { minimum: 20, currency: "USD" } })).length, 0)
  // Every minimum form found in the registry reads its figure.
  for (const [text, amount] of [
    ["Paid once you reach the $20 minimum.", 20],
    ["The minimum payout is €50, and smaller balances carry over.", 50],
    ["Payment Threshold €250;", 250],
    ["once the balance reaches 50 EUR", 50],
    ["the balance must reach $1,000", null],
    ["Payouts are requested through PayPal once $50 is reached.", 50],
    ["A payout needs at least $210 in commission and two referrals.", 210],
    ["A $50 bonus is paid when a partner you refer earns at least $400 in commissions.", null],
    ["The commission table reaches $200 per sale.", null],
  ] as [string, number | null][]) {
    const got = statedMinimums(text).map((f) => f.amount)
    assert.deepEqual(got, amount == null ? [] : [amount], text)
  }
  // A different currency is not compared.
  assert.equal(minimumMismatches(doc({ payout: { minimum: 110, currency: "USD" }, commission: { conditions: "Minimum payout is 100 EUR or 110 USD." } })).length, 0)
  // StoryChief, 2026-10-21: rate "50%", conditions "50% ... then 20%".
  const storychief: Doc = { commission: { rate: "50%", conditions: "50% of the referred client's first invoice, then 20% of every invoice after it." } }
  assert.equal(rateMismatches(doc(storychief)).length, 1)
  assert.equal(rateMismatches(doc({ commission: { ...storychief.commission, rate: "50% then 20%" } })).length, 0)
  // #403: minimum in conflicts, conditions still state the Affitor $20.
  const twoWays: Doc = { payout: { currency: "USD" }, commission: { conditions: "At least $20 must be available before a withdrawal request." }, conflicts: [{ field: "payout.minimum" }] }
  assert.equal(conflictStatements(doc(twoWays)).length, 1)
  // Webzon AI's form, both values in one sentence, passes.
  const webzon: Doc = { agents: { prompt: "The cookie window is stated as 60 days on the brand's page and 90 days on Affitor, and the payout minimum as $50 on the brand's page and $20 on Affitor." }, conflicts: [{ field: "payout.minimum" }, { field: "cookie_days" }] }
  assert.deepEqual(conflictStatements(doc(webzon)), [])
  assert.equal(conflictStatements(doc({ ...webzon, agents: { prompt: "Pays 20% with a 90-day cookie." } })).length, 1)
})
