/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const migrationsDir = path.join(__dirname, "../../supabase/migrations")

function loadMigrations() {
  return fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      sql: fs.readFileSync(path.join(migrationsDir, name), "utf8"),
    }))
}

function effectivePolicies(migrations) {
  const policies = new Map()

  for (const { sql } of migrations) {
    for (const match of sql.matchAll(
      /DROP POLICY IF EXISTS "([^"]+)" ON (\w+);/gi
    )) {
      const [, policyName, table] = match
      policies.delete(`${table}:${policyName}`)
    }

    for (const match of sql.matchAll(
      /CREATE POLICY "([^"]+)" ON (\w+) FOR ([^;]+);/gi
    )) {
      const [, policyName, table, clause] = match
      policies.set(`${table}:${policyName}`, { table, policyName, clause })
    }
  }

  return [...policies.values()]
}

const policies = effectivePolicies(loadMigrations())
const byTable = policies.reduce((acc, policy) => {
  acc[policy.table] ??= []
  acc[policy.table].push(policy)
  return acc
}, {})

test("events and visitors deny anon/authenticated after migration 007", () => {
  for (const table of ["events", "visitors"]) {
    assert.deepEqual(
      byTable[table] ?? [],
      [],
      `${table} should have no remaining policies (RLS default deny)`
    )
  }
})

test("program_stats and social_items keep SELECT-only public read", () => {
  for (const table of ["program_stats", "social_items"]) {
    const tablePolicies = byTable[table] ?? []
    assert.equal(tablePolicies.length, 1, `${table} should keep one public read policy`)
    assert.match(
      tablePolicies[0].clause,
      /^SELECT/i,
      `${table} policy must be SELECT-only`
    )
    assert.doesNotMatch(
      tablePolicies[0].clause,
      /(ALL|INSERT|UPDATE|DELETE)/i,
      `${table} must not expose write access`
    )
  }
})

test("claim tables are service-role only: RLS on, no policies, anon/authenticated revoked", () => {
  const sql = loadMigrations()
    .map((m) => m.sql)
    .join("\n")
  for (const table of ["program_claims", "claim_edits", "claim_events"]) {
    assert.deepEqual(byTable[table] ?? [], [], `${table} must have no policies`)
    assert.match(
      sql,
      new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`, "i"),
      `${table} must enable RLS`
    )
  }
  assert.match(
    sql,
    /REVOKE ALL ON program_claims, claim_edits, claim_events FROM anon, authenticated;/i,
    "claim tables must revoke anon/authenticated grants"
  )
})

test("account tables (011) are service-role only: RLS on, no policies, anon/authenticated revoked", () => {
  const sql = fs.readFileSync(path.join(migrationsDir, "011_claim_accounts.sql"), "utf8")
  for (const table of ["claim_members", "claim_signin_codes"]) {
    assert.deepEqual(byTable[table] ?? [], [], `${table} must have no policies`)
    assert.match(sql, new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`, "i"), `${table} must enable RLS`)
  }
  assert.match(sql, /REVOKE ALL ON claim_members, claim_signin_codes FROM anon, authenticated;/i)
  assert.match(sql, /SECURITY INVOKER/i)
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.claim_add_member\(uuid, text, uuid, int\) FROM PUBLIC, anon, authenticated;/i,
  )
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.claim_add_member\(uuid, text, uuid, int\) TO service_role;/i)
})

test("claim_submit_edit is callable by service_role only", () => {
  const sql = fs.readFileSync(path.join(migrationsDir, "010_claim_edit_quota.sql"), "utf8")
  assert.match(sql, /SECURITY INVOKER/i, "must run with the caller's rights")
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.claim_submit_edit\(uuid, text, jsonb, int\) FROM PUBLIC, anon, authenticated;/i,
    "PostgREST exposes public functions; revoke the default PUBLIC execute grant"
  )
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.claim_submit_edit\(uuid, text, jsonb, int\) TO service_role;/i)
})

test("migration 007 drops the previously open analytics policies", () => {
  const lockMigration = fs.readFileSync(
    path.join(migrationsDir, "007_lock_analytics_rls.sql"),
    "utf8"
  )

  for (const name of [
    "Service role full access",
    "Service role write stats",
    "Service role full access visitors",
    "Service write",
    "Service update",
  ]) {
    assert.match(
      lockMigration,
      new RegExp(`DROP POLICY IF EXISTS "${name}"`, "i"),
      `007 should drop "${name}"`
    )
  }
})
