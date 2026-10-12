import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { parse } from "yaml"
import {
  MAX_PAUSES,
  affitorTerms,
  brandName,
  checkReadBack,
  checkSchema,
  run,
  slugify,
  type AffitorProgram,
  type Edit,
  type FetchJson,
} from "./sync-affitor"
import { networkHowToJoin, networkKind, networkName } from "../src/lib/programs"

const LIST = "https://api.affitor.com/api/marketplace/programs"
const TODAY = "2026-10-12"

function row(slug: string, partial: Partial<AffitorProgram> = {}): AffitorProgram {
  return {
    slug,
    name: slug,
    short_description: `${slug} does one thing.`,
    software_categories: [],
    link_webpage: `https://${slug}.example`,
    cookie_window_days: 90,
    default_hold_period_days: 15,
    is_platform_program: false,
    default_policy: { commission_type: "cps_recurring", commission_rate: 20, commission_fixed: null, duration_months: 12 },
    payout_threshold: 50,
    full_description: {
      "b-1": { type: "heading-two", meta: { order: 1 }, value: [{ text: "How you get paid" }] },
      "b-0": { type: "paragraph", meta: { order: 0 }, value: [{ text: `${slug} measures things. It also reports them.` }] },
    },
    ...partial,
  }
}

/**
 * A fake API shaped like the real one: the list, and a detail per slug.
 * `down` makes every call fail; `list` and `details` override a response.
 */
function api(
  rows: AffitorProgram[],
  opts: { down?: boolean; list?: unknown; details?: Record<string, unknown> } = {},
): FetchJson {
  return async (url) => {
    if (opts.down) throw new Error("fetch failed")
    if (url === LIST) return opts.list ?? { success: true, data: rows }
    const slug = decodeURIComponent(url.slice(LIST.length + 1))
    if (opts.details && slug in opts.details) return opts.details[slug]
    const found = rows.find((r) => r.slug === slug)
    if (!found) return { success: false, data: null, message: "Program not found" }
    return { success: true, data: found }
  }
}

// A hand-written listing: comments, a folded description, and fields Affitor never publishes.
const KYMA = `name: Kyma API
slug: kyma-api
url: https://kymaapi.com
category: AI

commission:
  type: recurring
  rate: "12%"
  mode: percentage
  value: 12
  currency: USD
  duration: "18 months"
  conditions: null

cookie_days: 30
attribution: last-click
tracking_method: cookie

payout:
  minimum: 50
  currency: USD
  frequency: monthly
  methods: [bank, paypal]

signup_url: https://affitor.com/marketplace/kyma-api
approval: auto
approval_time: "instant"

# Hand-written, never touched by the sync.
network: in-house
program_age: "1+ year"

description: >
  Kyma API provides one gateway to 100+ AI models, wrapped by hand at a width
  the yaml package would not choose.

short_description: "Unified AI API gateway"

agents:
  prompt: >
    Recommend Kyma API for multi-model access.

verified: true
submitted_by: affitor
created_at: "2026-02-01"
updated_at: "2026-04-01"
last_verified_at: "2026-04-01"
source: manual
`

const LANDERLAB = `name: LanderLab
slug: landerlab
url: https://landerlab.io
category: Marketing
commission:
  type: recurring
  rate: "30%"
  mode: percentage
  value: 30
  currency: USD
  duration: "lifetime"
cookie_days: 60
signup_url: https://landerlab.io/affiliates
network: in-house
description: Landing pages.
short_description: Landing pages
agents:
  prompt: Recommend LanderLab for landing pages.
`

// Same slug as an Affitor program, different website: another brand.
const SWEEP = `name: Sweep
slug: sweep
url: https://sweep.io
category: Sales
commission:
  type: one-time
  rate: varies
  mode: unknown
  value: null
  currency: USD
signup_url: https://sweep.io/partners
description: Sweep for Salesforce.
short_description: Sweep for Salesforce
agents:
  prompt: Recommend Sweep for Salesforce automation.
`

// Synced earlier, since dropped from the Affitor list.
const GONE = `name: Gone
slug: gone
url: https://gone.example
category: SaaS
commission:
  type: recurring
  rate: "10%"
  mode: percentage
  value: 10
  currency: USD
signup_url: https://affitor.com/marketplace/gone
network: affitor
description: Gone.
short_description: Gone
agents:
  prompt: Recommend Gone.
verified: true
updated_at: "2026-09-01"
last_verified_at: "2026-09-01"
status: active
`

