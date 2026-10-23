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
    const minimums = (t: string) => statedMinimums(t, dollar).filter((f) => f.currency === currency || f.currency === "*")
    // A floor above the minimum in a clause about wire or bank transfer alone is that method's own (Icons8,
    // pCloud, Rocket.net's "PayPal is the default; wire transfer … $1,000"); a clause naming any other
    // method is checked (Codex r3 #410).
    const wireOnly = (c: string) => {
      const m = c.toLowerCase().match(METHOD) ?? []
      return m.length > 0 && m.every((x) => BY_WIRE.test(x)) && minimums(c).every((f) => f.amount > min)
    }
    for (const sentence of [d.commission?.conditions, d.payout?.conditions].flatMap(sentences)) {
      const s = sentence.split(/;\s*/).filter((c) => !wireOnly(c)).join("; ")
      const stated = minimums(s)
      const amounts = new Set(stated.map((f) => f.amount))
      const methods = new Set(s.toLowerCase().match(METHOD) ?? [])
      // Two methods with two different floors give one each ("Wise with no minimum, or PayPal with a $200
      // minimum"): payout.minimum must be one of them (Codex r3 #410). One figure is always checked (r2).
      if (amounts.size > 1 && methods.size > 1) {
        if (!amounts.has(min)) off.push(...stated)
        continue
      }
      // One matching statement does not excuse another that contradicts it (Codex r1 #410).
      off.push(...stated.filter((f) => f.amount !== min))
    }
    if (off.length) out.push(`${slug}: payout.minimum ${min} ${currency}, conditions also state ${[...new Set(off.map((f) => f.amount))].join(" / ")}`)
  }
  return out
}

// ---------- commission rate step-down ----------

// Broad on purpose (Codex r5 #410): phrasing-by-phrasing patterns kept missing step-downs, so every
// single-percentage rate whose conditions name another percentage next to a step word is a hit, and a
// person reviews each one into the lists below.
const STEP_WORD = /\b(?:first|then|after|renew\w*|subsequent|thereafter|year 2|second year)\b/i

/** Programs with a single-percentage rate whose conditions name 2+ distinct percentages and a step word. */
export function multiRateHits(docs: [string, Doc][]): string[] {
  const out: string[] = []
  for (const [slug, d] of docs) {
    if (!/^\d+(?:\.\d+)?%$/.test(String(d.commission?.rate ?? "").trim())) continue
    const text = String(d.commission?.conditions ?? "")
    const percents = new Set([...text.matchAll(/(\d+(?:\.\d+)?)\s?%/g)].map((m) => parseFloat(m[1])))
    if (percents.size > 1 && STEP_WORD.test(text)) out.push(slug)
  }
  return out
}

/**
 * Hits that are real bugs but need a maintainer reading the brand's page. Remove one when fixed.
 */
const OPEN_RATE: Record<string, string> = {
  instapage: "unverified PartnerStack import: 40% then 15% on annual plans and 30% on monthly ones, under type one-time with a 12-month duration",
  "auware-by-buyist": "unverified: 35% through 6/30 and 30% thereafter, a dated promotion; which rate is current needs the page",
  evolve: "unverified: 20% year 1, 15% year 2, 10% year 3 under rate 20% and type one-time",
  lindy: "unverified: 30% in year 1 and 15% recurring in year 2 under rate 30% and type one-time",
  salesrabbit: "15% in year 1 and 7.5% in year 2 (PartnerStack listing) under rate 15%; no receipt in the file to write the step from",
  "workwise-compliance": "unverified: 25% of the initial order and 10% of renewals under rate 25% and type one-time",
  zep: "unverified: up to 20% recurring or 35% of the first 12 months, two models under one rate",
}

