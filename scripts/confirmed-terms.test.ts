/**
 * An unverified program's cookie window, payout and approval are left out of
 * every surface until its terms are checked (src/lib/confirmed-terms.ts),
 * along with the sentences of free text that state them: REST /api/programs
 * and /api/programs/{slug}, MCP get_program and search_programs, and the .md
 * twin. Keys are left out rather than set to null, because the CLI already on
 * npm prints a null as "null days"; a left-out key prints as it already does
 * for a program that publishes no cookie window. Verified programs keep every
 * value and every word.
 *
 * Reads src/lib/registry.json, so run it after build-registry (CI runs it
 * after `npm run build`). Run with
 * `npx tsx --test --test-force-exit scripts/confirmed-terms.test.ts`: see
 * no-program.test.ts for why --test-force-exit.
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import ts from "typescript"
import { formatPercentage } from "../src/lib/commission-mode"
import { approvalText, cookieCell, cookieText, payoutText } from "../packages/cli/src/format"
import registry from "../src/lib/registry.json"
import {
  confirmedPitch,
  confirmedPrompt,
  confirmedProse,
  confirmedProseList,
  pitchFallback,
  promptFallback,
  proseSentences,
  statesTerms,
} from "../src/lib/confirmed-terms"
import { commissionDisplay, confirmedTerms, getProgram, isLive, programs, termsConfirmed, type Program } from "../src/lib/programs"
import * as page from "../src/lib/program-page"
import { commissionDisplay as clientCommissionDisplay } from "../src/lib/client-programs"
import { hasNoProgram } from "../src/lib/no-program"
import { programMd } from "./generate-md"
import { chunkScan, termsApiProblems, termsMdProblems } from "./unconfirmed-checks"
import {
  mcpCall,
  mcpGetProgram,
  publishedCliInfo,
  publishedCliSearchCookie,
  restGetProgram,
  restListPrograms,
} from "./surface-test-helpers"

/** Left out of the response for an unverified program; `payout` stays as an empty object. */
const HIDDEN = ["cookieDays", "payoutMethods", "approval", "approvalTime"] as const
/** Free-text fields that lose the sentences stating a term. */
const PROSE = ["description", "shortDescription", "agentPrompt", "agentUseCases", "restrictions", "commissionConditions"] as const

const live = programs.filter((p) => isLive(p) && !hasNoProgram(p))
const hasAllTerms = (p: Program) => p.cookieDays != null && p.payout.minimum != null && Boolean(p.payout.frequency) && Boolean(p.approval)
// A program that stores every term, so leaving them out is observable.
const unverified = live.find((p) => !p.verified && hasAllTerms(p))
const verified = live.find((p) => p.verified && hasAllTerms(p))
/** VideoGen's own text, as filed, states its cookie, payout and approval in prose. */
const videogen = getProgram("videogen")!

function sentences(text: string): string[] {
  return proseSentences(text)
    .map((s) => s.sentence)
    .filter((s) => s.trim())
}

function assertHidden(body: Record<string, unknown>, p: Program, surface: string): void {
  for (const key of HIDDEN) assert.equal(key in body, false, `${surface} ${p.slug}: ${key} must be left out`)
  assert.deepEqual(body.payout, {}, `${surface} ${p.slug}: payout must be empty`)
  assert.deepEqual(body.commission, JSON.parse(JSON.stringify(confirmedTerms(p).commission)), `${surface} ${p.slug}: commission must stay`)
  assert.equal(body.verified, false)
  assert.deepEqual(termsApiProblems(p, body), [], `${surface} ${p.slug}`)
}

function assertShown(body: Record<string, unknown>, p: Program, surface: string): void {
  assert.equal(body.cookieDays, p.cookieDays, `${surface} ${p.slug}: cookieDays`)
  assert.deepEqual(body.payout, JSON.parse(JSON.stringify(p.payout)), `${surface} ${p.slug}: payout`)
  assert.equal(body.approval, p.approval, `${surface} ${p.slug}: approval`)
  assert.equal(body.approvalTime, p.approvalTime, `${surface} ${p.slug}: approvalTime`)
}

test("the registry has a verified and an unverified live program that store every term", () => {
  assert.ok(unverified, "no unverified program with cookie, payout and approval")
  assert.ok(verified, "no verified program with cookie, payout and approval")
  assert.ok(videogen, "programs/videogen.yaml is the prose regression case")
})

test("confirmedTerms leaves out cookie, payout, approval and the sentences stating them, only when unverified", () => {
  for (const p of programs) {
    const shown = confirmedTerms(p)
    if (termsConfirmed(p)) {
      assert.equal(shown, p, p.slug)
      continue
    }
    assert.equal(p.verified, false, p.slug)
    for (const key of HIDDEN) assert.equal(shown[key], undefined, `${p.slug}: ${key}`)
    assert.deepEqual(shown.payout, {}, p.slug)
    assert.equal(shown.description, confirmedPitch(p, p.description), p.slug)
    assert.equal(shown.shortDescription, confirmedPitch(p, p.shortDescription), p.slug)
    assert.equal(shown.agentPrompt, confirmedPrompt(p, p.agentPrompt), p.slug)
    assert.deepEqual(shown.restrictions, confirmedProseList(p, p.restrictions), p.slug)
    const pitch = [shown.description, shown.shortDescription]
    for (const sentence of pitch.flatMap(sentences)) assert.equal(statesTerms(sentence, "pitch"), false, `${p.slug}: ${sentence}`)
    const programSide = [shown.agentPrompt, shown.commissionConditions ?? "", ...(shown.agentUseCases ?? []), ...(shown.restrictions ?? [])]
    for (const sentence of programSide.flatMap(sentences)) assert.equal(statesTerms(sentence, "program"), false, `${p.slug}: ${sentence}`)
    // Never emptied: a pitch or prompt with text keeps text.
    for (const key of ["description", "shortDescription", "agentPrompt"] as const) {
      if (p[key].trim()) assert.ok(shown[key].trim(), `${p.slug}: ${key} emptied`)
    }
    // The check date: left out (the key, not null) unless the brand has no
    // program, where the page shows it as "Status checked"; the API renames it
    // statusCheckedAt (apiProgram, tested in freshness.test.ts).
    if (hasNoProgram(p)) assert.equal(shown.lastVerifiedAt, p.lastVerifiedAt, p.slug)
    else assert.equal("lastVerifiedAt" in shown, false, `${p.slug}: lastVerifiedAt`)
    // Everything else is the stored program.
    const others = (x: Program) => {
      const o: Record<string, unknown> = { ...x, commission: { ...x.commission, conditions: null } }
      for (const key of [...HIDDEN, ...PROSE, "payout", "lastVerifiedAt"]) delete o[key]
      return o
    }
    assert.deepEqual(others(shown), others(p), p.slug)
  }
})

