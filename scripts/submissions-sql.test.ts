/**
 * Migration 013's two functions against a real Postgres: caps, the duplicate
 * path, the concurrent last slot, a status change racing a submit, and that
 * anon/authenticated can neither read the table nor call the functions.
 *
 * Skipped unless SUBMISSIONS_PG_URL is set. It must point at a local
 * throwaway database whose name ends in "_test": the test drops and recreates
 * the public schema there. CI has no Postgres; this runs on a laptop, e.g.
 *   createdb -h /tmp/pg oa_submissions_test
 *   SUBMISSIONS_PG_URL='postgresql:///oa_submissions_test?host=/tmp/pg&port=54329&user=postgres' \
 *     npx tsx --test scripts/submissions-sql.test.ts
 */
import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { join } from "node:path"
import { before, test } from "node:test"
import { promisify } from "node:util"
import { outcomeOf } from "../src/lib/submissions/live"

const run = promisify(execFile)
const URL_ = process.env.SUBMISSIONS_PG_URL ?? ""

/**
 * The test drops and recreates the public schema, so the URL may name only a
 * local Unix socket and a *_test database, with no other connection
 * parameter: libpq would honour hostaddr, dbname, service and the rest over
 * what the path says. psql also runs with every PG* variable removed, and
 * the live connection is checked again before anything is dropped.
 */
export function localTestUrl(url: string): boolean {
  const m = /^postgresql:\/\/\/([a-z0-9_]+_test)\?([^#]*)$/.exec(url)
  if (!m) return false
  const params = new URLSearchParams(m[2])
  const keys = [...params.keys()]
  if (new Set(keys).size !== keys.length || !keys.includes("host")) return false
  return keys.every((k) => {
    const v = params.get(k) ?? ""
    if (k === "host") return /^\/[A-Za-z0-9_./-]+$/.test(v) && !v.includes("..")
    if (k === "port") return /^\d{2,5}$/.test(v)
    if (k === "user") return /^[a-z0-9_]+$/.test(v)
    return false
  })
}

const skip = !URL_ ? "SUBMISSIONS_PG_URL not set" : !localTestUrl(URL_) ? "SUBMISSIONS_PG_URL must be postgresql:///<name>_test?host=/socket/dir[&port=][&user=]" : false
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("PG"))) as NodeJS.ProcessEnv
const psql = (args: string[]) => run("psql", [URL_, "-v", "ON_ERROR_STOP=1", "-qtAX", ...args], { env })

async function sql(query: string, role = "postgres"): Promise<string> {
  const { stdout } = await psql(["-c", `SET ROLE ${role}; ${query}`])
  return stdout.trim()
}

async function fails(query: string, role: string): Promise<string> {
  try {
    await sql(query, role)
  } catch (err) {
    return String((err as { stderr?: string }).stderr ?? err)
  }
  throw new Error(`expected a failure for ${role}: ${query}`)
}

const q = (s: string | null) => (s === null ? "NULL" : `'${s.replace(/'/g, "''")}'`)

/** Caps in migration order: ip_hour, ip_day, domain_day, site_requests_day, site_new_day, site_new_plain_day. */
function submitCall(domain: string, ip: string, source = "api", caps = [5, 20, 5, 2000, 300, 100], contact: string | null = null) {
  return `SELECT submission_submit(${q(domain)}, ${q(`https://${domain}/`)}, NULL, NULL, ${q(contact)}, NULL, ${q(source)}, ${q(ip)}, ${caps.join(", ")})`
}
const submit = async (...args: Parameters<typeof submitCall>) => JSON.parse(await sql(submitCall(...args), "service_role")) as Record<string, unknown>

before(async () => {
  if (skip) return
  // The connection psql actually made: a Unix socket (no server address) and a *_test database.
  const [db, socket] = (await psql(["-c", "SELECT current_database(), inet_server_addr() IS NULL"])).stdout.trim().split("|")
  if (!/_test$/.test(db) || socket !== "t") throw new Error("refusing to reset: not a local *_test database over a Unix socket")
  await psql(["-c", `
    DROP SCHEMA public CASCADE; CREATE SCHEMA public;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
    END $$;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    -- Supabase's default: new tables in public are granted to anon/authenticated; the migration must revoke them.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  `])
  for (const file of ["009_program_claims.sql", "013_program_submissions.sql"]) {
    await psql(["-f", join(__dirname, "../supabase/migrations", file)])
  }
})