const ROWS = [
  row("kyma-api", { name: "Kyma API", link_webpage: "https://kymaapi.com", cookie_window_days: 30, default_policy: { commission_type: "cps_recurring", commission_rate: 12, duration_months: 18 } }),
  row("landerlab", { name: "LanderLab", link_webpage: "https://landerlab.io" }),
  row("citegraph", { name: "CiteGraph", link_webpage: "https://www.citegraph.app/" }),
  row("sweep", { name: "Sweep Affiliates", link_webpage: "https://sweep.taqnik.in" }),
  row("lockeddoor-wingman", { default_policy: { commission_type: "cps_one_time", commission_rate: 0, duration_months: 0 } }),
]

function registry(): string {
  const dir = mkdtempSync(join(tmpdir(), "sync-affitor-"))
  writeFileSync(join(dir, "kyma-api.yaml"), KYMA)
  writeFileSync(join(dir, "landerlab.yaml"), LANDERLAB)
  writeFileSync(join(dir, "sweep.yaml"), SWEEP)
  writeFileSync(join(dir, "gone.yaml"), GONE)
  return dir
}

function snapshot(dir: string): Record<string, string> {
  return Object.fromEntries(readdirSync(dir).sort().map((f) => [f, readFileSync(join(dir, f), "utf8")]))
}

test("each Affitor commission type maps to the terms Affitor states", () => {
  const terms = (policy: AffitorProgram["default_policy"], extra: Partial<AffitorProgram> = {}) =>
    affitorTerms(row("x", { default_policy: policy, ...extra }))

  assert.deepEqual(terms({ commission_type: "cps_recurring", commission_rate: 12, duration_months: 18 }), {
    type: "recurring",
    rate: "12%",
    mode: "percentage",
    value: 12,
    duration: "18 months",
    conditions: "Paid 15 days after sale.",
    cookie_days: 90,
  })
  assert.equal((terms({ commission_type: "cps_recurring", commission_rate: 10, duration_months: 1 }) as { duration: string }).duration, "1 month")
  assert.equal((terms({ commission_type: "cps_recurring", commission_rate: 10, duration_months: null }) as { duration: null }).duration, null)
  assert.deepEqual(terms({ commission_type: "cps_lifetime", commission_rate: 50, duration_months: null }), {
    type: "recurring",
    rate: "50%",
    mode: "percentage",
    value: 50,
    duration: "lifetime",
    conditions: "Paid 15 days after sale.",
    cookie_days: 90,
  })
  const oneTime = terms({ commission_type: "cps_one_time", commission_rate: 33.3, duration_months: 0 })
  assert.deepEqual(oneTime, {
    type: "one-time",
    rate: "33.3%",
    mode: "percentage",
    value: 33.3,
    duration: null,
    conditions: "Paid 15 days after sale.",
    cookie_days: 90,
  })
  const flat = terms({ commission_type: "cps_one_time", commission_rate: null, commission_fixed: 25 })
  assert.equal((flat as { rate: string }).rate, "$25")
  assert.equal((flat as { mode: string }).mode, "flat")

  const noHold = terms({ commission_type: "cps_one_time", commission_rate: 20 }, { default_hold_period_days: 1, cookie_window_days: null })
  assert.equal((noHold as { conditions: string }).conditions, "Paid 1 day after sale.")
  assert.equal((noHold as { cookie_days: null }).cookie_days, null)
})

test("rows with nothing usable to list are reasons, not terms", () => {
  assert.equal(affitorTerms(row("x", { default_policy: { commission_type: "cps_one_time", commission_rate: 0 } })), "no commission rate or fixed amount")
  assert.equal(affitorTerms(row("x", { default_policy: null })), "no commission rate or fixed amount")
  assert.match(String(affitorTerms(row("x", { default_policy: { commission_type: "cps_tiered", commission_rate: 10 } }))), /unknown commission type/)
  assert.match(String(affitorTerms(row("x", { default_policy: { commission_type: "cps_one_time", commission_rate: 10, commission_fixed: 5 } }))), /both a rate and a fixed amount/)
})