test("prose that states a term is dropped for an unverified program and kept for a verified one (VideoGen)", () => {
  const off = confirmedTerms({ ...videogen, verified: false })
  for (const gone of ["60-day last-click cookie", "$50 minimum", "Applications are reviewed", "60-day referral window"]) {
    assert.equal(off.description.includes(gone) || off.agentPrompt.includes(gone), false, gone)
  }
  assert.ok(off.description.startsWith("VideoGen turns ideas, scripts and storyboards into videos"))
  assert.ok(off.description.includes("Payment methods and commission duration beyond recurring subscriptions are not specified"))
  assert.ok(off.agentPrompt.startsWith("Consider VideoGen when a user needs AI video creation"))
  const on = { ...videogen, verified: true }
  assert.equal(confirmedTerms(on), on)
})

test("statesTerms drops any sentence with a term word, and keeps commission-only sentences and guardrails", () => {
  for (const s of [
    "Payouts are monthly with a $50 minimum; commissions become payable at least 30 days after purchase.",
    "Affiliates earn 30% recurring commission, with up to 60-day last-click cookie attribution.",
    "Applications are reviewed by VideoGen.",
    "Applications reviewed within 48 hours.",
    "Attribution lasts 60 days.",
    "A 90-day attribution window.",
    "Minimum payout $20 via PayPal, Wise, bank transfer or USDT.",
    "Minimum withdrawal $25.",
    "Commissions are held 30 days; refunds and disputes reverse commissions.",
    "Free to join with instant approval.",
    "Payment terms are net-30.",
    "Referrals last for 30 days.",
    "Affiliate program: Get $300 Per Approved Application",
    "Earn 10% of first year contract value on any new annual contracts (average payout of $1000)",
    // A guardrail or a disclaimer never carries a figure or a term value.
    "Do not expect payouts below $50.",
    "Payouts are monthly; the minimum is not published.",
  ]) {
    assert.equal(statesTerms(s), true, s)
  }
  // One term word each, with nothing else to catch the sentence.
  for (const s of [
    "Tracking rests on the attribution.",
    "Two windows apply.",
    "Visitors have a while, days to decide.",
    "Payouts go out often.",
    "Earnings are paid as a Visa rewards card.",
    "The brand pays out quarterly.",
    "Earnings arrive as payments to the account.",
    "The minimum is fifty dollars.",
    "There is a threshold.",
    "Withdraw at any time.",
    "Earnings wait until the balance is large enough.",
    "Terms are net-30.",
    "Partners are approved by hand.",
    "Each request is reviewed within two days.",
    "Applications reviewed by the team.",
    "A long cookie applies.",
  ]) {
    assert.equal(statesTerms(s), true, s)
  }
  for (const s of [
    "Earn 30% recurring commission for 12 months.",
    "No spam, incentivized traffic, misleading claims or cookie stuffing",
    "Do not promise earnings, automatic approval or automatic payouts.",
    "Commercial terms are agreed in writing before promotion; no standard public commission percentage, cookie duration or payout schedule is asserted here.",
    "Payment methods and commission duration beyond recurring subscriptions are not specified in the public terms.",
  ]) {
    assert.equal(statesTerms(s), false, s)
  }
})

test("a pitch keeps the product's own words; a product word counts next to the program or a figure", () => {
  // Payments and attribution products: "payments", "pay", "Windows" and "attribution" describe the product, not a term.
  for (const slug of ["lemon-squeezy", "paddle", "mercury", "ollama", "hockeystack", "triple-whale"]) {
    const p = getProgram(slug)!
    assert.ok(p, `programs/${slug}.yaml is a pitch regression case`)
    const off = confirmedTerms({ ...p, verified: false })
    assert.equal(off.description, p.description, `${slug}: description`)
    assert.equal(off.shortDescription, p.shortDescription, `${slug}: short description`)
  }
  for (const s of [
    "Lemon Squeezy is a merchant-of-record payments platform handling global tax, subscriptions, and checkout for digital products.",
    "Mercury is a banking platform built for startups with AI-powered cash flow, bill pay, corporate cards, and treasury.",
    "Run open-source LLMs locally on Mac, Linux, and Windows.",
    "HockeyStack unifies marketing, sales, and product data into a single attribution platform for B2B SaaS.",
  ]) {
    assert.equal(statesTerms(s, "pitch"), false, s)
    assert.equal(statesTerms(s, "program"), true, s)
  }
  // In commission conditions, attribution is a term on its own.
  assert.equal(statesTerms("Attribution is first-touch.", "program"), true)
  assert.equal(statesTerms("Attribution is first-touch.", "pitch"), false)
  for (const s of [
    "Affiliates get paid monthly.",
    "A 90-day attribution window.",
    "Partner attribution is first-touch.",
    "Partners receive payments every month.",
    "Balances over $50 are sent on the 1st.",
    "Get paid within 30 days.",
    "A 60-day cookie applies.",
    "Applications are reviewed within two days.",
  ]) {
    assert.equal(statesTerms(s, "pitch"), true, s)
  }
})

