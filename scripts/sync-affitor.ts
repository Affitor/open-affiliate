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
 * The public list is discovery; every term comes from each program's detail.
 * One action per Affitor program:
 *   take-over       the OA listing already sends partners to Affitor (signup_url
 *                   on affitor.com, or network: affitor). Rewrite the terms the
 *                   sync owns; never touch the hand-written fields.
 *   also-on         the OA listing is the brand's own program, and a person
 *                   linked it to this Affitor program under also_on.affitor.
 *                   Rewrite only also_on.affitor.commission (left out when
 *                   Affitor publishes none); the page shows it as one "Also on
 *                   Affitor" line. The sync never adds the link itself.
 *   create          the brand is not on OA. Write a new listing.
 *   conflict        the brand is on OA with its own program somewhere else, the
 *                   marketplace slug now points at another website, the
 *                   listing is linked to another Affitor program (listed or
 *                   gone: a listing is never re-linked), or it cannot be
 *                   edited safely. Write nothing; the report carries both
 *                   sets of terms.
 *   slug-collision  an OA listing has the slug but another website, so it is a
 *                   different brand. Never touched.
 * Every match needs the same website (siteOf): a slug, a name or a shared host
 * alone never identifies a brand.
 *   skip            nothing usable to list: no commission, a malformed number,
 *                   no website, no description, or Affitor's own program. Or
 *                   the brand is on data/affitor-sync-skip.json, which a person
 *                   keeps: checked first, and such a brand is never written,
 *                   taken over or paused.
 * and one per OA listing:
 *   pause           network: affitor, gone from the list, and its detail
 *                   answers that the program does not exist.
 *   unlink          the same evidence for the program an also_on.affitor entry
 *                   links to: the entry is removed. Counts as a pause.
 *
 * Fails closed: if the list or a detail is malformed, looks like one page of
 * several, gives no clear answer on a program that left, or a run would pause
 * more than MAX_PAUSES listings, nothing is written. An outage must never
 * pause every Affitor listing.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { Document, Scalar, isAlias, isNode, isScalar, parseDocument, visit, type YAMLMap } from "yaml"
// Shared with the affitor-sync lane of .github/scripts/auto-merge-policy.cjs,
// which re-checks a sync pull request against the same API before merging it.
import config from "./sync-affitor.config.json"
// Brands a person decided the sync must never list, by OA or Affitor slug,
// with the reason. Read by the merge lane too.
import skipList from "../data/affitor-sync-skip.json"

const LIST_URL = config.list_url
/**
 * What Affitor's own terms and payout docs say for every program on the
 * network; each marketplace listing links both. `source` in the config names
 * the pages and the date they were read. Change them there, never in a YAML.
 */
const NETWORK = config.network_terms
const MARKETPLACE = config.marketplace
const SKIP_FILE = "data/affitor-sync-skip.json"

/**
 * A second guard behind the per-program evidence a pause needs: more
 * confirmed departures than this in one run is unusual enough that the run
 * stops and a person reads the report. Pausing more on purpose means
 * running with --only, a few at a time. The merge lane holds a pull request
 * to the same limit.
 */
export const MAX_PAUSES: number = config.max_pauses

/**
 * Hosting and link-in-bio services. Many brands share one of these hosts, so
 * a host match there says nothing about the brand: programs on them match by
 * slug only. Includes subdomains (brand.vercel.app).
 */
const SHARED_HOSTS = [
  "linktr.ee",
  "github.io",
  "notion.site",
  "vercel.app",
  "netlify.app",
  "pages.dev",
  "substack.com",
  "medium.com",
  "carrd.co",
  "framer.website",
  "webflow.io",
  "wixsite.com",
  "bio.link",
  "beacons.ai",
]

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

export type Action = "take-over" | "also-on" | "create" | "conflict" | "slug-collision" | "skip" | "pause" | "unlink"

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
  /** Term fields where the list and the detail disagree. The detail wins. */
  list_vs_detail?: { field: string; list: unknown; detail: unknown }[]
  notes?: string[]
}

const WHOLE = new Set(["duration_months", "cookie_window_days", "default_hold_period_days"])

/** affitorTerms' reason when Affitor publishes no commission at all, as opposed to a malformed one. */
export const NO_COMMISSION = "no commission rate or fixed amount"

