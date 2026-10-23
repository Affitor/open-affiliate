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
 *
 * Scope: honest drift by maintainers and sync bots, not adversarial prose written to slip past the patterns.
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
const NO_MINIMUM = /\b(?:no|zero) (?:payout )?minimum\b|\bno (?:payout )?thresholds?\b/i
const BY_WIRE = /\b(?:wire|bank transfer|bank wire)/i
const METHOD = /\b(?:paypal|wise|payoneer|stripe|crypto|check|account credit|credits|wire|bank transfer|bank wire)\b/g

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

/** Programs whose conditions state a minimum other than payout.minimum (every stated minimum must match). */
export function minimumMismatches(docs: [string, Doc][]): string[] {
  const out: string[] = []
  for (const [slug, d] of docs) {
    const min = d.payout?.minimum
    if (typeof min !== "number") continue
    const currency = (d.payout?.currency ?? "USD").toUpperCase()
    const dollar = ["CAD", "AUD"].includes(currency) ? currency : "USD"
    const off: Figure[] = []
    for (const s of [d.commission?.conditions, d.payout?.conditions].flatMap(sentences)) {
      const stated = statedMinimums(s, dollar).filter((f) => f.currency === currency || f.currency === "*")
      const amounts = new Set(stated.map((f) => f.amount))
      // A wire or bank-transfer floor above the minimum is that method's own (Icons8, pCloud, Rocket.net).
      if (BY_WIRE.test(s) && stated.every((f) => f.amount > min)) continue
      // Two methods with two different floors give one each ("Wise with no minimum, or PayPal with a $200 minimum").
      // A sentence with one figure is always checked, whatever methods it names (Codex r2 #410).
      if (amounts.size > 1 && new Set(s.toLowerCase().match(METHOD) ?? []).size > 1) continue
      // One matching statement does not excuse another that contradicts it (Codex r1 #410).
      off.push(...stated.filter((f) => f.amount !== min))
    }
    if (off.length) out.push(`${slug}: payout.minimum ${min} ${currency}, conditions also state ${[...new Set(off.map((f) => f.amount))].join(" / ")}`)
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
 * The bug is an unattributed figure such as Affitor's "At least $20 must be available" on a listing whose
 * brand page states another minimum (#403). A sentence is allowed only when it says the term is stated
 * two ways, or names every value recorded in `conflicts[].values`. Words like "both", "while" or a second
 * amount are not enough ("… for both individuals and businesses", "$20, with a $5 fee"; Codex r1 #410).
 */
const TWO_WAYS = /\b(?:stated|states|gives?|given|lists?|listed|sets?) [^.;]{0,40}\btwo ways\b|\btwo ways\b/i

/** Every value of the conflict appears in the sentence: a number as a standalone figure, a phrase as text. */
function namesValues(s: string, field: string, values: unknown[] | undefined): boolean {
  if (!values?.length) return false
  const text = s.toLowerCase().replace(/,(?=\d{3})/g, "")
  // Each value must appear in the field's unit, so "$50 processing fee" or "after 50 days" does not name a $50 minimum.
  const unit: Record<string, (n: string) => RegExp> = {
    "payout.minimum": (n) => new RegExp(`(?:[$€£]\\s?${n}(?![\\d.])|(?<![\\d.])${n}\\s?(?:usd|eur|gbp|cad|aud|chf)\\b)(?!\\s+(?:\\w+\\s+)?fees?\\b)`),
    cookie_days: (n) => new RegExp(`(?<![\\d.])${n}[- ]days?\\b`),
    "commission.rate": (n) => new RegExp(`(?<![\\d.])${n}\\s?%`),
    "commission.duration": (n) => new RegExp(`(?<![\\d.])${n}[- ](?:months?|years?)\\b`),
  }
  if (field === "payout.minimum" && !/\bminimum|\bthreshold/.test(text)) return false
  return values.every((v) => {
    const n = String(v).match(/^\d+(?:\.\d+)?/)?.[0]?.replace(".", "\\.")
    return n && unit[field] ? unit[field](n).test(text) : text.includes(String(v).toLowerCase())
  })
}

/** Sentences that state one figure for a term the program records as stated two ways. */
export function conflictStatements(docs: [string, Doc][]): string[] {
  const out: string[] = []
  for (const [slug, d] of docs) {
    for (const c of d.conflicts ?? []) {
      const field = String(c.field)
      const figures = FIGURES[field]
      // An open field conflict: the prose agrees with the recorded value, and both wait on one decision.
      if (!figures || OPEN_FIELD_CONFLICTS.some((o) => o.startsWith(`${slug}: ${field} =`))) continue
      for (const [name, get] of PROSE)
        for (const s of sentences(get(d))) {
          const found = new Set(figures(s))
          if (found.size > 0 && !TWO_WAYS.test(s) && !namesValues(s, field, c.values)) out.push(`${slug} ${name} states ${field} ${[...found].join(" / ")}: ${s.trim()}`)
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

/**
 * (program, field) pairs whose prose gives each source's figure in its own sentence ("the affiliate page
 * offers 20% for up to 3 years", "the terms limit commission to the first 12 months") while the conflict
 * records no `values`. None is the #403 shape (an unattributed figure), but none meets the rule either.
 * Fix each by recording `conflicts[].values` from the quote (a verifier's job) or by saying "stated two
 * ways" in the sentence, then remove it here. Listed in the PR that added this test.
 */
const OPEN_TWO_WAY = [
  "ai-video-cut commission.rate",
  "contentstudio commission.duration",
  "contentstudio commission.rate",
  "duplicator commission.rate",
  "klenty commission.duration",
  "klenty payout.minimum",
  "nitropack payout.frequency",
  "personizely commission.duration",
  "personizely commission.rate",
  "servebolt commission.rate",
  "servebolt payout.minimum",
  "sharetribe cookie_days",
  "sked-social commission.rate",
  "superscale commission.duration",
  "thexyz commission.rate",
  "verpex cookie_days",
  "zeemo-ai commission.duration",
]

test("no prose field states one figure for a term recorded as stated two ways, apart from the open list", () => {
  const hits = conflictStatements(registry())
  const pair = (h: string) => h.split(" ")[0] + " " + h.split(" states ")[1].split(" ")[0]
  assert.deepEqual(hits.filter((h) => !OPEN_TWO_WAY.includes(pair(h))), [], "remove the figure, or name both recorded values in one sentence")
  assert.deepEqual(OPEN_TWO_WAY.filter((p) => !hits.some((h) => pair(h) === p)), [], "fixed: remove these from OPEN_TWO_WAY")
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
  // Webzon AI's form, both recorded values in one sentence, passes.
  const webzon: Doc = {
    agents: { prompt: "The cookie window is stated as 60 days on the brand's page and 90 days on Affitor, and the payout minimum as $50 on the brand's page and $20 on Affitor." },
    conflicts: [{ field: "payout.minimum", values: [20, 50] }, { field: "cookie_days", values: ["60 days", "90 days"] }],
  }
  assert.deepEqual(conflictStatements(doc(webzon)), [])
  assert.equal(conflictStatements(doc({ ...webzon, agents: { prompt: "Pays 20% with a 90-day cookie." } })).length, 1)
  // Saying "two ways" is the other allowed form.
  assert.deepEqual(conflictStatements(doc({ ...twoWays, commission: { conditions: "The minimum payout is stated two ways: $20 and $50." } })), [])

  // Codex r1 #410, each failed before the fix:
  // P2-1: "both", "while", "instead" do not excuse one figure.
  for (const s of [
    "At least $20 must be available before a withdrawal request for both individuals and businesses.",
    "At least $20 must be available before a withdrawal request, while fees vary.",
    "At least $20 must be available before a withdrawal request instead of $10 last year.",
  ])
    assert.equal(conflictStatements(doc({ ...webzon, agents: {}, commission: { conditions: s } })).length, 1, s)
  // P2-2: a second amount that is not the other recorded value does not excuse the first.
  assert.equal(conflictStatements(doc({ ...webzon, agents: {}, commission: { conditions: "Minimum payout is $20, with a $5 processing fee." } })).length, 1)
  // P2-3: one matching minimum does not hide a contradictory one.
  assert.equal(minimumMismatches(doc({ ...seerist, payout: { minimum: 20, currency: "USD" }, commission: { conditions: `${seerist.commission!.conditions} Minimum payout is $50.` } })).length, 1)
  // A sentence giving one floor per method is not a contradiction (Browse AI).
  assert.equal(minimumMismatches(doc({ payout: { minimum: 0, currency: "USD" }, commission: { conditions: "Paid monthly via Wise with no minimum, or via PayPal on request with a $200 minimum." } })).length, 0)
  // A wire floor above the minimum is that method's own (Icons8).
  assert.equal(minimumMismatches(doc({ payout: { minimum: 50, currency: "USD" }, commission: { conditions: "Wire transfers need a $1,000 minimum." } })).length, 0)

  // Codex r2 #410, each failed before the fix:
  // P2-1: a sentence with one figure is checked whatever methods it names.
  for (const s of ["Minimum payout is $50 via Wise, and PayPal is not supported.", "Minimum payout is $50 via Wise, and promotional credits cannot be withdrawn."])
    assert.equal(minimumMismatches(doc({ ...seerist, payout: { minimum: 20, currency: "USD" }, commission: { conditions: `${seerist.commission!.conditions} ${s}` } })).length, 1, s)
  // P2-2: a recorded value counts only in the field's unit, not as a fee or a day count.
  for (const s of ["Minimum payout is $20, with a $50 processing fee.", "Minimum payout is $20 after 50 days."])
    assert.equal(conflictStatements(doc({ ...webzon, agents: {}, commission: { conditions: s } })).length, 1, s)
})