test("a payout schedule in program-side text is dropped (Bitwire), not in a pitch", () => {
  const bitwire = getProgram("bitwire")!
  assert.ok(bitwire, "programs/bitwire.yaml is the schedule regression case")
  const off = confirmedTerms({ ...bitwire, verified: false })
  assert.equal(String(off.commissionConditions ?? "").includes("deposited monthly"), false)
  for (const s of [
    "Revenue share on every referral purchase for a year, deposited monthly.",
    "Payment terms: monthly",
    "Commissions land in your account on the 15th.",
    "Earnings are transferred quarterly.",
  ]) {
    assert.equal(statesTerms(s, "program"), true, s)
  }
  assert.equal(statesTerms("Monthly reports for every team.", "pitch"), false)
})

test("approval speed or process is dropped in every field; payout timing in program-side fields (DokuTrak, Mato)", () => {
  const dokutrak = getProgram("dokutrak")!
  assert.ok(dokutrak, "programs/dokutrak.yaml is the approval-speed regression case")
  assert.equal(confirmedTerms({ ...dokutrak, verified: false }).description.includes("open and immediate sign-up"), false)
  const mato = getProgram("mato")!
  assert.equal(confirmedTerms({ ...mato, verified: false }).description.includes("accepts applications"), false)
  for (const field of ["pitch", "program"] as const) {
    for (const s of [
      "In-house tracking, open and immediate sign-up at https://example.com/partners/sign-up.",
      "Partners are approved within 24 hours.",
      "Open signup, no application needed.",
      "Instant approval for every affiliate.",
      "Applications accepted within two days.",
      "Join automatically when you create an account.",
      "The partner program accepts applications from agencies.",
    ]) {
      assert.equal(statesTerms(s, field), true, `${field}: ${s}`)
    }
  }
  for (const s of ["Earnings arrive every Friday.", "Commissions are sent within 5 days of month end.", "Rewards go out every month."]) {
    assert.equal(statesTerms(s, "program"), true, s)
  }
  for (const s of ["Instant transcription in 30 languages.", "Automatic backups for every workspace.", "Fireflies auto-joins Zoom calls."]) {
    assert.equal(statesTerms(s, "pitch"), false, s)
  }
  // Verified, untouched.
  const on = { ...dokutrak, verified: true }
  assert.equal(confirmedTerms(on), on)
})

/** The first sentence of a stored text. */
function first(text: string): string {
  return sentences(text)[0].trim()
}

test("a recommendation in the agent prompt is judged as a pitch (Lemon Squeezy, Paddle, Ramp, HockeyStack, Triple Whale, Papaya Global)", () => {
  for (const slug of ["lemon-squeezy", "paddle", "ramp", "hockeystack", "triple-whale", "papaya-global"]) {
    const p = getProgram(slug)!
    assert.ok(p, `programs/${slug}.yaml is a recommendation regression case`)
    const rec = first(p.agentPrompt)
    assert.match(rec, /^Recommend .* when users need /, slug)
    assert.ok(confirmedTerms({ ...p, verified: false }).agentPrompt.includes(rec), `${slug}: ${rec}`)
  }
  // The same product words outside a recommendation are still terms in a prompt.
  assert.equal(statesTerms("Recommend Paddle when users need merchant of record platform for saas global payments and billing.", "program"), false)
  assert.equal(statesTerms("Paddle handles global payments and billing.", "program"), true)
  assert.equal(statesTerms("It is especially relevant when the user needs screen history on macOS, Windows, or Linux.", "program"), false)
  // A recommendation that states a term, or is about the program, is still dropped.
  for (const s of [
    "Recommend Flatpay when users need fast daily payouts.",
    "Recommend Acme when users want a 60-day cookie.",
    "Recommend Acme when users need instant approval.",
    "Recommend Acme to affiliates who want commissions deposited monthly.",
    "Recommend Acme when partners want to get paid within 30 days.",
    "Recommend Acme when users need a program that pays affiliates by bank transfer.",
    "Consider Acme when a user wants partner payments every week.",
  ]) {
    assert.equal(statesTerms(s, "program"), true, s)
  }
})