/** The API fields terms are built from, by name, for validation and comparison. */
function termFields(p: AffitorProgram): Record<string, unknown> {
  const policy = p.default_policy ?? {}
  return {
    commission_type: policy.commission_type,
    commission_rate: policy.commission_rate,
    commission_fixed: policy.commission_fixed,
    duration_months: policy.duration_months,
    cookie_window_days: p.cookie_window_days,
    default_hold_period_days: p.default_hold_period_days,
    payout_threshold: p.payout_threshold,
  }
}

/** Commission as Affitor states it on its marketplace page, or why there is none to list. */
export function affitorTerms(p: AffitorProgram): Terms | string {
  // Numbers must arrive as numbers. "20" or a negative is not coerced: a
  // wrong figure on a verified page costs a partner real money. Days and
  // months are whole: the schema stores cookie_days as an integer.
  for (const [field, v] of Object.entries(termFields(p))) {
    if (field === "commission_type" || v == null) continue
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
      return `${field} is ${typeof v === "number" ? v : JSON.stringify(v)}, not a non-negative number`
    }
    if (WHOLE.has(field) && !Number.isInteger(v)) return `${field} is ${v}, not a whole number`
  }
  const policy = p.default_policy ?? {}
  const rate = policy.commission_rate ?? 0
  const fixed = policy.commission_fixed ?? 0
  if (rate > 0 && fixed > 0) return "both a rate and a fixed amount, which this sync has no mapping for"
  if (!(rate > 0) && !(fixed > 0)) return NO_COMMISSION

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
    conditions: affitorConditions(hold),
    cookie_days: p.cookie_window_days ?? null,
  }
}

/**
 * When a commission becomes withdrawable. default_hold_period_days is a hold
 * against refunds and chargebacks (Affitor's terms, "Hold Period"), not a
 * date the partner is paid: after it come brand funding, the $20 withdrawal
 * minimum and team review, which the network's payout docs state for every
 * program (config network_terms.payout_conditions).
 */
export function affitorConditions(hold: number): string {
  const held = hold > 0 ? `Commissions are held ${hold} ${hold === 1 ? "day" : "days"} after the sale for refunds and chargebacks. ` : ""
  return held + NETWORK.payout_conditions
}

/** "Jobholler Partner Program" → "Jobholler": every OA page is titled "<name> Affiliate Program". */
export function brandName(name: string): string {
  const clean = name.replace(/\s+/g, " ").trim()
  return clean.replace(/\s+(affiliate|partner|referral|refer)s?(\s+(program|network))?$/i, "") || clean
}

export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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

const sharedHost = (host: string | null) => !!host && SHARED_HOSTS.some((s) => host === s || host.endsWith(`.${s}`))

/**
 * A brand's website as an identity, or null when the URL names no brand.
 * Normally the host without www. On a shared host, the host plus the first
 * path segment, the tenant, in its own case (linktr.ee/alpha-store); with no
 * tenant there is no identity, since the bare host is the hosting service.
 * Hosts are compared exactly, not by registrable domain: without a public
 * suffix list a guessed one would make brand-a.herokuapp.com and
 * brand-b.herokuapp.com the same site. Every rule here can only err toward a
 * conflict or a create, never toward a take-over of another brand.
 */
function siteOf(url: unknown): string | null {
  const host = hostOf(url)
  if (!host || !sharedHost(host)) return host
  const tenant = new URL(String(url).trim()).pathname.split("/")[1]
  return tenant ? `${host}/${tenant}` : null
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
  /** siteOf(url): the brand identity matching compares on. */
  site: string | null
  linked: string | null
  /** The Affitor program also_on.affitor links the brand's own listing to. */
  alsoOn: string | null
  network: string | null
  status: string | null
  /** Anchors or aliases: deleting a field could orphan an alias, so the sync never edits these. */
  anchors: boolean
  data: Record<string, unknown>
}