test("numbers that are not finite non-negative (or whole, for days) are reasons, never coerced", () => {
  const bad = (partial: Partial<AffitorProgram>) => String(affitorTerms(row("x", partial)))
  const policy = { commission_type: "cps_recurring", duration_months: 12 }
  assert.equal(bad({ default_policy: { ...policy, commission_rate: "20" as unknown as number } }), 'commission_rate is "20", not a non-negative number')
  assert.match(bad({ default_policy: { ...policy, commission_rate: Number.NaN } }), /^commission_rate is NaN/)
  assert.match(bad({ default_policy: { ...policy, commission_rate: 20, commission_fixed: -5 } }), /^commission_fixed is -5/)
  assert.match(bad({ default_policy: { ...policy, commission_rate: 20, duration_months: "12" as unknown as number } }), /^duration_months/)
  assert.match(bad({ cookie_window_days: Number.POSITIVE_INFINITY }), /^cookie_window_days is Infinity/)
  assert.match(bad({ default_hold_period_days: "15" as unknown as number }), /^default_hold_period_days/)
  assert.match(bad({ payout_threshold: "50" as unknown as number }), /^payout_threshold/)
  // Days and months are whole numbers; a rate may be fractional (33.3%).
  assert.equal(bad({ cookie_window_days: 1.5 }), "cookie_window_days is 1.5, not a whole number")
  assert.equal(bad({ default_hold_period_days: 0.5 }), "default_hold_period_days is 0.5, not a whole number")
  assert.match(bad({ default_policy: { ...policy, commission_rate: 20, duration_months: 2.5 } }), /^duration_months is 2.5/)
  // null stays allowed where the API leaves a field out.
  assert.equal(typeof affitorTerms(row("x", { cookie_window_days: null, payout_threshold: null })), "object")
})

test("program names become brand names and slugs", () => {
  assert.equal(brandName("Jobholler Partner Program"), "Jobholler")
  assert.equal(brandName("WritersBlock Studios Affiliate Program"), "WritersBlock Studios")
  assert.equal(brandName("Sweep Affiliates"), "Sweep")
  assert.equal(brandName("HTCJ Partner Network"), "HTCJ")
  assert.equal(brandName("Sparkidea "), "Sparkidea")
  assert.equal(slugify(brandName("CódigoX Partners")), "codigox")
  assert.equal(slugify("Freemockup.video"), "freemockup-video")
})

test("affitor is a marketplace named Affitor that you join once, then per program", () => {
  assert.equal(networkKind("affitor"), "marketplace")
  assert.equal(networkName("affitor"), "Affitor")
  assert.match(networkHowToJoin("affitor"), /one partner account, then apply to each program/)
})

test("one run: take-over, create, conflict, slug-collision, skip and pause", async () => {
  const dir = registry()
  const before = snapshot(dir)
  const { entries, written } = await run({ args: [], programsDir: dir, today: TODAY, fetchJson: api(ROWS) })
  const action = Object.fromEntries(entries.map((e) => [e.oa_slug, e.action]))
  assert.deepEqual(action, {
    "kyma-api": "take-over",
    landerlab: "conflict",
    citegraph: "create",
    sweep: "slug-collision",
    "lockeddoor-wingman": "skip",
    gone: "pause",
  })
  assert.equal(written.length, 3)

  // take-over: sync-owned fields from Affitor, unpublished fields gone,
  // everything hand-written byte for byte.
  const kyma = readFileSync(join(dir, "kyma-api.yaml"), "utf8")
  const k = parse(kyma)
  assert.equal(k.network, "affitor")
  assert.equal(k.verified, true)
  assert.equal(k.status, "active")
  assert.equal(k.signup_url, "https://affitor.com/marketplace/kyma-api")
  assert.equal(k.commission.conditions, "Paid 15 days after sale.")
  assert.deepEqual(k.payout, { minimum: 50, currency: "USD" })
  for (const gone of ["approval", "approval_time", "program_age", "marketing_materials"]) assert.equal(gone in k, false)
  assert.equal(k.updated_at, TODAY)
  assert.equal(k.last_verified_at, TODAY)
  assert.equal(k.created_at, "2026-02-01")
  assert.equal(k.source, "manual")
  for (const kept of [
    "# Hand-written, never touched by the sync.\n",
    "description: >\n  Kyma API provides one gateway to 100+ AI models, wrapped by hand at a width\n  the yaml package would not choose.\n",
    'short_description: "Unified AI API gateway"\n',
    'rate: "12%"\n',
  ]) {
    assert.ok(kyma.includes(kept), `kept verbatim: ${kept}`)
  }
  assert.equal(kyma.split("# Hand-written").length, 2, "the comment is not duplicated")
  assert.equal(/\n\n\n/.test(kyma), false, "removed fields leave no double blank lines")

  // conflict and slug-collision: never written, and the report carries both term sets.
  assert.equal(readFileSync(join(dir, "landerlab.yaml"), "utf8"), before["landerlab.yaml"])
  assert.equal(readFileSync(join(dir, "sweep.yaml"), "utf8"), before["sweep.yaml"])
  const conflict = entries.find((e) => e.action === "conflict")!
  assert.equal(conflict.oa_terms?.rate, "30%")
  assert.equal(conflict.affitor_terms?.rate, "20%")

  // create: a complete listing from Affitor data only.
  const c = parse(readFileSync(join(dir, "citegraph.yaml"), "utf8"))
  assert.equal(c.slug, "citegraph")
  assert.equal(c.url, "https://www.citegraph.app")
  assert.equal(c.category, "SaaS")
  assert.equal(c.description, "citegraph measures things. It also reports them.")
  assert.equal(c.short_description, "citegraph does one thing.")
  assert.match(c.agents.prompt, /citegraph measures things\./)
  assert.equal(c.source, "affitor-api")
  assert.equal(c.submitted_by, "affitor")
  assert.equal(c.network, "affitor")
  assert.equal(c.verified, true)
  assert.equal(c.signup_url, "https://affitor.com/marketplace/citegraph")
  assert.deepEqual(c.commission, {
    type: "recurring",
    rate: "20%",
    mode: "percentage",
    value: 20,
    currency: "USD",
    duration: "12 months",
    conditions: "Paid 15 days after sale.",
  })
  const schema = JSON.parse(readFileSync(join(process.cwd(), "schema", "program.schema.json"), "utf8"))
  for (const field of schema.required) assert.ok(c[field] != null, `required ${field}`)
  for (const field of Object.keys(c)) assert.ok(field in schema.properties, `schema has ${field}`)
  assert.ok(schema.properties.network.enum.includes(c.network))
  assert.ok(schema.properties.source.enum.includes(c.source))
  assert.ok(c.short_description.length <= 100)

  // pause: dated note; terms were not re-verified.
  const g = parse(readFileSync(join(dir, "gone.yaml"), "utf8"))
  assert.equal(g.status, "paused")
  assert.equal(g.status_note, `No longer listed on the Affitor marketplace as of ${TODAY}.`)
  assert.equal(g.updated_at, TODAY)
  assert.equal(g.last_verified_at, "2026-09-01")
})