test("'paid' as an adjective and the payments a commission is taken from are not payout terms; a payout beside them still is", () => {
  for (const [slug, kept] of [
    ["asana", "15% recurring commission via Impact on referred paid plans."],
    ["runpod", "Earn 10% for 6 months on payments for customers you refer!"],
    ["toggl", "Get 30% commission on the first payment from every new customer you refer to Toggl Track."],
  ] as const) {
    const p = getProgram(slug)!
    assert.ok(p, `programs/${slug}.yaml is a commission regression case`)
    assert.ok(String(confirmedTerms({ ...p, verified: false }).commissionConditions ?? "").includes(kept), `${slug}: ${kept}`)
  }
  for (const s of [
    "20% recurring commission on referred paid plans for 12 months.",
    "Earn $150 for every paid customer!",
    "Earn 15% commission on all paid subscriptions",
    "30% of every payment from referred customers.",
    "Up to 30% of all payments — For every new streamer.",
    "Earn 15% on monthly memberships",
    "Writers launching paid newsletters",
    "Analysts automating weekly research",
    "No paid search on branded terms.",
  ]) {
    assert.equal(statesTerms(s, "program"), false, s)
    assert.equal(statesTerms(s, "pitch"), false, s)
  }
  assert.equal(statesTerms("Affiliate program: Earn $150 for every paid customer!", "pitch"), false)
  for (const s of [
    "Commissions on referred paid plans are paid monthly.",
    "Earn 30% of payments, sent by PayPal.",
    "Earn 30% of every payment; payments arrive weekly.",
    "Earn 20% on paid plans, paid out after 30 days.",
    "Earn 20% of paid plans, paid by bank transfer.",
    "Affiliates are paid after the refund period.",
    "Earn 20% on monthly plans, sent by PayPal.",
    "Commissions are sent in monthly installments.",
    "Earn 10% of payments within 45 days of the sale.",
  ]) {
    assert.equal(statesTerms(s, "program"), true, s)
  }
  for (const s of [
    "Affiliates get paid on referred paid plans every month.",
    "Partners earn 20% of payments, paid weekly.",
    "Affiliates earn 30% of payments, sent in 5 business days.",
    "Affiliates earn 30% on paid plans, sent by PayPal.",
  ]) {
    assert.equal(statesTerms(s, "pitch"), true, s)
  }
})

test("a restriction starting 'No' keeps the words of its prohibition, and any other term word still drops it (VideoGen)", () => {
  const off = confirmedTerms({ ...videogen, verified: false })
  assert.ok((off.restrictions ?? []).includes("No branded keyword bidding without prior written approval"))
  for (const s of [
    "No branded keyword bidding without prior written approval",
    "No coupon or deal sites without approval",
    "No brand bidding on 'Notion' keywords in paid search",
    "No self referrals, duplicate or fraudulent accounts, forced cookies or deceptive traffic.",
    "No spam, scraped or purchased lists, cookie stuffing, hidden redirects, attribution hijacking, or fake identities",
    "No company keywords in Pay-Per-Click (PPC) ads, including search engine advertising",
    "No self-referral (no commission on your own payments)",
  ]) {
    assert.equal(statesTerms(s, "program"), false, s)
  }
  const bitwire = getProgram("bitwire")!
  assert.equal(String(confirmedTerms({ ...bitwire, verified: false }).commissionConditions ?? "").includes("No minimum threshold"), false)
  for (const s of [
    "No minimum threshold.",
    "No approval needed.",
    "No application required.",
    "No payout minimum.",
    "No coupon sites without approval; approved partners are paid weekly.",
    "No coupon sites without approval within 30 days of joining.",
    "No cookie is set; attribution lasts 30 days.",
    "No approval process: links work as soon as you sign up.",
    // A prohibition that carries a figure keeps its approval word.
    "No promotion without approval for affiliates under $500 in sales.",
  ]) {
    assert.equal(statesTerms(s, "program"), true, s)
  }
})

test("in a pitch, approval counts only beside the program or joining it (Shade, Cognosys, Quadient)", () => {
  const shade = getProgram("shade")!
  const cognosys = getProgram("cognosys")!
  const quadient = getProgram("quadient")!
  for (const p of [shade, cognosys, quadient]) assert.ok(p, "an approval regression program is missing from the registry")
  assert.ok(confirmedTerms({ ...shade, verified: false }).description.includes("It consolidates file streaming, review and approval, automated metadata, AI search all in one platform."))
  assert.ok(confirmedTerms({ ...cognosys, verified: false }).agentUseCases?.includes("Analysts automating weekly research"))
  assert.ok(confirmedTerms({ ...quadient, verified: false }).agentPrompt.includes("accounts payable automation solutions help finance and accounting teams"))
  assert.equal(statesTerms("Review and approval workflows for video teams.", "pitch"), false)
  for (const s of [
    "Approved affiliates receive a referral link.",
    "Partners need approval before promoting.",
    "Apply and get approved.",
    "Every application is approved by hand.",
    "Approval takes two days.",
    "Join the program after approval.",
  ]) {
    assert.equal(statesTerms(s, "pitch"), true, s)
  }
  // In what a program says about itself, approval is a term on its own.
  assert.equal(statesTerms("Review and approval for every request.", "program"), true)
})

test("an unverified pitch shorter than four words falls back to the neutral line; a verified one is untouched (Bitwire)", () => {
  const bitwire = getProgram("bitwire")!
  assert.equal(bitwire.shortDescription, "Your Hustle", "programs/bitwire.yaml is the fragment regression case")
  assert.equal(confirmedTerms({ ...bitwire, verified: false }).shortDescription, pitchFallback(bitwire))
  const p = { name: "Acme", category: "AI", verified: false }
  assert.equal(confirmedPitch(p, "Your Hustle"), pitchFallback(p))
  assert.equal(confirmedPitch(p, "VektorOS"), pitchFallback(p))
  assert.equal(confirmedPitch(p, "Shipping software for e-commerce"), "Shipping software for e-commerce")
  // Left as a fragment by the filter.
  assert.equal(confirmedPitch(p, "Win clients. Affiliates get paid monthly."), pitchFallback(p))
  assert.equal(confirmedPitch({ ...p, verified: true }, "Your Hustle"), "Your Hustle")
  assert.equal(confirmedTerms({ ...bitwire, verified: true }).shortDescription, "Your Hustle")
})

