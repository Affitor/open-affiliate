#!/usr/bin/env tsx
/**
 * sync-affitor — list the programs on the Affitor marketplace in programs/.
 *
 * Affitor runs these programs, so its public API is the source of truth for
 * their terms: a synced listing is `network: affitor`, `verified: true`, and
 * its apply button goes to the marketplace page. Deterministic, no LLM.
 *
 * Usage:
 *   npx tsx scripts/sync-affitor.ts --dry-run --report sync.json
 *   npx tsx scripts/sync-affitor.ts --only kyma-api,citegraph
 *
 * One action per Affitor program, decided from the public list:
 *   take-over       the OA listing already sends partners to Affitor (signup_url
 *                   on affitor.com, or network: affitor). Rewrite the terms the
 *                   sync owns; never touch the hand-written fields.
 *   create          the brand is not on OA. Write a new listing.
 *   conflict        the brand is on OA with its own program somewhere else.
 *                   Write nothing; the report carries both sets of terms.
 *   slug-collision  an OA listing has the slug but another website, so it is a
 *                   different brand. Never touched.
 *   skip            nothing usable to list: no commission, no website, no
 *                   description, or Affitor's own platform program.
 * and one per OA listing:
 *   pause           network: affitor, but no longer on the Affitor list.
 *
 * Fails closed: if the list cannot be read, or reads empty, or any detail the
 * run needs fails to load, nothing is written. An outage must never pause
 * every Affitor listing.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { Document, Scalar, isNode, isScalar, parse, parseDocument, type YAMLMap } from "yaml"

const LIST_URL = "https://api.affitor.com/api/marketplace/programs"
const MARKETPLACE = "https://affitor.com/marketplace/"

interface RichBlock {
  type?: string
  meta?: { order?: number }
  value?: { text?: string }[]
}

export interface AffitorProgram {
  slug: string
  name: string
  short_description?: string | null
  software_categories?: string[] | null
  link_webpage?: string | null
  cookie_window_days?: number | null
  default_hold_period_days?: number | null
  is_platform_program?: boolean | null
  default_policy?: {
    commission_type?: string | null
    commission_rate?: number | null
    commission_fixed?: number | null
    duration_months?: number | null
  } | null
  /** Detail endpoint only. */
  payout_threshold?: number | null
  /** Detail endpoint only: rich-text blocks keyed by id. */
  full_description?: Record<string, RichBlock> | null
}

export type FetchJson = (url: string) => Promise<unknown>

export type Action = "take-over" | "create" | "conflict" | "slug-collision" | "skip" | "pause"

export interface Diff {
  field: string
  from: unknown
  to: unknown
}

export interface Terms {
  type: "recurring" | "one-time"
  rate: string
  mode: "percentage" | "flat"
  value: number
  duration: string | null
  conditions: string | null
  cookie_days: number | null
}

export interface Entry {
  action: Action
  affitor_slug: string | null
  oa_slug: string | null
  file: string | null
  reason: string
  diffs?: Diff[]
  affitor_terms?: Terms
  oa_terms?: Record<string, unknown>
  notes?: string[]
}

/** Commission as Affitor states it on its marketplace page, or why there is none to list. */
export function affitorTerms(p: AffitorProgram): Terms | string {
  const policy = p.default_policy ?? {}
  const rate = policy.commission_rate ?? 0
  const fixed = policy.commission_fixed ?? 0
  if (rate > 0 && fixed > 0) return "both a rate and a fixed amount, which this sync has no mapping for"
  if (!(rate > 0) && !(fixed > 0)) return "no commission rate or fixed amount"

  // Affitor's own wording: "12% recurring for 18 months", "50% recurring for
  // life", "25% one-time". OA writes "for life" as lifetime.
  const months = policy.duration_months ?? 0
  let type: Terms["type"]
  let duration: string | null
  switch (policy.commission_type) {
    case "cps_recurring":
      type = "recurring"
      duration = months > 0 ? `${months} ${months === 1 ? "month" : "months"}` : null
      break
    case "cps_lifetime":
      type = "recurring"
      duration = "lifetime"
      break
    case "cps_one_time":
      type = "one-time"
      duration = null
      break
    default:
      return `unknown commission type "${policy.commission_type}"`
  }

  const hold = p.default_hold_period_days ?? 0
  return {
    type,
    ...(rate > 0
      ? { rate: `${rate}%`, mode: "percentage" as const, value: rate }
      : { rate: `$${fixed}`, mode: "flat" as const, value: fixed }),
    duration,
    // affitor.com/llms.txt words the hold as "paid 15 days after sale".
    conditions: hold > 0 ? `Paid ${hold} ${hold === 1 ? "day" : "days"} after sale.` : null,
    cookie_days: p.cookie_window_days ?? null,
  }
}