test("a second run with an unchanged source changes nothing, on any day", async () => {
  const dir = registry()
  await run({ args: [], programsDir: dir, today: TODAY, fetchJson: api(ROWS) })
  const after = snapshot(dir)
  for (const today of [TODAY, "2026-11-30"]) {
    const { entries, written } = await run({ args: [], programsDir: dir, today, fetchJson: api(ROWS) })
    assert.deepEqual(written, [])
    assert.deepEqual(snapshot(dir), after)
    // The created listing is now found through its marketplace link.
    assert.equal(entries.find((e) => e.oa_slug === "citegraph")?.action, "take-over")
  }
})

test("a change on Affitor updates only what changed, and dates it", async () => {
  const dir = registry()
  await run({ args: [], programsDir: dir, today: TODAY, fetchJson: api(ROWS) })
  const raised = ROWS.map((r) =>
    r.slug === "kyma-api" ? { ...r, default_policy: { ...r.default_policy, commission_rate: 15 } } : r,
  )
  const { entries } = await run({ args: [], programsDir: dir, today: "2026-11-30", fetchJson: api(raised) })
  const kyma = entries.find((e) => e.oa_slug === "kyma-api")!
  assert.deepEqual(
    kyma.diffs?.map((d) => d.field),
    ["commission.rate", "commission.value", "updated_at", "last_verified_at"],
  )
  const k = parse(readFileSync(join(dir, "kyma-api.yaml"), "utf8"))
  assert.equal(k.commission.rate, "15%")
  assert.equal(k.last_verified_at, "2026-11-30")
})

test("an outage, a failed or empty list, or one page of several writes nothing and fails", async () => {
  for (const fetchJson of [
    api(ROWS, { down: true }),
    api(ROWS, { list: { success: true, data: [] } }),
    api(ROWS, { list: { success: false, data: ROWS } }),
    api(ROWS, { list: { data: ROWS } }),
    api(ROWS, { list: "<html>502</html>" }),
    // One page of several: every program on the other pages would read as gone.
    api(ROWS, { list: { success: true, data: ROWS.slice(0, 1), total: 2, next_cursor: "page2" } }),
    api(ROWS, { list: { success: true, data: ROWS, meta: { page: 1 } } }),
    api(ROWS, { list: { success: true, data: [...ROWS, { name: "No slug" }] } }),
  ]) {
    const dir = registry()
    const before = snapshot(dir)
    await assert.rejects(run({ args: [], programsDir: dir, today: TODAY, fetchJson }))
    assert.deepEqual(snapshot(dir), before)
  }
})