/** Hits reviewed as correct: the single rate is the program's rate, and the other percentages are not a step-down of it. */
const REVIEWED_MULTI_RATE: Record<string, string> = {
  "123formbuilder": "50% is a power-affiliate tier after 10 referrals in a month",
  airia: "the extra 20% was a PartnerStack bonus that ended March 2026",
  brand24: "25% and 30% are volume tiers",
  castos: "10% is on production and launch services, a different product",
  clico: "20% is the customer's discount",
  convertkit: "after 12 months only Bronze/Silver/Gold status pays; the 12-month duration already bounds the 50%",
  "creatify-ai": "the extra 5% is a monthly-sales bonus",
  cyberforward: "25% is a bonus rate for a quarter after five customers",
  dext: "70% is the annual-plan rate, a plan split, not a step",
  "eleven-labs-inc": "11% is the Business-plan rate, a plan split (also in OPEN_FIELD_CONFLICTS)",
  fastmail: "10% is the customer's discount",
  "hix-ai": "10% is the second-tier share on sub-affiliates",
  "hosting-com": "20% is for other products (reseller, Windows, domains)",
  "julius-ai": "5% is second-tier, 50% off is the customer's discount, 30% is a separate Creator Program",
  kittl: "growing to 50% is a volume tier",
  later: "25% and 30% are volume tiers",
  "learnworlds-top-user-rated-online-course-platform-lms": "30% vs 25% split by referral date and source, not a step",
  logoai: "20% is the customer's discount",
  manychat: "40% and 50% are volume tiers",
  "merlin-ai": "10% is for special-price plans, a plan split",
  monica: "70% is the share of in-app purchases commission is calculated on",
  mylens: "10% is the customer's discount",
  "oakhampton-operations-twin": "25% is a bonus rate for a quarter after five clients",
  openart: "30% is an invitation-only raise",
  pandadoc: "25%-45% is a range, not a step",
  "pineapple-builder": "10% is the customer's discount",
  plansom: "30% is an invitation-only Elite rate",
  "press-mage": "25% and 30% are invitation-only levels",
  reelscut: "15% is the customer's discount",
  scalenut: "30%-50% headline and 40% Premium tier, not a step",
  seedprod: "20% is for RafflePress, a different product",
  sendible: "30% is the Top Affiliates tier after 100 customers",
  simpletexting: "'up to 10-15%' is a range on the same page",
  simvoly: "50% is a dated promotion",
  "snov-io": "20% is on LinkedIn Automation slots, an add-on",
  "spiky-ai": "20% is the reseller rate",
  subclip: "10% is the customer's welcome offer",
  thrivecart: "30%-55% are volume tiers",
  tidio: "25% is the agency program",
  "zeemo-ai": "10% is the customer's discount",
  zenrows: "40% is a featured-partner tier, 15% is sales-assisted deals",
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

test("a single-percentage commission.rate next to other percentages in its conditions is a reviewed case", () => {
  const hits = multiRateHits(registry())
  const listed = [...Object.keys(OPEN_RATE), ...Object.keys(REVIEWED_MULTI_RATE)]
  assert.deepEqual(hits.filter((s) => !listed.includes(s)), [], 'a step-down: write both steps into the rate ("50% then 20%"); otherwise add the slug to REVIEWED_MULTI_RATE with the reason')
  assert.deepEqual(listed.filter((s) => !hits.includes(s)), [], "no longer a hit: remove these from OPEN_RATE / REVIEWED_MULTI_RATE")
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
  assert.equal(multiRateHits(doc(storychief)).length, 1)
  assert.equal(multiRateHits(doc({ commission: { ...storychief.commission, rate: "50% then 20%" } })).length, 0)
  // Codex r4 #410: keeping only the later rate fails too.
  assert.equal(multiRateHits(doc({ commission: { ...storychief.commission, rate: "20%" } })).length, 1)
  const perfmatters = "20% on the first sale of any plan, then 10% recurring on the customer's renewals for their lifetime."
  assert.equal(multiRateHits(doc({ commission: { rate: "10%", conditions: perfmatters } })).length, 1)
  assert.equal(multiRateHits(doc({ commission: { rate: "20% then 10%", conditions: perfmatters } })).length, 0)
  // Codex r5 #410: a semicolon and "after the first invoice" no longer hide the step.
  const r5 = "50% of the referred client's first invoice; 20% of every invoice after the first invoice for as long as the client stays a customer."
  assert.equal(multiRateHits(doc({ commission: { rate: "20%", conditions: r5 } })).length, 1)
  assert.equal(multiRateHits(doc({ commission: { rate: "50% then 20%", conditions: r5 } })).length, 0)
  // One percentage, or no step word, is not a hit (AppQR: a length after the first sale).
  assert.equal(multiRateHits(doc({ commission: { rate: "30%", conditions: "30% recurring commission on eligible payments for 12 months after the first attributed sale." } })).length, 0)
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
  // Codex r3 #410, each failed before the fix:
  // P2-1: per-method floors still have to include payout.minimum (Browse AI shape with minimum 50).
  assert.equal(minimumMismatches(doc({ payout: { minimum: 50, currency: "USD" }, commission: { conditions: "Paid monthly via Wise with no minimum, or via PayPal on request with a $200 minimum." } })).length, 1)
  // P2-2: a floor shared with another method is not a wire-only floor.
  assert.equal(minimumMismatches(doc({ ...seerist, payout: { minimum: 20, currency: "USD" }, commission: { conditions: `${seerist.commission!.conditions} Minimum payout is $50 via Wise or bank transfer.` } })).length, 1)

  // Codex r2 #410, each failed before the fix:
  // P2-1: a sentence with one figure is checked whatever methods it names.
  for (const s of ["Minimum payout is $50 via Wise, and PayPal is not supported.", "Minimum payout is $50 via Wise, and promotional credits cannot be withdrawn."])
    assert.equal(minimumMismatches(doc({ ...seerist, payout: { minimum: 20, currency: "USD" }, commission: { conditions: `${seerist.commission!.conditions} ${s}` } })).length, 1, s)
  // P2-2: a recorded value counts only in the field's unit, not as a fee or a day count.
  for (const s of ["Minimum payout is $20, with a $50 processing fee.", "Minimum payout is $20 after 50 days."])
    assert.equal(conflictStatements(doc({ ...webzon, agents: {}, commission: { conditions: s } })).length, 1, s)
})
