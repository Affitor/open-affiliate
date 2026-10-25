/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const sql = fs.readFileSync(
  path.join(__dirname, "../../supabase/migrations/008_sift_rankings_agg.sql"),
  "utf8"
)
const route = fs.readFileSync(
  path.join(__dirname, "../../src/app/api/sift-rankings/route.ts"),
  "utf8"
)

test("008 is LANGUAGE sql, not plpgsql", () => {
  assert.match(sql, /language sql/i)
  assert.doesNotMatch(sql, /language plpgsql/i)
})

test("008 does not grant execute to anon or public", () => {
  assert.match(sql, /revoke all on function public\.sift_rankings_agg\(\) from public/i)
  assert.match(sql, /grant execute on function public\.sift_rankings_agg\(\) to service_role/i)
  assert.doesNotMatch(sql, /grant execute[^;]*\sto\s+(anon|authenticated|public)\b/i)
})

test("API route no longer attaches duplicate program registry fields", () => {
  assert.doesNotMatch(route, /commissionDisplay|from "@\/lib\/programs"/)
  assert.match(route, /fetchSiftRankings/)
  assert.match(route, /SIFT_RANKINGS_CACHE_HEADERS/)
})