test("an optional field the filter empties is left out on every surface, never printed empty", () => {
  const base = getProgram("asana")!
  const entry = (registry.programs as unknown as Parameters<typeof programMd>[0][]).find((e) => e.slug === "asana")!
  const conditions = "Payouts are monthly. A 60-day cookie applies."
  const restrictions = ["Approval is manual.", "Payouts are sent by PayPal."]
  const off = confirmedTerms({ ...base, verified: false, commission: { ...base.commission, conditions }, commissionConditions: conditions, restrictions })
  assert.equal(off.commissionConditions, null)
  assert.equal(off.commission.conditions, null)
  assert.deepEqual(off.restrictions, [])
  const md = programMd({ ...entry, verified: false, commission: { ...entry.commission, conditions }, restrictions })
  assert.equal(md.includes("Commission conditions:"), false)
  assert.equal(md.includes("## Restrictions"), false)
  assert.deepEqual(termsMdProblems({ ...base, verified: false }, md), [])
  assert.ok(termsApiProblems({ ...base, verified: false }, { ...JSON.parse(JSON.stringify(off)), commissionConditions: "" }).some((x) => x.includes("empty string")))
})

test("the chunk check finds a record's slug past braces inside strings", () => {
  const off = live.find((p) => !termsConfirmed(p))!
  const on = live.find((p) => termsConfirmed(p))!
  const shown = (slug: string) => programs.find((p) => p.slug === slug)?.verified
  assert.equal(chunkScan(`{"slug":"${off.slug}","description":"example {","cookieDays":60}`, shown).problems.length, 1)
  assert.equal(chunkScan(`{"slug":"${on.slug}","description":"} example","cookieDays":60}`, shown).problems.length, 0)
  assert.equal(chunkScan(`{"cookieDays":60,"note":"a } b","slug":"${off.slug}"}`, shown).problems.length, 1)
})

test("a pitch or prompt the filter would empty falls back to a neutral line from structured fields", () => {
  const p = { ...getProgram("asana")!, verified: false }
  const off = confirmedTerms({
    ...p,
    description: "Affiliates get paid monthly. A 60-day cookie applies.",
    shortDescription: "Payouts every month",
    agentPrompt: "Payouts are monthly by bank transfer.",
  })
  assert.equal(off.description, pitchFallback(p))
  assert.equal(off.description, `${p.name} is a product in the ${p.category} category.`)
  assert.equal(off.shortDescription, pitchFallback(p))
  assert.equal(off.agentPrompt, promptFallback(p))
  for (const line of [pitchFallback(p), promptFallback(p)]) {
    assert.equal(statesTerms(line, "program"), false, line)
    assert.equal(/\d/.test(line), false, line)
  }
  // Verified, nothing is replaced.
  const on = { ...p, verified: true, description: "Affiliates get paid monthly." }
  assert.equal(confirmedTerms(on).description, "Affiliates get paid monthly.")
})

test("filed prose that states terms is dropped whole when unverified, guardrails stay, verified text is untouched", () => {
  const swokei = getProgram("swokei")!
  const gem = getProgram("gem")!
  const mato = getProgram("mato")!
  const powerCm = getProgram("power-cm-partners")!
  for (const p of [swokei, gem, mato, powerCm]) assert.ok(p, "a regression program is missing from the registry")

  // Swokei: a payout sentence wrapped over three lines goes whole, and the attribution windows in its conditions.
  const sw = confirmedTerms({ ...swokei, verified: false })
  for (const gone of ["Payouts are monthly", "once the balance is over $50", "waited a year is sent", "30 days to sign up", "fresh 30 days"]) {
    assert.equal(sw.description.includes(gone) || String(sw.commissionConditions ?? "").includes(gone), false, gone)
  }
  assert.ok(sw.description.startsWith("Swokei is an outreach tool for web agencies and freelancers."))
  // Gem: "paid as a Visa rewards card" in its agent prompt.
  assert.equal(confirmedTerms({ ...gem, verified: false }).agentPrompt.includes("paid as a Visa rewards card"), false)
  // Mato and Power CM: the disclaimer and the guardrail are kept.
  assert.ok(confirmedTerms({ ...mato, verified: false }).description.includes("no standard public commission percentage, cookie duration or payout schedule is asserted here."))
  assert.ok(confirmedTerms({ ...powerCm, verified: false }).agentPrompt.includes("Do not promise earnings, automatic approval or automatic payouts."))
  // Verified, the same text is untouched.
  for (const p of [swokei, gem, mato, powerCm, videogen]) {
    const on = { ...p, verified: true }
    assert.equal(confirmedTerms(on), on, p.slug)
    assert.equal(confirmedProse(on, p.description), p.description, p.slug)
  }
})

test("every .md twin follows the rule: no hidden term in figures or prose when unverified, exact terms when verified", () => {
  const entries = registry.programs as unknown as Parameters<typeof programMd>[0][]
  let unverifiedTwins = 0
  for (const entry of entries) {
    const p = getProgram(entry.slug)!
    if (hasNoProgram(p)) continue
    if (!termsConfirmed(p)) unverifiedTwins++
    assert.deepEqual(termsMdProblems(p, programMd(entry)), [], entry.slug)
  }
  assert.ok(unverifiedTwins > 100, `${unverifiedTwins} unverified twins checked`)
  const vg = entries.find((e) => e.slug === "videogen")!
  const md = programMd({ ...vg, verified: false })
  for (const gone of ["60-day", "$50 minimum", "Applications are reviewed", "Cookie window:", "Payout:", "Approval:"]) {
    assert.equal(md.includes(gone), false, gone)
  }
  assert.ok(programMd({ ...vg, verified: true }).includes("Payouts are monthly with a $50 minimum"))
})

test("REST /api/programs/{slug} leaves out an unverified program's terms and keeps a verified one's", async () => {
  assertHidden(await restGetProgram(unverified!.slug), unverified!, "REST")
  assertShown(await restGetProgram(verified!.slug), verified!, "REST")
  if (!videogen.verified) {
    const body = await restGetProgram("videogen")
    assertHidden(body, videogen, "REST")
    assert.equal(String(body.description).includes("$50 minimum"), false)
  }
})