test("the reset guard accepts only a local socket URL for a *_test database", () => {
  for (const ok of [
    "postgresql:///oa_submissions_test?host=/tmp/pg",
    "postgresql:///oa_submissions_test?host=/tmp/claude-501/oas&port=54329&user=postgres",
  ]) assert.equal(localTestUrl(ok), true, ok)
  for (const bad of [
    "postgresql://localhost/oa_test?hostaddr=203.0.113.10&dbname=production&user=postgres",
    "postgresql:///oa_test?host=/tmp/pg&hostaddr=203.0.113.10",
    "postgresql:///oa_test?host=/tmp/pg&dbname=production",
    "postgresql:///oa_test?host=/tmp/pg&service=prod",
    "postgresql:///oa_test?host=db.example.com",
    "postgresql:///oa_test?host=/tmp/pg&host=db.example.com",
    "postgresql:///oa_test?host=/tmp/../etc",
    "postgresql:///oa_test",
    "postgresql://localhost/oa_test",
    "postgresql://user:pw@db.example.com/oa_test",
    "postgresql:///production?host=/tmp/pg",
    "postgres:///oa_test?host=/tmp/pg",
    "postgresql:///oa_test?host=/tmp/pg&options=-c%20search_path%3Dx",
  ]) assert.equal(localTestUrl(bad), false, bad)
})

const reset = () => sql("TRUNCATE program_submissions; TRUNCATE claim_events;")

test("anon and authenticated can neither read the table nor call the functions", { skip }, async () => {
  for (const role of ["anon", "authenticated"]) {
    assert.match(await fails("SELECT * FROM program_submissions", role), /permission denied/)
    assert.match(await fails("INSERT INTO program_submissions (domain, program_url, source, ip_hash) VALUES ('a.com', 'https://a.com/', 'api', 'x')", role), /permission denied/)
    assert.match(await fails(submitCall("a.com", "ip"), role), /permission denied/)
    assert.match(await fails("SELECT submission_set_status('00000000-0000-4000-8000-000000000000', 'queued', 'verifying', NULL, NULL)", role), /permission denied/)
  }
  assert.equal(await sql("SELECT relrowsecurity FROM pg_class WHERE relname = 'program_submissions'"), "t")
  assert.equal(await sql("SELECT count(*) FROM pg_policies WHERE tablename = 'program_submissions'"), "0")
})

test("new, then duplicate for the same domain, then a fresh row after a rejection", { skip }, async () => {
  await reset()
  const first = await submit("brand.com", "ip1", "api", undefined, "a@brand.com")
  assert.equal(first.result, "new")
  assert.equal(first.status, "queued")
  assert.equal(first.ip_hour, 1)
  assert.equal(first.contact_email, undefined, "the function never returns the contact")
  // The live store's parser accepts the function's real answer.
  const parsed = outcomeOf(first)
  assert.ok(parsed.result === "new" && parsed.row.id === first.id && parsed.row.status === "queued" && parsed.ipHour === 1)
  assert.deepEqual(outcomeOf({ result: "limited", window: "ip_hour" }), { result: "limited", window: "ip_hour" })
  const again = await submit("brand.com", "ip2")
  assert.equal(again.result, "duplicate")
  assert.equal(again.id, first.id)
  assert.equal(await sql(`SELECT submission_set_status('${first.id}', 'queued', 'rejected', 'no_program', NULL)`, "service_role"), "t")
  assert.equal(await sql(`SELECT submission_set_status('${first.id}', 'queued', 'rejected', 'no_program', NULL)`, "service_role"), "f", "conditional on the expected status")
  const fresh = await submit("brand.com", "ip3")
  assert.equal(fresh.result, "new")
  assert.notEqual(fresh.id, first.id)
  assert.match(await fails(`SELECT submission_set_status('${first.id}', 'rejected', 'queued', NULL, NULL)`, "service_role"), /transition not allowed/)
  // Status and reason/slug stay consistent.
  assert.match(await fails(`UPDATE program_submissions SET status = 'listed' WHERE id = '${fresh.id}'`, "service_role"), /check constraint/)
})