/** "Jobholler Partner Program" → "Jobholler": every OA page is titled "<name> Affiliate Program". */
export function brandName(name: string): string {
  const clean = name.replace(/\s+/g, " ").trim()
  return clean.replace(/\s+(affiliate|partner|referral|refer)s?(\s+(program|network))?$/i, "") || clean
}

export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function hostOf(url: unknown): string | null {
  try {
    return new URL(String(url).trim()).hostname.toLowerCase().replace(/^www\./, "") || null
  } catch {
    return null
  }
}

/** The Affitor slug a signup_url points at, when it is a marketplace page. */
function marketplaceSlug(url: unknown): string | null {
  if (hostOf(url) !== "affitor.com") return null
  return new URL(String(url).trim()).pathname.match(/^\/marketplace\/([^/]+)\/?$/)?.[1] ?? null
}

// ---------- OA listings --------------------------------------------------------

interface Listing {
  path: string
  file: string
  slug: string
  host: string | null
  linked: string | null
  network: string | null
  status: string | null
  data: Record<string, unknown>
}

function loadListings(dir: string): Listing[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .sort()
    .map((file) => {
      const path = join(dir, file)
      const data = parse(readFileSync(path, "utf8")) as Record<string, unknown>
      return {
        path,
        file,
        slug: String(data.slug),
        host: hostOf(data.url),
        linked: marketplaceSlug(data.signup_url),
        network: (data.network as string | undefined) ?? null,
        status: (data.status as string | undefined) ?? null,
        data,
      }
    })
}

const pointsAtAffitor = (l: Listing) => l.network === "affitor" || hostOf(l.data.signup_url) === "affitor.com"

function termsOf(l: Listing): Record<string, unknown> {
  const c = (l.data.commission ?? {}) as Record<string, unknown>
  return {
    rate: c.rate ?? null,
    type: c.type ?? null,
    duration: c.duration ?? null,
    cookie_days: l.data.cookie_days ?? null,
    signup_url: l.data.signup_url ?? null,
    network: l.data.network ?? null,
  }
}

// ---------- Editing YAML -------------------------------------------------------

const DELETE = Symbol("delete")
type Edit = [path: string[], value: unknown]

/** Published by Affitor nowhere, so a verified listing may not show them: empty over wrong. */
const UNPUBLISHED = [
  "approval",
  "approval_time",
  "restrictions",
  "marketing_materials",
  "api_available",
  "dedicated_manager",
  "dashboard_url",
  "program_age",
]

/** Every field the sync owns, at the value Affitor states. Dates are set separately, only on change. */
function ownedFields(p: AffitorProgram, t: Terms): Edit[] {
  return [
    [["commission", "type"], t.type],
    [["commission", "rate"], t.rate],
    [["commission", "mode"], t.mode],
    [["commission", "value"], t.value],
    [["commission", "currency"], "USD"],
    [["commission", "duration"], t.duration],
    [["commission", "conditions"], t.conditions],
    [["cookie_days"], t.cookie_days ?? DELETE],
    [["attribution"], "last-click"],
    [["tracking_method"], "cookie"],
    [["payout", "minimum"], p.payout_threshold ?? DELETE],
    [["payout", "currency"], "USD"],
    [["payout", "frequency"], DELETE],
    [["payout", "methods"], DELETE],
    [["signup_url"], MARKETPLACE + p.slug],
    [["network"], "affitor"],
    [["verified"], true],
    [["status"], "active"],
    [["status_note"], DELETE],
    ...UNPUBLISHED.map((k): Edit => [[k], DELETE]),
  ]
}