test("an alias of an unverified program answers with its terms hidden too, on REST and MCP", async () => {
  const aliases = Object.entries((registry as { aliases?: Record<string, string> }).aliases ?? {})
  const hit = aliases.find(([, slug]) => {
    const p = getProgram(slug)
    return p && isLive(p) && !termsConfirmed(p) && p.cookieDays != null
  })
  assert.ok(hit, "no alias points at an unverified program with a cookie window")
  const [alias, slug] = hit
  const p = getProgram(slug)!
  const viaAlias = await restGetProgram(alias)
  assert.equal(viaAlias.slug, slug)
  assertHidden(viaAlias, p, `REST alias ${alias}`)
  assert.deepEqual(viaAlias, await restGetProgram(slug))
  const viaMcp = await mcpGetProgram(alias)
  assertHidden(viaMcp, p, `MCP alias ${alias}`)
})

test("REST /api/programs leaves out the hidden terms for every unverified row", async () => {
  const rows = await restListPrograms("")
  assert.ok(rows.length > 100)
  for (const row of rows) {
    const p = programs.find((x) => x.slug === row.slug)!
    if (p.verified) assertShown(row, p, "REST list")
    else assertHidden(row, p, "REST list")
  }
})

test("MCP get_program and search_programs match the REST API", async () => {
  assertHidden(await mcpGetProgram(unverified!.slug), unverified!, "MCP get_program")
  assertShown(await mcpGetProgram(verified!.slug), verified!, "MCP get_program")
  const summaries: Record<string, unknown>[] = await mcpCall("search_programs", {})
  assert.ok(summaries.length > 100)
  for (const row of summaries) {
    const p = programs.find((x) => x.slug === row.slug)!
    if (p.verified) assert.equal(row.cookieDays, p.cookieDays, `search_programs ${p.slug}`)
    else {
      assert.equal("cookieDays" in row, false, `search_programs ${p.slug}: cookieDays must be left out`)
      assert.equal(row.shortDescription, confirmedPitch(p, p.shortDescription), `search_programs ${p.slug}`)
    }
  }
})

test("the CLI already on npm reads an unverified response without crashing or printing a hidden term", async () => {
  const body = await restGetProgram(unverified!.slug)
  const out = publishedCliInfo(body)
  const line = (label: string) => out.split("\n").find((l) => l.trim().startsWith(label)) ?? ""
  // What it already prints for a program that publishes no cookie window.
  assert.equal(line("Cookie:").trim(), "Cookie:      undefined days")
  assert.equal(line("Payout:").trim(), "Payout:      $undefined min / undefined")
  assert.equal(out.includes("Approval:"), false)
  assert.equal(out.includes("Methods:"), false)
  assert.equal(out.includes("null"), false)
  assert.equal(/\d/.test(publishedCliSearchCookie(body)), false)

  const shown = publishedCliInfo(await restGetProgram(verified!.slug))
  assert.ok(shown.includes(`Cookie:      ${verified!.cookieDays} days`))
})

test("the CLI source prints 'not confirmed' for a left-out term and the value when present", async () => {
  // Key missing: the shape an unverified program now has.
  const hidden = await restGetProgram(unverified!.slug)
  assert.equal(cookieText(hidden), "not confirmed")
  assert.equal(cookieCell(hidden), "—")
  assert.equal(payoutText(hidden), "not confirmed")
  assert.equal(approvalText(hidden), "not confirmed")
  // Key missing on a verified program: it does not publish the term.
  assert.equal(cookieText({ verified: true }), "not published")
  assert.equal(payoutText({ verified: true, payout: {} }), "not published")
  assert.equal(approvalText({ verified: true }), "not published")

  // Value present.
  const v = verified!
  const shown = await restGetProgram(v.slug)
  assert.equal(cookieText(shown), `${v.cookieDays} days`)
  assert.equal(cookieCell(shown), `${v.cookieDays}d`)
  assert.equal(payoutText(shown), `$${v.payout.minimum} min / ${v.payout.frequency}`)
  assert.equal(approvalText(shown), `${v.approval}${v.approvalTime ? ` (${v.approvalTime})` : ""}`)
  assert.equal(cookieText({ verified: false, cookieDays: 0 }), "0 days")
})

// The human-first program page (src/lib/program-page.ts) words stored fields
// and must never state an unconfirmed or empty term as a figure.
const verifiedBase = programs.find((p) => termsConfirmed(p) && isLive(p) && !hasNoProgram(p))!
const withCommission = (commission: Partial<Program["commission"]>, extra: Partial<Program> = {}): Program =>
  ({ ...verifiedBase, ...extra, commission: { ...verifiedBase.commission, duration: null, ...commission } }) as Program

test("program page: commission figure from structured fields, free text kept, empty rates left out", () => {
  assert.deepEqual(page.commissionFigure(withCommission({ type: "recurring", mode: "percentage", value: 22, rate: "22%", duration: "12 months" })), { big: "22%", rest: "recurring for 12 months", kind: "number" })
  assert.equal(page.commissionFigure(withCommission({ type: "recurring", mode: "percentage", value: 30, rate: "30%", duration: "lifetime" }))?.rest, "recurring for life")
  assert.equal(page.commissionFigure(withCommission({ type: "one-time", mode: "flat", value: 100, rate: "$100", currency: "USD" }))?.rest, "per sale")
  assert.deepEqual(page.commissionFigure(withCommission({ mode: "unknown", value: null, rate: "varies" })), { big: "Rate varies", rest: "", kind: "varies" })
  assert.deepEqual(page.commissionFigure(withCommission({ mode: "unknown", value: null, rate: "€150 per new company" })), { big: "€150 per new company", rest: "", kind: "text" })
  for (const rate of ["6", "200", "none", "Not published", ""]) {
    assert.equal(page.commissionFigure(withCommission({ mode: "unknown", value: null, rate })), null, `rate ${JSON.stringify(rate)}`)
  }
})

