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
import { confirmedTerms, getProgram, isLive, programs, termsConfirmed, type Program } from "../src/lib/programs"
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
    // Everything else is the stored program.
    const others = (x: Program) => {
      const o: Record<string, unknown> = { ...x, commission: { ...x.commission, conditions: null } }
      for (const key of [...HIDDEN, ...PROSE, "payout"]) delete o[key]
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
