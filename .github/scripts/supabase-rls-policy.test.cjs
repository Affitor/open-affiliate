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