test("program page: an unverified answer never states its commission as checked", () => {
  const unverified = programs.filter((p) => isLive(p) && !hasNoProgram(p) && !termsConfirmed(p))
  assert.ok(unverified.length > 100, "too few unverified programs for the check to mean anything")
  for (const stored of unverified) {
    const p = confirmedTerms(stored)
    const a = page.answerParts(p, "")
    const text = a.before + a.strong + a.after
    if (page.pageState(p) === "paused") assert.match(text, /may have closed/, p.slug)
    else assert.match(text, /not yet checked|not published and the listing is not verified/, p.slug)
    assert.equal(page.estimateInput(p), null, `${p.slug} offers an estimate on unconfirmed terms`)
    assert.equal(page.cookieText(p), null, p.slug)
  }
})

test("program page: product text leaves out the deal, keeps product figures, never empty", () => {
  const p = withCommission({}, {
    description: "Ada automates 70% of customer interactions. Earn 20% recurring on every referral. Its affiliate program pays monthly.",
    shortDescription: "AI customer service",
  })
  assert.equal(page.productText(p), "Ada automates 70% of customer interactions.")
  assert.equal(page.productText({ ...p, description: "Affiliates earn 30% for life." }), "AI customer service")
  for (const stored of programs.filter(isLive)) assert.ok(page.productText(confirmedTerms(stored)).trim(), `${stored.slug} has no product text`)
  assert.deepEqual(page.programUseCases({ ...p, agentUseCases: ["Teams looking for high-commission AI affiliate programs (45%)", "Sales teams automating outreach"] }), ["Sales teams automating outreach"])
})

test("program page: earnings estimate only where the duration reads as a span", () => {
  assert.equal(page.durationMonths("12 months"), 12)
  assert.equal(page.durationMonths("3 years"), 36)
  assert.equal(page.durationMonths("lifetime"), 12)
  assert.equal(page.durationMonths("first paid transaction only"), null)
  const rec = (duration: string) => page.estimateInput(withCommission({ type: "recurring", mode: "percentage", value: 20, rate: "20%", duration }))
  assert.equal(rec("24 months")?.months, 24)
  assert.equal(rec("first paid transaction only"), null)
  assert.equal(page.estimateInput(withCommission({ type: "one-time", mode: "percentage", value: 10, rate: "10%" }))?.recurring, false)
  assert.equal(page.estimateInput(withCommission({ type: "one-time", mode: "flat", value: 20, rate: "$20 in credits" })), null)
  assert.deepEqual(page.payoutMethods({ ...verifiedBase, payoutMethods: ["paypal", "bank"] }), ["PayPal", "Bank transfer"])
})

test("program page: stored earning event kept, estimate only on a plain USD figure, approval time alone shown", () => {
  assert.deepEqual(page.commissionFigure(withCommission({ type: "one-time", mode: "flat", value: 75, rate: "$75 per qualified lead", currency: "USD" })), { big: "$75 per qualified lead", rest: "", kind: "text" })
  assert.equal(page.estimateInput(withCommission({ type: "one-time", mode: "flat", value: 500, rate: "$20–$500", currency: "USD" })), null, "a range is not a fixed amount")
  assert.equal(page.estimateInput(withCommission({ type: "one-time", mode: "flat", value: 10, rate: "£10", currency: "GBP" })), null, "not US dollars")
  assert.equal(page.estimateInput(withCommission({ type: "one-time", mode: "flat", value: 100, rate: "$100 Amazon gift card", currency: "USD" })), null, "a gift card is not cash")
  assert.ok(page.estimateInput(withCommission({ type: "one-time", mode: "flat", value: 1000, rate: "$1,000", currency: "USD" })), "a plain amount with a thousands separator")
  assert.equal(page.approvalText({ ...verifiedBase, approval: undefined, approvalTime: "1-2 business days" }), "1-2 business days")
  assert.equal(page.approvalText({ ...verifiedBase, approval: "manual", approvalTime: "48 hours" }), "Reviewed by hand (48 hours)")
})

test("program page: a qualified rate is shown as stored, never as a bare figure or an estimate (registry)", () => {
  const live = (slug: string) => confirmedTerms(getProgram(slug)!)
  for (const slug of ["dreamhost", "aircall-inc", "sevdesk", "elementor"]) {
    const p = live(slug)
    assert.equal(page.estimateInput(p), null, `${slug} gets an estimate`)
    const f = page.commissionFigure(p)!
    assert.equal(f.big, String(p.commission.rate).trim(), `${slug} shows "${f.big}", stored "${p.commission.rate}"`)
  }
  const a = page.answerParts(live("dreamhost"), "")
  assert.equal(a.before + a.strong + a.after, "DreamHost's commission: $15 to $1,000.")
  // A rate that already says for how long does not get the duration again.
  assert.equal(page.commissionFigure(withCommission({ type: "recurring", mode: "hybrid", value: null, rate: "$50 + 20% for the first year", duration: "12 months" }))?.rest, "")
  // Credits keep "per referral"; a bare stored number keeps the parsed figure.
  assert.equal(page.commissionFigure(withCommission({ type: "one-time", mode: "flat", value: 10, rate: "$10 in Airtable credits" }))?.rest, "per referral")
  assert.deepEqual(page.commissionFigure(withCommission({ type: "recurring", mode: "percentage", value: 25, rate: "25", duration: "12 months" })), { big: "25%", rest: "recurring for 12 months", kind: "number" })
})