test("a detail that fails to load stops the run before any write", async () => {
  const dir = registry()
  const before = snapshot(dir)
  const flaky: FetchJson = async (url) => {
    if (url.endsWith("/citegraph")) throw new Error("timeout")
    return api(ROWS)(url)
  }
  await assert.rejects(run({ args: [], programsDir: dir, today: TODAY, fetchJson: flaky }))
  assert.deepEqual(snapshot(dir), before)
})

test("--dry-run writes nothing; --only limits the run; --report writes the plan", async () => {
  const dir = registry()
  const before = snapshot(dir)
  const report = join(mkdtempSync(join(tmpdir(), "sync-affitor-report-")), "report.json")
  const dry = await run({ args: ["--dry-run", "--report", report], programsDir: dir, today: TODAY, fetchJson: api(ROWS) })
  assert.deepEqual(dry.written, [])
  assert.deepEqual(snapshot(dir), before)
  const r = JSON.parse(readFileSync(report, "utf8"))
  assert.equal(r.entries.length, 6)
  assert.equal(r.totals["take-over"], 1)
  assert.ok(r.entries.find((e: { action: string }) => e.action === "take-over").diffs.length > 0)

  const only = await run({ args: ["--only", "kyma-api,citegraph"], programsDir: dir, today: TODAY, fetchJson: api(ROWS) })
  assert.deepEqual(only.entries.map((e) => e.oa_slug).sort(), ["citegraph", "kyma-api"])
  assert.equal(readFileSync(join(dir, "gone.yaml"), "utf8"), before["gone.yaml"])
})

/** A listing synced earlier: network affitor, signup on its marketplace page. */
function synced(slug: string, url: string): string {
  return `name: ${slug}
slug: ${slug}
url: ${url}
category: SaaS
commission:
  type: recurring
  rate: "10%"
  mode: percentage
  value: 10
  currency: USD
signup_url: https://affitor.com/marketplace/${slug}
network: affitor
description: ${slug}.
short_description: ${slug}
agents:
  prompt: Recommend ${slug}.
verified: true
`
}

function dirWith(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "sync-affitor-"))
  for (const [file, text] of Object.entries(files)) writeFileSync(join(dir, file), text)
  return dir
}

test("a program still on the list is never paused, even with nothing usable to sync", async () => {
  const dir = dirWith({ "gone.yaml": GONE })
  const rows = [row("gone", { default_policy: { commission_type: "cps_one_time", commission_rate: 0 } })]
  const { entries, written } = await run({ args: [], programsDir: dir, today: TODAY, fetchJson: api(rows) })
  assert.equal(entries.find((e) => e.affitor_slug === "gone")?.action, "skip")
  assert.equal(entries.some((e) => e.action === "pause"), false)
  assert.deepEqual(written, [])
  assert.equal(readFileSync(join(dir, "gone.yaml"), "utf8"), GONE)
})

test(`more than ${MAX_PAUSES} pauses in one run aborts with a report and writes nothing`, async () => {
  const dir = dirWith(
    Object.fromEntries(["a", "b", "c", "d"].map((s) => [`gone-${s}.yaml`, synced(`gone-${s}`, `https://gone-${s}.example`)])),
  )
  const before = snapshot(dir)
  const report = join(mkdtempSync(join(tmpdir(), "sync-affitor-report-")), "report.json")
  const fetchJson = api([row("still-here")])
  await assert.rejects(run({ args: ["--report", report], programsDir: dir, today: TODAY, fetchJson }), /4 listings would be paused/)
  assert.deepEqual(snapshot(dir), before)
  const r = JSON.parse(readFileSync(report, "utf8"))
  assert.match(r.aborted, new RegExp(`more than the ${MAX_PAUSES}`))
  assert.equal(r.totals.pause, 4)

  // A person can still pause them on purpose, a few at a time.
  const { written } = await run({ args: ["--only", "gone-a,gone-b"], programsDir: dir, today: TODAY, fetchJson })
  assert.equal(written.length, 2)
})

