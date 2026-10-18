/**
 * OAS (src/lib/oas.ts): the check catalog adds up to 70 + 30, a score with any
 * Checking check has no number, ranking follows OAS-RUBRIC.md, and whatever
 * oas-scores.json holds is well formed. Fixtures only: no real score lives here.
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import {
  buildBoard,
  categoryRank,
  CHECKS,
  checkedUrls,
  GROUPS,
  improveText,
  oasScores,
  oasValue,
  partEarned,
  rankText,
  round1,
  AGREE_FIX,
  PUBLISH_FIX,
  type CheckState,
  type OasScore,
  type ProgramRef,
} from "../src/lib/oas"

const TODAY = new Date("2026-10-20T00:00:00Z")
const IDS = GROUPS.flatMap((g) => g.ids)

/** A full score: every check met unless listed in `states`. */
function fixture(slug: string, states: Record<string, CheckState> = {}, checked_at = "2026-10-18T22:00:00Z"): OasScore {
  const checks = IDS.map((id) => {
    const state = states[id] ?? "met"
    return { id, state, points: state === "met" ? CHECKS[id].max : 0, url: `https://${slug}.example/terms`, quote: "q" }
  })
  const s: OasScore = { slug, oas: null, transparency: null, partner_value: null, checked_at, checks }
  s.transparency = partEarned(s, "transparency")
  s.partner_value = partEarned(s, "partner_value")
  s.oas = round1(s.transparency + s.partner_value)
  return s
}

const P = (slug: string, category = "AI", network: string | null = "partnerstack"): ProgramRef => ({ slug, name: slug, category, network })

test("catalog: 36 checks, Transparency 70 and Partner value 30", () => {
  assert.equal(IDS.length, 36)
  assert.equal(new Set(IDS).size, 36)
  assert.deepEqual(Object.keys(CHECKS).sort(), [...IDS].sort())
  const sum = (part: string) => round1(IDS.filter((id) => CHECKS[id].part === part).reduce((a, id) => a + CHECKS[id].max, 0))
  assert.equal(sum("transparency"), 70)
  assert.equal(sum("partner_value"), 30)
  for (const id of IDS) assert.ok(CHECKS[id].label && CHECKS[id].fix, id)
})

test("one fixed number; any Checking check means no number", () => {
  assert.equal(oasValue(fixture("a")), 100)
  assert.equal(oasValue(fixture("b", { P4: "not_public", V5: "not_met" })), round1(100 - 3.5 - 4))
  assert.equal(oasValue(fixture("c", { E4: "checking" })), null)
  assert.equal(oasValue({ ...fixture("d"), oas: null }), null)
})

test("ranking: ties share a rank; same team, Affitor network, Checking, broken apply link and stale reviews are not ranked", () => {
  const scores = [
    fixture("top"),
    fixture("tie-a", { V5: "not_met" }),
    fixture("tie-b", { V5: "not_met" }),
    fixture("third", { R1: "not_met", V5: "not_met" }),
    fixture("kyma-api"),
    fixture("on-affitor"),
    fixture("scoring", { A3: "checking" }),
    fixture("no-apply", { E1: "not_met" }),
    fixture("stale", {}, "2026-06-01T00:00:00Z"),
    fixture("not-in-registry"),
  ]
  const programs = [P("top"), P("tie-a"), P("tie-b"), P("third", "Marketing"), P("kyma-api"), P("on-affitor", "AI", "affitor"), P("scoring"), P("no-apply"), P("stale")]
  const board = buildBoard(scores, programs, TODAY)
  const by = Object.fromEntries(board.map((r) => [r.program.slug, r]))
  assert.equal(board.length, 9)
  assert.deepEqual(board.filter((r) => r.rank != null).map((r) => [r.program.slug, r.rank]), [["top", 1], ["tie-a", 2], ["tie-b", 2], ["third", 4]])
  assert.equal(by["kyma-api"].unranked, "same-team")
  assert.equal(by["kyma-api"].oas, 100)
  assert.equal(by["on-affitor"].unranked, "affitor")
  assert.equal(by["scoring"].unranked, "checking")
  assert.equal(by["scoring"].oas, null)
  assert.equal(by["no-apply"].unranked, "no-apply-link")
  assert.equal(by["stale"].unranked, "stale")
  assert.deepEqual(categoryRank(board, "tie-b"), { rank: 2, of: 3, category: "AI" })
  assert.equal(categoryRank(board, "kyma-api"), null)
})

test("rank line: #1 always, others only with 5 or more ranked", () => {
  assert.equal(rankText({ rank: 1, of: 2, category: "AI" }), "#1 of 2 ranked in AI")
  assert.equal(rankText({ rank: 2, of: 2, category: "AI" }), null)
  assert.equal(rankText({ rank: 1, of: 8, category: "AI" }), "#1 in AI")
  assert.equal(rankText({ rank: 3, of: 8, category: "AI" }), "Top 3 in AI")
  assert.equal(rankText({ rank: 4, of: 8, category: "AI" }), "Top half in AI")
  assert.equal(rankText({ rank: 5, of: 8, category: "AI" }), null)
  assert.equal(rankText(null), null)
})

test("checked URLs and the fix shown", () => {
  assert.deepEqual(checkedUrls({ id: "P1", state: "not_met", points: 0, url: "https://a.example ; https://b.example" }), ["https://a.example", "https://b.example"])
  assert.deepEqual(checkedUrls({ id: "P1", state: "not_met", points: 0, url: "x", checked_urls: ["https://c.example"] }), ["https://c.example"])
  assert.equal(improveText({ id: "P2", state: "not_public", points: 0 }), PUBLISH_FIX)
  assert.equal(improveText({ id: "P2", state: "not_met", points: 0, quote: "Conflict: $100 on one page, $30 on another." }), AGREE_FIX)
  assert.equal(improveText({ id: "P2", state: "not_met", points: 0, quote: "Checked: no minimum stated." }), CHECKS.P2.fix)
})

test("oas-scores.json is well formed", () => {
  assert.ok(Array.isArray(oasScores))
  for (const s of oasScores) {
    assert.match(s.slug, /^[a-z0-9-]+$/)
    assert.ok(!Number.isNaN(Date.parse(s.checked_at)), `${s.slug} checked_at`)
    assert.deepEqual(s.checks.map((c) => c.id).sort(), [...IDS].sort(), `${s.slug} has every check once`)
    for (const c of s.checks) {
      assert.ok(["met", "not_met", "not_public", "checking"].includes(c.state), `${s.slug} ${c.id} state`)
      assert.equal(c.points, c.state === "met" ? CHECKS[c.id].max : 0, `${s.slug} ${c.id} points`)
      if (c.state === "not_met") assert.ok(checkedUrls(c).length > 0, `${s.slug} ${c.id} lists the pages checked`)
    }
    if (s.oas != null) {
      assert.equal(s.transparency, partEarned(s, "transparency"), `${s.slug} transparency`)
      assert.equal(s.partner_value, partEarned(s, "partner_value"), `${s.slug} partner value`)
      assert.equal(s.oas, round1(s.transparency! + s.partner_value!), `${s.slug} oas`)
    }
  }
})