function loadListings(dir: string): Listing[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .sort()
    .map((file) => {
      const path = join(dir, file)
      const doc = parseDocument(readFileSync(path, "utf8"))
      if (doc.errors.length) throw new Error(`programs/${file}: ${doc.errors[0].message}`)
      let anchors = false
      visit(doc, (_, node) => {
        if (isAlias(node) || (isNode(node) && node.anchor)) {
          anchors = true
          return visit.BREAK
        }
      })
      const data = doc.toJS() as Record<string, unknown>
      const alsoOn = data.also_on as { affitor?: { url?: unknown } } | undefined
      return {
        path,
        file,
        slug: String(data.slug),
        site: siteOf(data.url),
        linked: marketplaceSlug(data.signup_url),
        alsoOn: marketplaceSlug(alsoOn?.affitor?.url),
        network: (data.network as string | undefined) ?? null,
        status: (data.status as string | undefined) ?? null,
        anchors,
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

export const DELETE = Symbol("delete")
export type Edit = [path: string[], value: unknown]

/**
 * Published by Affitor nowhere, so a verified listing may not show them:
 * empty over wrong. Affitor states no attribution model: a window length
 * says nothing about first or last click. `approval` and `payout.frequency`
 * are not here and not owned: the data lane reads them from each listing's own wording ("Once X
 * approves you", "held 31 days after the sale"), and the sync leaves them.
 */
const UNPUBLISHED = [
  "attribution",
  "approval_time",
  "marketing_materials",
  "api_available",
  "dedicated_manager",
  "dashboard_url",
  "program_age",
]

/**
 * Affitor's prohibited activities apply on every program, after any the
 * brand adds, which the data lane writes from the brand's own terms: the
 * brand's items keep their order, the network's follow, each once.
 */
export function networkRestrictions(current: unknown): unknown[] {
  const own = Array.isArray(current) ? current.filter((r) => !NETWORK.restrictions.includes(r)) : []
  return [...own, ...NETWORK.restrictions]
}

/**
 * Every field the sync owns, at the value Affitor states; `restrictions` is
 * the listing's current list, which the network's items are added to. Dates
 * are set separately, only on change.
 */
function ownedFields(p: AffitorProgram, t: Terms, restrictions: unknown = null): Edit[] {
  return [
    [["commission", "type"], t.type],
    [["commission", "rate"], t.rate],
    [["commission", "mode"], t.mode],
    [["commission", "value"], t.value],
    [["commission", "currency"], "USD"],
    [["commission", "duration"], t.duration],
    [["commission", "conditions"], t.conditions],
    [["cookie_days"], t.cookie_days ?? DELETE],
    [["tracking_method"], "cookie"],
    [["payout", "minimum"], p.payout_threshold ?? DELETE],
    [["payout", "currency"], "USD"],
    [["payout", "methods"], NETWORK.payout_methods],
    [["signup_url"], MARKETPLACE + p.slug],
    [["network"], "affitor"],
    [["verified"], true],
    [["status"], "active"],
    [["status_note"], DELETE],
    [["restrictions"], networkRestrictions(restrictions)],
    ...UNPUBLISHED.map((k): Edit => [[k], DELETE]),
  ]
}

/**
 * Everything the sync owns on the brand's own listing: the commission under
 * also_on.affitor, at the value Affitor states, or left out when Affitor
 * publishes none, so the page says "Also on Affitor" with no figure. The url
 * is the person's link and is never written.
 */
function alsoOnFields(t: Terms | null): Edit[] {
  const at = (...keys: string[]) => ["also_on", "affitor", "commission", ...keys]
  if (!t) return [[at(), DELETE]]
  return [
    [at("type"), t.type],
    [at("rate"), t.rate],
    [at("mode"), t.mode],
    [at("value"), t.value],
    [at("currency"), "USD"],
    [at("duration"), t.duration],
    [at("conditions"), DELETE],
  ]
}

/** The value at `path`, a list as an array. */
function valueIn(doc: Document, path: string[]): unknown {
  const node = doc.getIn(path, true)
  return isNode(node) ? node.toJSON() : (node ?? null)
}

/** Scalars by identity; a list (methods, restrictions) by its items in order. */
const same = (a: unknown, b: unknown) => a === b || (Array.isArray(a) && Array.isArray(b) && JSON.stringify(a) === JSON.stringify(b))

function applyEdits(doc: Document, edits: Edit[], diffs: Diff[]): void {
  for (const [path, value] of edits) {
    const from = valueIn(doc, path)
    if (value === DELETE) {
      if (!doc.hasIn(path)) continue
      doc.deleteIn(path)
      diffs.push({ field: path.join("."), from, to: null })
    } else if (!doc.hasIn(path) || !same(from, value)) {
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
 * Parse a rendered file back and check every field the sync set reads as
 * intended. The splice in renderEdited is text surgery; this is its proof.
 */
export function checkReadBack(text: string, edits: Edit[], file: string): void {
  const doc = parseDocument(text)
  if (doc.errors.length) throw new Error(`${file}: rendered YAML does not parse (${doc.errors[0].message})`)
  for (const [path, value] of edits) {
    if (value === DELETE ? !doc.hasIn(path) : doc.hasIn(path) && same(valueIn(doc, path), value)) continue
    // A list reads back as its items: show them, not the node.
    const got = valueIn(doc, path)
    throw new Error(`${file}: ${path.join(".")} reads back as ${JSON.stringify(got)}, not as written`)
  }
}

interface SchemaRule {
  type?: string | string[]
  enum?: unknown[]
  minimum?: number
  maxLength?: number
  pattern?: string
  properties?: Record<string, SchemaRule>
  items?: SchemaRule
  $ref?: string
}

let schemaRoot: SchemaRule | undefined
const schema = (): SchemaRule =>
  (schemaRoot ??= JSON.parse(readFileSync(join(process.cwd(), "schema", "program.schema.json"), "utf8")))

/** A rule, or the top-level property its `$ref` names (also_on reuses commission). Any other ref finds nothing. */
const deref = (rule: SchemaRule | undefined): SchemaRule | undefined =>
  rule?.$ref?.startsWith("#/properties/") ? schema().properties?.[rule.$ref.slice("#/properties/".length)] : rule

const TYPES: Record<string, (v: unknown) => boolean> = {
  string: (v) => typeof v === "string",
  number: (v) => typeof v === "number" && Number.isFinite(v),
  integer: (v) => Number.isInteger(v),
  boolean: (v) => typeof v === "boolean",
  null: (v) => v === null,
  array: (v) => Array.isArray(v),
}

/**
 * Check every value the sync writes against schema/program.schema.json:
 * type, enum, minimum, maxLength and pattern, and for a list each item
 * against `items`. The repo's build validates only a few fields, so a wrong
 * type would otherwise reach a verified page.
 */
export function checkSchema(edits: Edit[], file: string): void {
  for (const [path, value] of edits) {
    if (value === DELETE) continue
    let rule: SchemaRule | undefined = schema()
    for (const key of path) rule = deref(rule?.properties?.[key])
    checkValue(rule, value, (why) => new Error(`${file}: ${path.join(".")} ${why}`))
  }
}

function checkValue(rule: SchemaRule | undefined, value: unknown, bad: (why: string) => Error): void {
  if (!rule) throw bad("is not in the schema")
  const types = rule.type === undefined ? [] : [rule.type].flat()
  if (types.length && !types.some((t) => TYPES[t]?.(value))) throw bad(`is ${JSON.stringify(value)}, not ${types.join(" or ")}`)
  if (Array.isArray(value)) {
    value.forEach((item, i) => checkValue(rule.items, item, (why) => bad(`[${i}] ${why}`)))
    return
  }
  if (rule.enum && !rule.enum.includes(value)) throw bad(`is ${JSON.stringify(value)}, not one of the schema's values`)
  if (typeof value === "number" && rule.minimum !== undefined && value < rule.minimum) throw bad(`is below ${rule.minimum}`)
  if (typeof value === "string" && rule.maxLength !== undefined && value.length > rule.maxLength) {
    throw bad(`is longer than ${rule.maxLength} characters`)
  }
  if (typeof value === "string" && rule.pattern && !new RegExp(rule.pattern).test(value)) throw bad("does not match the schema pattern")
}

/** Every scalar in a parsed listing, as [path, value]; lists are skipped. */
function leaves(value: unknown, path: string[] = []): Edit[] {
  if (Array.isArray(value)) return []
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([k, v]) => leaves(v, [...path, k]))
  }
  return [[path, value]]
}

/**
 * Apply `edits` to a listing's YAML. `stamps` (dates) apply only when an edit
 * changed something, so a run against an unchanged source writes nothing,
 * on any day.
 */
export function edit(src: string, edits: Edit[], stamps: Edit[], file: string): { text: string | null; diffs: Diff[] } {
  const doc = parseDocument(src)
  const diffs: Diff[] = []
  applyEdits(doc, edits, diffs)
  if (!diffs.length) return { text: null, diffs }
  checkSchema([...edits, ...stamps], file)
  applyEdits(doc, stamps, diffs)
  const text = renderEdited(src, doc, new Set(diffs.map((d) => d.field.split(".")[0])))
  checkReadBack(text, [...edits, ...stamps], file)
  return { text, diffs }
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

const categories = () => schema().properties!.category.enum as string[]

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
  /** Set for an Affitor program's entry; absent for an OA listing's (pause, unlink). */
  program?: AffitorProgram
  /** Null only on an also-on entry whose program publishes no commission. */
  terms?: Terms | null
  listing?: Listing
}

/** The skip list's slug among `slugs`, if any. */
const onSkipList = (skip: Record<string, string>, ...slugs: (string | null | undefined)[]) =>
  slugs.find((s): s is string => !!s && Object.hasOwn(skip, s))

function plan(list: AffitorProgram[], listings: Listing[], today: string, skip: Record<string, string>): Planned[] {
  const listed = new Set(list.map((p) => p.slug))
  const matched = new Set<string>()
  const claimed = new Map<string, string>() // OA file → Affitor slug taking it over
  const creating = new Map<string, string>() // slug or site → Affitor slug
  const out: Planned[] = []

  for (const p of list) {
    const name = brandName(p.name)
    const slug = slugify(name)
    const host = hostOf(p.link_webpage)
    const site = siteOf(p.link_webpage)
    const at = (action: Action, reason: string, l?: Listing): Planned => ({
      entry: { action, affitor_slug: p.slug, oa_slug: l?.slug ?? slug, file: l ? `programs/${l.file}` : null, reason },
      program: p,
      listing: l,
    })

    // Every branch needs the same website (siteOf), so neither a reused
    // marketplace slug nor a shared name can carry terms to another brand.
    // A listing links to an Affitor program through its signup_url or, for the
    // brand's own listing, through also_on.affitor.
    const linked = listings.find((l) => l.linked === p.slug || l.alsoOn === p.slug)
    const bySlug = listings.find((l) => l.slug === slug)
    const bySite = site ? listings.find((l) => l.site === site) : undefined
    const match = linked ?? (site && bySlug?.site === site ? bySlug : undefined) ?? bySite
    if (match) matched.add(match.file)
    const alsoOn = match?.alsoOn === p.slug

    // Before every other rule, and with no program attached: a skipped brand
    // has no detail fetched, nothing written and nothing paused.
    // match.linked, match.alsoOn: the Affitor program the matched listing is already linked to.
    const skipped = onSkipList(skip, p.slug, slug, match?.slug, match?.linked, match?.alsoOn)
    if (skipped) {
      out.push({ ...at("skip", `on the skip list (${SKIP_FILE}): ${skip[skipped]}`, match), program: undefined })
      continue
    }

    const found = affitorTerms(p)
    // Under also_on, no published commission is shown as such (no figure); any
    // other unusable number is skipped, as everywhere else.
    if (typeof found === "string" && !(alsoOn && found === NO_COMMISSION)) {
      out.push(at("skip", found, match))
      continue
    }
    const terms = typeof found === "string" ? null : found
    if (p.is_platform_program) {
      out.push(at("skip", "Affitor's own platform program, not a brand listing", match))
      continue
    }

    let planned: Planned
    if (match) {
      // A listing linked to one Affitor program is never re-linked to another,
      // listed or gone: a website is self-declared and proves no ownership.
      // So the sync never adds an also_on link either; a person does.
      const link = match.linked ?? match.alsoOn
      const other = link && link !== p.slug ? link : null
      const prior = claimed.get(match.file)
      // A take-over needs both identities, and equal: never null on either side.
      if (!site || match.site !== site) {
        const why =
          site && match.site
            ? `marketplace slug now points at a different website: OA ${match.site}, Affitor ${site}`
            : `no website identity to confirm the brand: OA ${match.site ?? "none"}, Affitor ${site ?? "none"}`
        planned = at("conflict", why, match)
      } else if (other) {
        const why = listed.has(other)
          ? `already listed from Affitor program ${other}`
          : `linked to Affitor program ${other}, which left the list; a website match never re-links a listing`
        planned = at("conflict", why, match)
      } else if (prior) planned = at("conflict", `OA listing already matched by Affitor program ${prior} in this run`, match)
      else if (!alsoOn && !pointsAtAffitor(match)) {
        planned = at("conflict", `OA lists ${match.site}'s own program at ${String(match.data.signup_url ?? match.data.url)}`, match)
        planned.entry.oa_terms = termsOf(match)
      } else if (match.anchors) {
        planned = at("conflict", "yaml anchors present; the sync does not edit a file with anchors or aliases", match)
      } else if (alsoOn) {
        claimed.set(match.file, p.slug)
        planned = at("also-on", `OA lists ${match.site}'s own program, linked to this one under also_on.affitor`, match)
        if (!terms) planned.entry.reason += "; Affitor publishes no commission, so the line shows none"
      } else {
        claimed.set(match.file, p.slug)
        planned = at("take-over", "OA listing already sends partners to Affitor", match)
      }
    } else if (bySlug) {
      planned = at("slug-collision", `OA's ${bySlug.slug} is ${bySlug.site}, Affitor's ${p.slug} is ${site}: a different brand`, bySlug)
    } else if (!host || !slug) {
      planned = at("skip", host ? "no usable name for a slug" : "no website on Affitor")
    } else if (creating.has(slug) || (site && creating.has(site))) {
      const first = creating.get(slug)
      planned = at("conflict", `same ${first ? "slug" : "website"} as Affitor program ${first ?? creating.get(site ?? "")} in this run`)
    } else {
      creating.set(slug, p.slug)
      if (site) creating.set(site, p.slug)
      planned = at("create", "brand not on OA")
      planned.entry.file = `programs/${slug}.yaml`
    }
    if (terms) planned.entry.affitor_terms = terms
    planned.terms = terms
    out.push(planned)
  }

  for (const l of listings) {
    // A listing on Affitor is paused; the brand's own listing loses its also_on.affitor entry.
    const unlink = l.network !== "affitor" && l.alsoOn !== null
    const link = unlink ? l.alsoOn : l.linked
    const not = unlink ? "not unlinked" : "not paused"
    // A program still on the list is never paused, even when it has nothing usable to sync.
    if ((l.network !== "affitor" && !unlink) || matched.has(l.file) || (link && listed.has(link))) continue
    if (!unlink && (l.status ?? "active") !== "active") continue
    const entry: Entry = {
      action: unlink ? "unlink" : "pause",
      affitor_slug: link,
      oa_slug: l.slug,
      file: `programs/${l.file}`,
      reason: `no longer listed on the Affitor marketplace as of ${today}${unlink ? "; also_on.affitor removed" : ""}`,
    }
    const skipped = onSkipList(skip, l.slug, link)
    if (skipped) {
      entry.action = "skip"
      entry.reason = `on the skip list (${SKIP_FILE}): ${skip[skipped]}; ${not}`
    } else if (!link) {
      entry.action = "conflict"
      entry.reason = `missing from the Affitor list, but its signup_url is no marketplace page to check; ${not}`
    } else if (l.anchors) {
      entry.action = "conflict"
      entry.reason = `no longer listed on the Affitor marketplace, but yaml anchors present; ${not}`
    }
    out.push({ entry, listing: l })
  }
  return out
}

// ---------- Run ----------------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)

async function fetchList(fetchJson: FetchJson): Promise<AffitorProgram[]> {
  const body = await fetchJson(LIST_URL)
  if (!isRecord(body) || body.success !== true || !Array.isArray(body.data) || body.data.length === 0) {
    throw new Error("the Affitor list came back failed, empty or malformed")
  }
  // Measured 2026-10-12: one response holds the whole list, with no paging
  // keys. One would mean this is a page of several, and every program on the
  // other pages would read as gone.
  const paging = ["meta", "pagination", "next", "next_cursor", "total"].filter((k) => k in body)
  if (paging.length) throw new Error(`the Affitor list carries ${paging.join(", ")}, so it may be one page of several`)
  for (const r of body.data) {
    if (!isRecord(r) || typeof r.slug !== "string" || !r.slug || typeof r.name !== "string") {
      throw new Error("the Affitor list has a row without a slug or name")
    }
  }
  return body.data as AffitorProgram[]
}

async function fetchDetail(fetchJson: FetchJson, slug: string): Promise<AffitorProgram> {
  const body = await fetchJson(`${LIST_URL}/${encodeURIComponent(slug)}`)
  const data = isRecord(body) ? body.data : null
  if (!isRecord(body) || body.success !== true || !isRecord(data) || data.slug !== slug || typeof data.name !== "string") {
    throw new Error(`the Affitor detail for ${slug} came back failed or malformed`)
  }
  return data as unknown as AffitorProgram
}

/**
 * Affitor's answer for a slug it does not have, and nothing else: measured
 * live on 2026-10-13, HTTP 200 with exactly config.not_found,
 * {"success":false,"data":null,"message":"Program not found"}. Another
 * message, a code or any extra key (an outage reported as success: false)
 * is not proof a program left. The merge lane checks the same shape.
 */
export function affitorNotFound(body: unknown): boolean {
  const want: Record<string, unknown> = config.not_found
  return (
    isRecord(body) &&
    Object.keys(body).length === Object.keys(want).length &&
    Object.entries(want).every(([key, value]) => Object.hasOwn(body, key) && body[key] === value)
  )
}

/**
 * Affitor's own answer on whether a program left: its exact not-found body
 * (affitorNotFound), or a valid detail showing it is still there. Any other
 * answer stops the run, so neither a pause nor an unlink rests on an error.
 */
async function leftAffitor(fetchJson: FetchJson, slug: string): Promise<boolean> {
  const body = await fetchJson(`${LIST_URL}/${encodeURIComponent(slug)}`)
  if (affitorNotFound(body)) return true
  if (isRecord(body) && body.success === true && isRecord(body.data) && body.data.slug === slug) return false
  throw new Error(`the Affitor detail for ${slug} neither confirms it left nor shows it is still there`)
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
  /** Slug → reason. Defaults to the committed data/affitor-sync-skip.json. */
  skip?: Record<string, string>
}

export async function run(o: RunOptions): Promise<{ entries: Entry[]; written: string[] }> {
  const log = o.log ?? (() => {})
  const skip = o.skip ?? skipList
  const dryRun = o.args.includes("--dry-run")
  const only = flag(o.args, "--only")?.split(",").map((s) => s.trim()).filter(Boolean)
  const reportPath = flag(o.args, "--report")
  const inScope = ({ entry }: Planned) =>
    !only || only.includes(entry.affitor_slug ?? "") || only.includes(entry.oa_slug ?? "")

  const list = await fetchList(o.fetchJson)
  const listings = loadListings(o.programsDir)

  // The list is discovery. Every term comes from each program's own detail:
  // load the detail of every program in scope, then plan again on those.
  const details = new Map<string, AffitorProgram>()
  for (const { program } of plan(list, listings, o.today, skip).filter(inScope)) {
    if (program) details.set(program.slug, await fetchDetail(o.fetchJson, program.slug))
  }
  const chosen = plan(list.map((r) => details.get(r.slug) ?? r), listings, o.today, skip).filter(inScope)
  for (const { entry, program } of chosen) {
    if (!program) continue
    const detail = details.get(program.slug)
    if (!detail) throw new Error(`no detail was loaded for ${program.slug}`)
    const fromList = termFields(list.find((r) => r.slug === program.slug)!)
    const fromDetail = termFields(detail)
    const disagree = Object.keys(fromList)
      .filter((k) => k !== "payout_threshold" && (fromList[k] ?? null) !== (fromDetail[k] ?? null))
      .map((field) => ({ field, list: fromList[field] ?? null, detail: fromDetail[field] ?? null }))
    if (disagree.length) entry.list_vs_detail = disagree
  }

  // Missing from one list response proves nothing: a pause or an unlink needs
  // Affitor's own detail to say the program is gone.
  const removes = (e: Entry) => e.action === "pause" || e.action === "unlink"
  for (const { entry } of chosen) {
    if (!removes(entry) || (await leftAffitor(o.fetchJson, entry.affitor_slug!))) continue
    entry.reason = `missing from the Affitor list, but its detail still answers; not ${entry.action === "unlink" ? "unlinked" : "paused"}`
    entry.action = "skip"
  }

  const entries = chosen.map((c) => c.entry)
  const tally = () => {
    const totals: Record<string, number> = {}
    for (const e of entries) totals[e.action] = (totals[e.action] ?? 0) + 1
    return totals
  }
  const report = (aborted: string | null) => {
    if (!reportPath) return
    const body = {
      generated_at: new Date().toISOString(),
      sync_date: o.today,
      source: LIST_URL,
      dry_run: dryRun,
      only: only ?? null,
      affitor_programs: list.length,
      aborted,
      totals: tally(),
      entries,
    }
    writeFileSync(reportPath, JSON.stringify(body, null, 2) + "\n")
    log(`report: ${reportPath}`)
  }

  const pauses = entries.filter(removes).length
  if (pauses > MAX_PAUSES) {
    const why = `${pauses} listings would be paused or unlinked, more than the ${MAX_PAUSES} one run may pause`
    report(why)
    throw new Error(why)
  }

  // Everything is computed and read back before anything is written.
  const writes: [string, string][] = []
  for (const { entry, program, terms, listing } of chosen) {
    if (entry.action === "take-over" && program && terms && listing) {
      const { text, diffs } = edit(
        readFileSync(listing.path, "utf8"),
        ownedFields(program, terms, listing.data.restrictions),
        [
          [["updated_at"], o.today],
          [["last_verified_at"], o.today],
        ],
        entry.file!,
      )
      entry.diffs = diffs
      if (text) writes.push([listing.path, text])
      else entry.reason += "; already up to date"
    } else if (entry.action === "also-on" && program && listing) {
      // The brand's own terms were not re-verified, so last_verified_at stays.
      const { text, diffs } = edit(readFileSync(listing.path, "utf8"), alsoOnFields(terms ?? null), [[["updated_at"], o.today]], entry.file!)
      entry.diffs = diffs
      if (text) writes.push([listing.path, text])
      else entry.reason += "; already up to date"
    } else if (entry.action === "create" && program && terms) {
      const made = newListing(program, terms, entry.oa_slug!, o.today)
      if (typeof made === "string") {
        entry.action = "skip"
        entry.reason = made
        entry.file = null
        continue
      }
      const dates: Edit[] = ["created_at", "updated_at", "last_verified_at"].map((k): Edit => [[k], o.today])
      checkReadBack(made.text, [...ownedFields(program, terms), ...dates], entry.file!)
      checkSchema(leaves(parseDocument(made.text).toJS()), entry.file!)
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
        entry.file!,
      )
      entry.diffs = diffs
      if (text) writes.push([listing.path, text])
    } else if (entry.action === "unlink" && listing) {
      const { text, diffs } = edit(readFileSync(listing.path, "utf8"), [[["also_on"], DELETE]], [[["updated_at"], o.today]], entry.file!)
      entry.diffs = diffs
      if (text) writes.push([listing.path, text])
    }
  }

  for (const e of entries) {
    log(`${e.action.padEnd(14)} ${(e.affitor_slug ?? "-").padEnd(32)} ${(e.oa_slug ?? "-").padEnd(28)} ${e.reason}`)
  }
  log(`${list.length} Affitor programs; ${Object.entries(tally()).map(([a, n]) => `${n} ${a}`).join(", ")}`)

  if (!dryRun) for (const [path, text] of writes) writeFileSync(path, text)
  log(dryRun ? `dry run: ${writes.length} file(s) would change, nothing written` : `wrote ${writes.length} file(s)`)
  report(null)
  return { entries, written: dryRun ? [] : writes.map(([path]) => path) }
}

/**
 * The Affitor API over HTTP. Only a 200 is read: the API answers 200 whether a
 * program exists or not. It never redirects, so a redirect is refused rather
 * than followed: no hop can reach a host in schema/blocked-hosts.json.
 */
export async function httpJson(url: string, fetchImpl: typeof fetch = fetch): Promise<unknown> {
  const res = await fetchImpl(url, { headers: { accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(20_000) })
  if (res.status !== 200) throw new Error(`${url} answered ${res.status}`)
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