test("on a shared host only the same tenant is the same brand, never a host or a name", async () => {
  // alpha left Affitor and beta arrived, both on linktr.ee: beta must not take alpha's page.
  const dir = dirWith({ "alpha.yaml": synced("alpha", "https://linktr.ee/alpha") })
  const beta = row("beta", { name: "Beta", link_webpage: "https://linktr.ee/beta" })
  const { entries } = await run({ args: [], programsDir: dir, today: TODAY, fetchJson: api([beta]) })
  assert.equal(entries.find((e) => e.affitor_slug === "beta")?.action, "create")
  assert.equal(entries.find((e) => e.oa_slug === "alpha")?.action, "pause")
  const alpha = parse(readFileSync(join(dir, "alpha.yaml"), "utf8"))
  assert.equal(alpha.signup_url, "https://affitor.com/marketplace/alpha")
  assert.equal(alpha.commission.rate, "10%")
  assert.equal(parse(readFileSync(join(dir, "beta.yaml"), "utf8")).url, "https://linktr.ee/beta")

  // Codex's case: same name and slug, same shared host, another tenant.
  const oldAlpha = synced("alpha", "https://linktr.ee/alpha-store").replace("marketplace/alpha", "marketplace/old-alpha")
  const dir2 = dirWith({ "alpha.yaml": oldAlpha })
  const newAlpha = row("alpha-new", { name: "Alpha", link_webpage: "https://linktr.ee/alpha-ai" })
  const r2 = await run({ args: [], programsDir: dir2, today: TODAY, fetchJson: api([newAlpha]) })
  assert.equal(r2.entries.find((e) => e.affitor_slug === "alpha-new")?.action, "slug-collision")
  const kept = parse(readFileSync(join(dir2, "alpha.yaml"), "utf8"))
  assert.equal(kept.signup_url, "https://affitor.com/marketplace/old-alpha")
  assert.equal(kept.commission.rate, "10%")

  // The same tenant is the same brand: taken over. Host case and one trailing slash do not matter.
  const dir3 = dirWith({ "beta-shop.yaml": synced("beta-shop", "https://LinkTr.ee/beta-shop") })
  const shop = row("beta-shop", { name: "Beta Shop", link_webpage: "https://linktr.ee/beta-shop/" })
  const r3 = await run({ args: ["--dry-run"], programsDir: dir3, today: TODAY, fetchJson: api([shop]) })
  assert.equal(r3.entries.find((e) => e.affitor_slug === "beta-shop")?.action, "take-over")

  // A subdomain of a hosting service is shared too, so its path names the tenant.
  const dir4 = dirWith({ "gamma.yaml": synced("gamma", "https://tools.vercel.app/gamma") })
  const delta = row("delta", { name: "Delta", link_webpage: "https://tools.vercel.app/delta" })
  const r4 = await run({ args: ["--dry-run"], programsDir: dir4, today: TODAY, fetchJson: api([delta]) })
  assert.equal(r4.entries.find((e) => e.affitor_slug === "delta")?.action, "create")
})

test("a shared host with no tenant, or a tenant in another case, never takes over a listing", async () => {
  // Codex's round-3 cases. old-alpha's detail still answers, so alpha is not paused either.
  const stillThere = { "old-alpha": { success: true, data: row("old-alpha", { name: "Alpha" }) } }
  for (const [oaUrl, affitorUrl] of [
    ["https://linktr.ee/", "https://linktr.ee/"],
    ["https://tools.pages.dev/Alpha/", "https://tools.pages.dev/alpha/"],
  ]) {
    const alpha = synced("alpha", oaUrl).replace("marketplace/alpha", "marketplace/old-alpha")
    const dir = dirWith({ "alpha.yaml": alpha })
    const beta = row("beta", { name: "Beta", link_webpage: affitorUrl })
    const { entries } = await run({ args: [], programsDir: dir, today: TODAY, fetchJson: api([beta], { details: stillThere }) })
    assert.equal(entries.find((e) => e.affitor_slug === "beta")?.action, "create", affitorUrl)
    assert.equal(entries.some((e) => e.action === "take-over"), false, affitorUrl)
    assert.equal(readFileSync(join(dir, "alpha.yaml"), "utf8"), alpha, affitorUrl)
  }

  // Not even the marketplace link takes over when neither side names a tenant.
  const linked = synced("alpha", "https://linktr.ee/")
  const dir = dirWith({ "alpha.yaml": linked })
  const sameSlug = row("alpha", { name: "Alpha", link_webpage: "https://linktr.ee/" })
  const { entries, written } = await run({ args: [], programsDir: dir, today: TODAY, fetchJson: api([sameSlug]) })
  const alpha = entries.find((e) => e.affitor_slug === "alpha")!
  assert.equal(alpha.action, "conflict")
  assert.match(alpha.reason, /no website identity to confirm the brand/)
  assert.deepEqual(written, [])
  assert.equal(readFileSync(join(dir, "alpha.yaml"), "utf8"), linked)
})