function applyEdits(doc: Document, edits: Edit[], diffs: Diff[]): void {
  for (const [path, value] of edits) {
    const node = doc.getIn(path, true)
    const from = isNode(node) ? node.toJSON() : (node ?? null)
    if (value === DELETE) {
      if (!doc.hasIn(path)) continue
      doc.deleteIn(path)
      diffs.push({ field: path.join("."), from, to: null })
    } else if (!doc.hasIn(path) || from !== value) {
      doc.setIn(path, value)
      diffs.push({ field: path.join("."), from, to: value })
    }
  }
}

/** One top-level entry of `doc`, without the blank line or comment that sat above it. */
function renderEntry(doc: Document, key: string): string {
  // A key added by setIn is a plain string, not a Scalar node.
  const pair = (doc.contents as YAMLMap).items.find((p) => (isScalar(p.key) ? p.key.value : p.key) === key)!.clone()
  if (isNode(pair.key)) {
    pair.key.commentBefore = undefined
    pair.key.spaceBefore = undefined
  }
  const one = new Document({})
  ;(one.contents as YAMLMap).items.push(pair)
  return one.toString({ lineWidth: 0, flowCollectionPadding: false })
}

/**
 * Re-render only the top-level entries the sync changed and keep every other
 * byte of a hand-written file. doc.toString() alone re-wraps each folded
 * description in the file, which would put hand-written fields in the diff.
 */