test("limits: ip hour, domain day; a refused request writes nothing", { skip }, async () => {
  await reset()
  for (let i = 0; i < 5; i++) assert.equal((await submit(`d${i}.com`, "ipx")).result, "new")
  const events = await sql("SELECT count(*) FROM claim_events")
  for (let i = 0; i < 30; i++) assert.deepEqual(await submit(`e${i}.com`, "ipx"), { result: "limited", window: "ip_hour" })
  assert.equal(await sql("SELECT count(*) FROM claim_events"), events)
  assert.equal(await sql("SELECT count(*) FROM program_submissions"), "5")

  for (let i = 0; i < 5; i++) await submit("same.com", `ipd${i}`)
  assert.deepEqual(await submit("same.com", "ipd-new"), { result: "limited", window: "domain_day" })
})

test("site caps: 20 concurrent submits at 99 of 100 plain rows give exactly one new row", { skip }, async () => {
  await reset()
  await sql(`INSERT INTO program_submissions (domain, program_url, source, ip_hash)
    SELECT 'seed' || g || '.com', 'https://seed' || g || '.com/', 'api', 'h' || g FROM generate_series(1, 99) g`)
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => submit(`race${i}.com`, `ipr${i}`)))
  assert.equal(results.filter((r) => r.result === "new").length, 1)
  assert.equal(results.filter((r) => r.result === "limited" && r.window === "site_new").length, 19)
  assert.equal(await sql("SELECT count(*) FROM program_submissions"), "100")
  // Turnstile (web) still fits under the 300 total.
  assert.equal((await submit("human.com", "ipw", "web", [10, 40, 5, 2000, 300, 100])).result, "new")
})

test("site cap on admitted requests writes cap.reached once", { skip }, async () => {
  await reset()
  for (let i = 0; i < 3; i++) assert.equal((await submit(`s${i}.com`, `ips${i}`, "api", [5, 20, 5, 3, 300, 100])).result, "new")
  for (let i = 0; i < 4; i++) assert.deepEqual(await submit(`t${i}.com`, `ipt${i}`, "api", [5, 20, 5, 3, 300, 100]), { result: "limited", window: "site_day" })
  assert.equal(await sql("SELECT count(*) FROM claim_events WHERE type = 'cap.reached'"), "1")
})

test("a status change racing submits never errors and never leaves two open rows", { skip }, async () => {
  for (let round = 0; round < 5; round++) {
    await reset()
    const first = await submit("brand.com", "ip0")
    const [, ...rest] = await Promise.all([
      sql(`SELECT submission_set_status('${first.id}', 'queued', 'rejected', 'spam', NULL)`, "service_role"),
      // A domain cap above the 11 requests, so every answer is new or duplicate.
      ...Array.from({ length: 10 }, (_, i) => submit("brand.com", `ipq${i}`, "api", [5, 20, 50, 2000, 300, 100])),
    ])
    const fresh = rest.filter((r) => r.result === "new")
    assert.ok(fresh.length <= 1)
    // Each duplicate names the row open at that moment: the first one, or the one created after the reject.
    assert.ok(rest.every((r) => r.result === "new" || (r.result === "duplicate" && (r.id === first.id || r.id === fresh[0]?.id))))
    assert.ok(Number(await sql("SELECT count(*) FROM program_submissions WHERE domain = 'brand.com' AND status IN ('queued', 'verifying')")) <= 1)
    assert.equal(await sql(`SELECT status FROM program_submissions WHERE id = '${first.id}'`), "rejected")
  }
})

test("retention: contact cleared 30 days after a final status, rows deleted after a year", { skip }, async () => {
  await reset()
  const a = await submit("old.com", "ipo", "api", undefined, "a@old.com")
  await sql(`SELECT submission_set_status('${a.id}', 'queued', 'rejected', 'spam', NULL)`, "service_role")
  await sql(`UPDATE program_submissions SET updated_at = now() - interval '31 days' WHERE id = '${a.id}'`)
  const b = await submit("ancient.com", "ipa", "api", undefined, "b@ancient.com")
  await sql(`UPDATE program_submissions SET created_at = now() - interval '366 days' WHERE id = '${b.id}'`)
  const c = await submit("open.com", "ipc", "api", undefined, "c@open.com")
  await submit("trigger.com", "ipt")
  assert.equal(await sql(`SELECT contact_email IS NULL FROM program_submissions WHERE id = '${a.id}'`), "t")
  assert.equal(await sql(`SELECT count(*) FROM program_submissions WHERE id = '${b.id}'`), "0")
  assert.equal(await sql(`SELECT contact_email FROM program_submissions WHERE id = '${c.id}'`), "c@open.com", "an open row keeps its contact")
})