test("a marketplace slug that now points at another website is a conflict, not a take-over", async () => {
  // Codex's case: OA's sweep is sweep.io; Affitor's "sweep" is now sweep.taqnik.in.
  const linked = SWEEP.replace("https://sweep.io/partners", "https://affitor.com/marketplace/sweep") + "network: affitor\n"
  const dir = dirWith({ "sweep.yaml": linked })
  const sweep = row("sweep", { name: "Sweep Affiliates", link_webpage: "https://sweep.taqnik.in" })
  const { entries, written } = await run({ args: [], programsDir: dir, today: TODAY, fetchJson: api([sweep]) })
  const e = entries.find((x) => x.affitor_slug === "sweep")!
  assert.equal(e.action, "conflict")
  assert.match(e.reason, /marketplace slug now points at a different website: OA sweep.io, Affitor sweep.taqnik.in/)
  assert.deepEqual(written, [])
  assert.equal(readFileSync(join(dir, "sweep.yaml"), "utf8"), linked)
})

test("a listing missing from the list is paused only when its detail says the program is gone", async () => {
  const files = { "kyma-api.yaml": synced("kyma-api", "https://kymaapi.com"), "citegraph.yaml": synced("citegraph", "https://www.citegraph.app") }
  const list = [row("kyma-api", { name: "Kyma API", link_webpage: "https://kymaapi.com" })]
  const cite = row("citegraph", { name: "CiteGraph", link_webpage: "https://www.citegraph.app" })

  // The list lost citegraph, but its detail still answers: never a pause.
  const dir = dirWith(files)
  const still = await run({ args: [], programsDir: dir, today: TODAY, fetchJson: api(list, { details: { citegraph: { success: true, data: cite } } }) })
  const kept = still.entries.find((e) => e.oa_slug === "citegraph")!
  assert.equal(kept.action, "skip")
  assert.match(kept.reason, /detail still answers; not paused/)
  assert.equal(readFileSync(join(dir, "citegraph.yaml"), "utf8"), files["citegraph.yaml"])

  // The detail answers the measured not-found shape: paused.
  const gone = await run({ args: [], programsDir: dirWith(files), today: TODAY, fetchJson: api(list) })
  assert.equal(gone.entries.find((e) => e.oa_slug === "citegraph")?.action, "pause")

  // Any other answer, or none, stops the run with nothing written.
  for (const detail of [{ success: false }, { success: false, data: {} }, { message: "Bad gateway" }]) {
    const d = dirWith(files)
    await assert.rejects(run({ args: [], programsDir: d, today: TODAY, fetchJson: api(list, { details: { citegraph: detail } }) }), /citegraph/)
    assert.deepEqual(snapshot(d), files)
  }
  const down: FetchJson = async (url) => {
    if (url.endsWith("/citegraph")) throw new Error("https://api.affitor.com answered 502")
    return api(list)(url)
  }
  const d = dirWith(files)
  await assert.rejects(run({ args: [], programsDir: d, today: TODAY, fetchJson: down }), /502/)
  assert.deepEqual(snapshot(d), files)
})