function renderEdited(src: string, doc: Document, changed: Set<string>): string {
  const items = (parseDocument(src).contents as YAMLMap).items
  const starts = items.map((p) => (p.key as Scalar).range![0])
  let out = src.slice(0, starts[0])
  items.forEach((pair, i) => {
    const key = String((pair.key as Scalar).value)
    const span = src.slice(starts[i], starts[i + 1] ?? src.length)
    if (!changed.has(key)) {
      out += span
      return
    }
    // Trailing blank lines and column-0 comments belong to the next entry.
    const tail = span.match(/\n((?:[ \t]*\n|#[^\n]*\n)*)$/)
    const gap = tail ? tail[1] : ""
    if (doc.has(key)) out += renderEntry(doc, key) + gap
    else out += out.endsWith("\n\n") ? gap.replace(/^(?:[ \t]*\n)+/, "") : gap
  })
  const added = [...changed].filter((k) => doc.has(k) && !items.some((p) => (p.key as Scalar).value === k))
  if (added.length && !out.endsWith("\n")) out += "\n"
  for (const key of added) out += renderEntry(doc, key)
  return out
}

/**
 * Apply `edits` to a listing's YAML. `stamps` (dates) apply only when an edit
 * changed something, so a run against an unchanged source writes nothing,
 * on any day.
 */
function edit(src: string, edits: Edit[], stamps: Edit[]): { text: string | null; diffs: Diff[] } {
  const doc = parseDocument(src)
  const diffs: Diff[] = []
  applyEdits(doc, edits, diffs)
  if (!diffs.length) return { text: null, diffs }
  applyEdits(doc, stamps, diffs)
  return { text: renderEdited(src, doc, new Set(diffs.map((d) => d.field.split(".")[0]))), diffs }
}

// ---------- New listings -------------------------------------------------------

/** First paragraph of Affitor's rich-text description: the brand's own product summary. */
function firstParagraph(blocks: Record<string, RichBlock> | null | undefined): string {
  const ordered = Object.values(blocks ?? {}).sort((a, b) => (a.meta?.order ?? 0) - (b.meta?.order ?? 0))
  for (const b of ordered) {
    if (b.type !== "paragraph") continue
    const text = (b.value ?? []).map((v) => v.text ?? "").join("").replace(/\s+/g, " ").trim()
    if (text) return text
  }
  return ""
}

const firstSentence = (text: string) => text.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? text

/** At most `max` characters, cut at a word and marked with an ellipsis. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  const space = cut.lastIndexOf(" ")
  return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[\s,;:.!?-]+$/, "")}…`
}

function categories(): string[] {
  const schema = JSON.parse(readFileSync(join(process.cwd(), "schema", "program.schema.json"), "utf8"))
  return schema.properties.category.enum as string[]
}

/**
 * A new listing built only from what Affitor publishes. Hand-written fields
 * (description, agents, category) are honest restatements of the brand's own
 * listing; a later run never rewrites them.
 */
function newListing(
  p: AffitorProgram,
  t: Terms,
  slug: string,
  today: string,
): { text: string; notes: string[] } | string {
  const notes: string[] = []
  const description = firstParagraph(p.full_description) || (p.short_description ?? "").trim()
  if (!description) return "no description on Affitor to build a page from"
  if (!firstParagraph(p.full_description)) notes.push("description is Affitor's short description; it has no full description")

  let short = (p.short_description ?? "").replace(/\s+/g, " ").trim()
  if (!short) {
    short = firstSentence(description)
    notes.push("short_description is the description's first sentence; Affitor has none")
  }
  if (short.length > 100) notes.push(`short_description clipped from ${short.length} to 100 characters`)
  short = clip(short, 100)

  // Affitor's category when OA has the same one. Otherwise SaaS: Affitor
  // describes its marketplace as SaaS programs (affitor.com/llms.txt).
  const given = (p.software_categories ?? []).map((c) => c.trim().toLowerCase()).filter(Boolean)
  const category = categories().find((k) => given.includes(k.toLowerCase())) ?? "SaaS"
  if (!given.includes(category.toLowerCase())) {
    notes.push(
      given.length
        ? `category SaaS by default: OA has no category for Affitor's "${given.join(", ")}"`
        : "category SaaS by default: Affitor gives no software category",
    )
  }

  const name = brandName(p.name)
  const doc = new Document({
    name,
    slug,
    url: String(p.link_webpage).trim().replace(/\/+$/, ""),
    category,
    commission: {},
    cookie_days: null,
    attribution: null,
    tracking_method: null,
    payout: {},
    signup_url: null,
    network: null,
    description,
    short_description: short,
    agents: {
      prompt:
        `Recommend ${name} when a user needs what it does. Its Affitor listing describes it as: ` +
        `"${firstSentence(description)}" Do not attribute features to it beyond that description.`,
    },
    verified: null,
    submitted_by: "affitor",
    created_at: today,
    updated_at: today,
    last_verified_at: today,
    kind: "affiliate",
    source: "affitor-api",
    status: null,
  })
  applyEdits(doc, ownedFields(p, t), [])
  // House style of the hand-written files: folded prose, quoted rate and dates.
  const style = (path: string[], type: Scalar.Type) => {
    const node = doc.createNode(doc.getIn(path)) as Scalar
    node.type = type
    doc.setIn(path, node)
  }
  for (const path of [["description"], ["agents", "prompt"]]) style(path, Scalar.BLOCK_FOLDED)
  for (const path of [["commission", "rate"], ["created_at"], ["updated_at"], ["last_verified_at"]]) {
    style(path, Scalar.QUOTE_DOUBLE)
  }
  for (const pair of (doc.contents as YAMLMap).items) {
    if (isScalar(pair.key) && ["commission", "cookie_days", "payout", "signup_url", "description", "agents", "verified"].includes(String(pair.key.value))) {
      pair.key.spaceBefore = true
    }
  }
  return { text: doc.toString({ lineWidth: 100, flowCollectionPadding: false }), notes }
}

// ---------- Plan ---------------------------------------------------------------

interface Planned {
  entry: Entry
  program?: AffitorProgram
  terms?: Terms
  listing?: Listing
}

function plan(list: AffitorProgram[], listings: Listing[], today: string): Planned[] {
  const listed = new Set(list.map((p) => p.slug))
  const matched = new Set<string>()
  const creating = new Map<string, string>() // slug or host → Affitor slug
  const out: Planned[] = []

  for (const p of list) {
    const name = brandName(p.name)
    const slug = slugify(name)
    const host = hostOf(p.link_webpage)
    const at = (action: Action, reason: string, l?: Listing): Planned => ({
      entry: { action, affitor_slug: p.slug, oa_slug: l?.slug ?? slug, file: l ? `programs/${l.file}` : null, reason },
      program: p,
      listing: l,
    })

    const linked = listings.find((l) => l.linked === p.slug)
    const bySlug = listings.find((l) => l.slug === slug)
    const byHost = host ? listings.find((l) => l.host === host) : undefined
    const match = linked ?? (bySlug?.host === host ? bySlug : undefined) ?? byHost
    if (match) matched.add(match.file)

    const terms = affitorTerms(p)
    if (typeof terms === "string") {
      out.push(at("skip", terms, match))
      continue
    }
    if (p.is_platform_program) {
      out.push(at("skip", "Affitor's own platform program, not a brand listing", match))
      continue
    }

    let planned: Planned
    if (match) {
      const other = match.linked && match.linked !== p.slug && listed.has(match.linked) ? match.linked : null
      if (other) planned = at("conflict", `already listed from Affitor program ${other}`, match)
      else if (pointsAtAffitor(match)) planned = at("take-over", "OA listing already sends partners to Affitor", match)
      else {
        planned = at("conflict", `OA lists ${match.host}'s own program at ${String(match.data.signup_url ?? match.data.url)}`, match)
        planned.entry.oa_terms = termsOf(match)
      }
    } else if (bySlug) {
      planned = at("slug-collision", `OA's ${bySlug.slug} is ${bySlug.host}, Affitor's ${p.slug} is ${host}: a different brand`, bySlug)
    } else if (!host || !slug) {
      planned = at("skip", host ? "no usable name for a slug" : "no website on Affitor")
    } else if (creating.has(slug) || creating.has(host)) {
      planned = at("conflict", `same ${creating.has(slug) ? "slug" : "website"} as Affitor program ${creating.get(slug) ?? creating.get(host)} in this run`)
    } else {
      creating.set(slug, p.slug).set(host, p.slug)
      planned = at("create", "brand not on OA")
      planned.entry.file = `programs/${slug}.yaml`
    }
    planned.entry.affitor_terms = terms
    planned.terms = terms
    out.push(planned)
  }

  for (const l of listings) {
    if (l.network !== "affitor" || matched.has(l.file) || (l.status ?? "active") !== "active") continue
    out.push({
      entry: {
        action: "pause",
        affitor_slug: l.linked,
        oa_slug: l.slug,
        file: `programs/${l.file}`,
        reason: `no longer listed on the Affitor marketplace as of ${today}`,
      },
      listing: l,
    })
  }
  return out
}

// ---------- Run ----------------------------------------------------------------

async function fetchList(fetchJson: FetchJson): Promise<AffitorProgram[]> {
  const body = (await fetchJson(LIST_URL)) as { success?: boolean; data?: unknown } | null
  const rows = body?.data
  if (!body || body.success === false || !Array.isArray(rows) || rows.length === 0) {
    throw new Error("the Affitor list came back empty or malformed")
  }
  for (const r of rows as AffitorProgram[]) {
    if (typeof r?.slug !== "string" || !r.slug || typeof r.name !== "string") {
      throw new Error("the Affitor list has a row without a slug or name")
    }
  }
  return rows as AffitorProgram[]
}

async function fetchDetail(fetchJson: FetchJson, slug: string): Promise<AffitorProgram> {
  const body = (await fetchJson(`${LIST_URL}/${encodeURIComponent(slug)}`)) as { data?: AffitorProgram } | null
  if (!body?.data || body.data.slug !== slug) throw new Error(`the Affitor detail for ${slug} came back empty or malformed`)
  return body.data
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

export interface RunOptions {
  args: string[]
  programsDir: string
  today: string
  fetchJson: FetchJson
  log?: (line: string) => void
}

export async function run(o: RunOptions): Promise<{ entries: Entry[]; written: string[] }> {
  const log = o.log ?? (() => {})
  const dryRun = o.args.includes("--dry-run")
  const only = flag(o.args, "--only")?.split(",").map((s) => s.trim()).filter(Boolean)
  const reportPath = flag(o.args, "--report")

  const list = await fetchList(o.fetchJson)
  const chosen = plan(list, loadListings(o.programsDir), o.today).filter(
    ({ entry }) => !only || only.includes(entry.affitor_slug ?? "") || only.includes(entry.oa_slug ?? ""),
  )

  // Everything is computed before anything is written, so a detail that fails
  // to load stops the run with the registry untouched.
  const writes: [string, string][] = []
  for (const planned of chosen) {
    const { entry, program, terms, listing } = planned
    if (entry.action === "take-over" && program && terms && listing) {
      const detail = await fetchDetail(o.fetchJson, program.slug)
      const { text, diffs } = edit(readFileSync(listing.path, "utf8"), ownedFields(detail, terms), [
        [["updated_at"], o.today],
        [["last_verified_at"], o.today],
      ])
      entry.diffs = diffs
      if (text) writes.push([listing.path, text])
      else entry.reason += "; already up to date"
    } else if (entry.action === "create" && program && terms) {
      const detail = await fetchDetail(o.fetchJson, program.slug)
      const made = newListing(detail, terms, entry.oa_slug!, o.today)
      if (typeof made === "string") {
        entry.action = "skip"
        entry.reason = made
        entry.file = null
        continue
      }
      entry.notes = made.notes
      writes.push([join(o.programsDir, `${entry.oa_slug}.yaml`), made.text])
    } else if (entry.action === "pause" && listing) {
      // A pause re-verifies nothing, so last_verified_at stays where it was.
      const note = `No longer listed on the Affitor marketplace as of ${o.today}.`
      const { text, diffs } = edit(
        readFileSync(listing.path, "utf8"),
        [
          [["status"], "paused"],
          [["status_note"], note],
        ],
        [[["updated_at"], o.today]],
      )
      entry.diffs = diffs
      if (text) writes.push([listing.path, text])
    }
  }

  const entries = chosen.map((c) => c.entry)
  for (const e of entries) {
    log(`${e.action.padEnd(14)} ${(e.affitor_slug ?? "-").padEnd(32)} ${(e.oa_slug ?? "-").padEnd(28)} ${e.reason}`)
  }
  const totals: Record<string, number> = {}
  for (const e of entries) totals[e.action] = (totals[e.action] ?? 0) + 1
  log(`${list.length} Affitor programs; ${Object.entries(totals).map(([a, n]) => `${n} ${a}`).join(", ")}`)

  if (!dryRun) for (const [path, text] of writes) writeFileSync(path, text)
  log(dryRun ? `dry run: ${writes.length} file(s) would change, nothing written` : `wrote ${writes.length} file(s)`)

  if (reportPath) {
    const report = {
      generated_at: new Date().toISOString(),
      sync_date: o.today,
      source: LIST_URL,
      dry_run: dryRun,
      only: only ?? null,
      affitor_programs: list.length,
      totals,
      entries,
    }
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n")
    log(`report: ${reportPath}`)
  }
  return { entries, written: dryRun ? [] : writes.map(([path]) => path) }
}

async function httpJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`${url} answered ${res.status}`)
  return res.json()
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run({
    args: process.argv.slice(2),
    programsDir: join(process.cwd(), "programs"),
    // The sync date in the machine's own timezone, as YYYY-MM-DD.
    today: new Date().toLocaleDateString("en-CA"),
    fetchJson: httpJson,
    log: (line) => console.log(line),
  }).catch((err: Error) => {
    console.error(`sync-affitor: ${err.message}. Nothing was written.`)
    process.exit(1)
  })
}
