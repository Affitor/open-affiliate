/**
 * An unverified program's cookie window, payout and approval are left out of
 * every API surface until its terms are checked (src/lib/confirmed-terms.ts):
 * REST /api/programs and /api/programs/{slug}, MCP get_program and
 * search_programs. Keys are left out rather than set to null, because the CLI
 * already on npm prints a null as "null days"; a left-out key prints as it
 * already does for a program that publishes no cookie window. Verified
 * programs keep every value.
 *
 * Reads src/lib/registry.json, so run it after build-registry (CI runs it
 * after `npm run build`). Run with
 * `npx tsx --test --test-force-exit scripts/confirmed-terms.test.ts`: see
 * no-program.test.ts for why --test-force-exit.
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { approvalText, cookieCell, cookieText, payoutText } from "../packages/cli/src/format"
import { confirmedTerms, isLive, programs, termsConfirmed, type Program } from "../src/lib/programs"
import { hasNoProgram } from "../src/lib/no-program"
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

const live = programs.filter((p) => isLive(p) && !hasNoProgram(p))
const hasAllTerms = (p: Program) => p.cookieDays != null && p.payout.minimum != null && Boolean(p.payout.frequency) && Boolean(p.approval)
// A program that stores every term, so leaving them out is observable.
const unverified = live.find((p) => !p.verified && hasAllTerms(p))
const verified = live.find((p) => p.verified && hasAllTerms(p))

function assertHidden(body: Record<string, unknown>, p: Program, surface: string): void {
  for (const key of HIDDEN) assert.equal(key in body, false, `${surface} ${p.slug}: ${key} must be left out`)
  assert.deepEqual(body.payout, {}, `${surface} ${p.slug}: payout must be empty`)
  assert.deepEqual(body.commission, JSON.parse(JSON.stringify(p.commission)), `${surface} ${p.slug}: commission must stay`)
  assert.equal(body.verified, false)
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
})

test("confirmedTerms leaves out exactly cookie, payout and approval, and only when unverified", () => {
  for (const p of programs) {
    const shown = confirmedTerms(p)
    if (termsConfirmed(p)) {
      assert.equal(shown, p, p.slug)
      continue
    }
    assert.equal(p.verified, false, p.slug)
    for (const key of HIDDEN) assert.equal(shown[key], undefined, `${p.slug}: ${key}`)
    assert.deepEqual(shown.payout, {}, p.slug)
    // Everything else is the stored program.
    const others = (x: Program) => {
      const o: Record<string, unknown> = { ...x }
      for (const key of [...HIDDEN, "payout"]) delete o[key]
      return o
    }
    assert.deepEqual(others(shown), others(p), p.slug)
  }
})

test("REST /api/programs/{slug} leaves out an unverified program's terms and keeps a verified one's", async () => {
  assertHidden(await restGetProgram(unverified!.slug), unverified!, "REST")
  assertShown(await restGetProgram(verified!.slug), verified!, "REST")
})

test("REST /api/programs leaves out cookieDays for every unverified row", async () => {
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
    else assert.equal("cookieDays" in row, false, `search_programs ${p.slug}: cookieDays must be left out`)
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