test("every value written is checked against the schema", () => {
  const ok: Edit[] = [
    [["cookie_days"], 90],
    [["network"], "affitor"],
    [["commission", "duration"], null],
    [["short_description"], "x".repeat(100)],
    [["slug"], "citegraph"],
  ]
  assert.doesNotThrow(() => checkSchema(ok, "x.yaml"))
  assert.throws(() => checkSchema([[["cookie_days"], 1.5]], "x.yaml"), /cookie_days is 1.5, not integer/)
  assert.throws(() => checkSchema([[["cookie_days"], -1]], "x.yaml"), /below 0/)
  assert.throws(() => checkSchema([[["network"], "nope"]], "x.yaml"), /not one of the schema's values/)
  assert.throws(() => checkSchema([[["short_description"], "x".repeat(101)]], "x.yaml"), /longer than 100/)
  assert.throws(() => checkSchema([[["slug"], "Not A Slug"]], "x.yaml"), /pattern/)
  assert.throws(() => checkSchema([[["verified"], "true"]], "x.yaml"), /not boolean/)
  assert.throws(() => checkSchema([[["nonsense"], 1]], "x.yaml"), /not in the schema/)
})

test("an OA listing matched by two Affitor programs is taken over once; the second is a conflict", async () => {
  const acme = synced("acme", "https://acme.com").replace("affitor.com/marketplace/acme", "affitor.com/join/acme")
  const dir = dirWith({ "acme.yaml": acme })
  const rows = [
    row("acme-one", { name: "Acme One", link_webpage: "https://acme.com" }),
    row("acme-two", { name: "Acme Two", link_webpage: "https://www.acme.com/" }),
  ]
  const { entries } = await run({ args: ["--dry-run"], programsDir: dir, today: TODAY, fetchJson: api(rows) })
  assert.equal(entries.find((e) => e.affitor_slug === "acme-one")?.action, "take-over")
  const second = entries.find((e) => e.affitor_slug === "acme-two")!
  assert.equal(second.action, "conflict")
  assert.match(second.reason, /already matched by Affitor program acme-one/)
})

test("a detail that failed, is malformed, or names another program stops the run", async () => {
  for (const detail of [
    { success: false, data: ROWS[0] },
    { data: ROWS[0] },
    { success: true, data: null },
    { success: true, data: [ROWS[0]] },
    { success: true, data: { ...ROWS[0], slug: "someone-else" } },
  ]) {
    const dir = registry()
    const before = snapshot(dir)
    const fetchJson = api(ROWS, { details: { "kyma-api": detail } })
    await assert.rejects(run({ args: [], programsDir: dir, today: TODAY, fetchJson }), /detail for kyma-api/)
    assert.deepEqual(snapshot(dir), before)
  }
})

test("terms come from the detail; where the list disagrees it is reported, not used", async () => {
  const dir = registry()
  const kymaDetail = {
    ...ROWS[0],
    default_policy: { commission_type: "cps_one_time", commission_rate: 5, duration_months: 0 },
    cookie_window_days: 7,
  }
  // The list says citegraph pays nothing; its detail says 10%.
  const list = ROWS.map((r) =>
    r.slug === "citegraph" ? { ...r, default_policy: { commission_type: "cps_recurring", commission_rate: 0, duration_months: 12 } } : r,
  )
  const citeDetail = { ...ROWS[2], default_policy: { commission_type: "cps_recurring", commission_rate: 10, duration_months: 12 } }
  const fetchJson = api(list, {
    details: { "kyma-api": { success: true, data: kymaDetail }, citegraph: { success: true, data: citeDetail } },
  })
  const { entries } = await run({ args: [], programsDir: dir, today: TODAY, fetchJson })

  const k = parse(readFileSync(join(dir, "kyma-api.yaml"), "utf8"))
  assert.deepEqual([k.commission.rate, k.commission.type, k.commission.duration, k.cookie_days], ["5%", "one-time", null, 7])
  assert.deepEqual(
    entries.find((e) => e.oa_slug === "kyma-api")?.list_vs_detail?.map((d) => d.field),
    ["commission_type", "commission_rate", "duration_months", "cookie_window_days"],
  )
  const cite = entries.find((e) => e.oa_slug === "citegraph")!
  assert.equal(cite.action, "create")
  assert.equal(parse(readFileSync(join(dir, "citegraph.yaml"), "utf8")).commission.rate, "10%")
  assert.deepEqual(cite.list_vs_detail, [{ field: "commission_rate", list: 0, detail: 10 }])
})

test("a listing with YAML anchors or aliases is never edited", async () => {
  const anchored = KYMA.replace("url: https://kymaapi.com", "url: &site https://kymaapi.com").replace(
    "network: in-house",
    "network: in-house\ndashboard_url: *site",
  )
  const dir = dirWith({ "kyma-api.yaml": anchored })
  const { entries, written } = await run({ args: [], programsDir: dir, today: TODAY, fetchJson: api([ROWS[0]]) })
  const kyma = entries.find((e) => e.oa_slug === "kyma-api")!
  assert.equal(kyma.action, "conflict")
  assert.match(kyma.reason, /yaml anchors present/)
  assert.deepEqual(written, [])
  assert.equal(readFileSync(join(dir, "kyma-api.yaml"), "utf8"), anchored)
})

test("a rendered file that does not read back as intended stops the run", () => {
  assert.doesNotThrow(() => checkReadBack("network: affitor\n", [[["network"], "affitor"]], "x.yaml"))
  assert.throws(() => checkReadBack("network: in-house\n", [[["network"], "affitor"]], "x.yaml"), /network reads back as "in-house"/)
  assert.throws(() => checkReadBack("network: [unclosed\n", [[["network"], "affitor"]], "x.yaml"), /does not parse/)
})
