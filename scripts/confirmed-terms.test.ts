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
import { confirmedProse, confirmedProseList, statesTerms } from "../src/lib/confirmed-terms"
import { confirmedTerms, getProgram, isLive, programs, termsConfirmed, type Program } from "../src/lib/programs"
import { hasNoProgram } from "../src/lib/no-program"
import { programMd } from "./generate-md"
import { termsApiProblems, termsMdProblems } from "./unconfirmed-checks"
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
  return text.split("\n").flatMap((line) => line.split(/(?<=[.!?])\s+/)).filter((s) => s.trim())
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
    assert.equal(shown.description, confirmedProse(p, p.description), p.slug)
    assert.equal(shown.agentPrompt, confirmedProse(p, p.agentPrompt), p.slug)
    assert.deepEqual(shown.restrictions, confirmedProseList(p, p.restrictions), p.slug)
    const prose = [shown.description, shown.shortDescription, shown.agentPrompt, shown.commissionConditions ?? "", ...(shown.agentUseCases ?? []), ...(shown.restrictions ?? [])]
    for (const sentence of prose.flatMap(sentences)) assert.equal(statesTerms(sentence), false, `${p.slug}: ${sentence}`)
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

test("statesTerms catches the filed phrasings and leaves commission-only sentences alone", () => {
  for (const s of [
    "Payouts are monthly with a $50 minimum; commissions become payable at least 30 days after purchase.",
    "Affiliates earn 30% recurring commission, with up to 60-day last-click cookie attribution.",
    "Applications are reviewed by VideoGen.",
    "Attribution lasts 60 days.",
    "Minimum payout $20 via PayPal, Wise, bank transfer or USDT.",
    "Commissions are held 30 days; refunds and disputes reverse commissions.",
    "Free to join with instant approval.",
    "Affiliate program: 20% of revenue, 90-day attribution, monthly NET-15 payouts, USD 50 minimum, free to join.",
  ]) {
    assert.equal(statesTerms(s), true, s)
  }
  for (const s of [
    "Affiliate program: Get $300 Per Approved Application",
    "Affiliate program: 25% Commission on all approved orders",
    "Earn 10% of first year contract value on any new annual contracts (average payout of $1000)",
    "Flatpay makes it easy for businesses to accept payments with transparent pricing, no hidden fees, and fast daily payouts.",
    "No spam, incentivized traffic, misleading claims or cookie stuffing",
    "No branded keyword bidding without prior written approval",
    "Earn 30% recurring commission for 12 months.",
    "Cookie, payout and approval terms are left out until they are checked.",
  ]) {
    assert.equal(statesTerms(s), false, s)
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
      assert.equal(row.shortDescription, confirmedProse(p, p.shortDescription), `search_programs ${p.slug}`)
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