test("program page follow-up: caps in the conditions, duration phrases, cookie products (registry)", () => {
  const live = (slug: string) => confirmedTerms(getProgram(slug)!)
  for (const slug of ["hosting-com", "oxylabs"]) assert.equal(page.estimateInput(live(slug)), null, `${slug}: the estimate would ignore its cap`)
  assert.ok(page.estimateInput(live("cookieyes")), "\"No cap on monthly earnings\" is not a cap")
  assert.equal(page.commissionFigure(live("repostit"))?.rest, "recurring for as long as the referred customer stays active")
  assert.equal(page.commissionFigure(live("notify-me"))?.rest, "", "a tiered rate that says for how long gets nothing after it")
  assert.match(page.productText(live("cookieyes")), /scans sites for cookies/)
  assert.doesNotMatch(page.productText(withCommission({}, { description: "A form builder. The cookie lasts 45 days. Apply at partners.example.com." })), /cookie lasts|Apply at/)
})

test("program page follow-up r2: caps written after the amount or in the description; term sentences stay out", () => {
  const live = (slug: string) => confirmedTerms(getProgram(slug)!)
  for (const slug of ["pcloud", "similarweb"]) assert.equal(page.estimateInput(live(slug)), null, `${slug}: the estimate would ignore its cap`)
  assert.doesNotMatch(page.productText(live("vsub")), /no application/i)
  assert.doesNotMatch(page.productText(live("wix")), /\$300 monthly threshold/)
  assert.match(page.productText(live("cookieyes")), /scans sites for cookies/)
})


test("qualified percentage ceilings survive server, client and agent Markdown without becoming fixed earnings", () => {
  const entry = registry.programs.find((p) => p.slug === "planday")! as Parameters<typeof programMd>[0]
  for (const rate of ["up to 15%", "maximum 15%", "10–15%", "15% per qualified sale", "up to 15 percent", "maximum 15"]) {
    const commission = { ...verifiedBase.commission, type: "recurring" as const, mode: "percentage" as const, rate, value: 15, duration: "12 months" }
    assert.equal(commissionDisplay(commission), rate)
    assert.equal(clientCommissionDisplay(commission), rate)
    const md = programMd({ ...entry, verified: false, commission })
    assert.ok(md.includes(`Commission: ${rate} recurring`), rate)
    assert.equal(page.estimateInput({ ...verifiedBase, commission }), null, `${rate} must not enable the fixed-rate estimator`)
    assert.equal(page.commissionFigure({ ...verifiedBase, commission })?.big, rate)
    assert.equal(page.commissionFigure({ ...verifiedBase, commission })?.kind, "text")
  }
  const plain = { ...verifiedBase.commission, mode: "percentage" as const, rate: "30%", value: 30 }
  assert.equal(commissionDisplay(plain), "30%")
  assert.equal(clientCommissionDisplay(plain), "30%")
  for (const value of [1e-7, 1e21]) {
    for (const rate of [value, String(value)]) {
      const numeric = { ...plain, rate, value }
      assert.equal(commissionDisplay(numeric), `${value}%`)
      assert.equal(clientCommissionDisplay(numeric), `${value}%`)
      assert.ok(programMd({ ...entry, commission: numeric }).includes(`Commission: ${value}%`))
    }
  }
  assert.equal(page.estimateInput(withCommission({ type: "recurring", mode: "percentage", value: 30, rate: "30%", currency: "USD", duration: "12 months" }))?.value, 30)
  for (const rate of ["30%", "up to 30%", "maximum 30%", "10–30%"]) {
    const missing = { ...plain, rate, value: null }
    assert.equal(commissionDisplay(missing), "Not published")
    assert.equal(clientCommissionDisplay(missing), "Not published")
    assert.ok(programMd({ ...entry, commission: missing }).includes("Commission: Not published"))
  }
})


test("global search uses the same percentage rule while flat, tiered and unknown displays stay unchanged", () => {
  const source = ts.createSourceFile("search-bar.tsx", readFileSync(new URL("../src/components/search-bar.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const declaration = source.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "commissionDisplay")!
  assert.ok(declaration)
  const printed = ts.createPrinter().printNode(ts.EmitHint.Unspecified, declaration, source)
  const js = ts.transpileModule(printed, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  const searchDisplay = runInNewContext(`${js}; commissionDisplay`, { formatPercentage }) as typeof clientCommissionDisplay
  for (const rate of ["up to 15%", "maximum 15%", "10–15%", "45% to 55%", "15% per qualified sale", "up to 15 percent", "maximum 15", "30%", "30"]) {
    const commission = { ...verifiedBase.commission, mode: "percentage" as const, rate, value: rate === "30%" || rate === "30" ? 30 : 15 }
    assert.equal(searchDisplay(commission), commissionDisplay(commission), rate)
    assert.equal(searchDisplay({ ...commission, value: null }), "Not published")
  }

  for (const value of [1e-7, 1e21]) {
    for (const rate of [value, String(value)]) {
      assert.equal(searchDisplay({ ...verifiedBase.commission, mode: "percentage", rate, value }), `${value}%`)
    }
  }
  assert.equal(searchDisplay({ ...verifiedBase.commission, mode: "flat", rate: "$20", value: 20 }), "$20")
  assert.equal(searchDisplay({ ...verifiedBase.commission, mode: "tiered", rate: "10–20%", value: 20 }), "10–20%")
  assert.equal(searchDisplay({ ...verifiedBase.commission, mode: "unknown", rate: "varies", value: null }), "Not published")
})
