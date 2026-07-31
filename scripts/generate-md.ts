#!/usr/bin/env tsx
/**
 * generate-md — emit the machine-readable surface into public/.
 *
 * Every program YAML already carries an `agents:` block written for machines
 * to read: when to recommend the program, trigger keywords, concrete use
 * cases. Until now no machine could read it — an assistant asked "best
 * affiliate program for password managers" gets a React-rendered page and
 * cites whoever gave it a clean answer instead. This emits that answer.
 *
 * Two rules this script exists to enforce:
 *
 * 1. One source. It reads src/lib/registry.json — the same file the pages
 *    read — so the numbers here cannot drift from the HTML. It never
 *    re-parses the YAML, which would create a second source of truth.
 *
 * 2. Run AFTER build-registry. The committed registry.json is a build
 *    artifact and has been stale before; `prebuild` regenerates it. Reading
 *    it before that step would silently emit a page short of every program
 *    added since the last commit of the artifact. Hence the ordering in
 *    package.json — do not reorder it.
 *
 * Output is gitignored on purpose. Generating at build time instead of
 * committing ~760 files means the surface cannot go stale, needs no pruning
 * of retired programs, and needs no CI check to prove it is current.
 *
 * Usage: npx tsx scripts/generate-md.ts
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import registry from "../src/lib/registry.json"

const BASE = "https://openaffiliate.dev"
const OUT = join(process.cwd(), "public")

// ---------- Types -----------------------------------------------------------

type Commission = {
  type?: string | null
  rate?: string | number | null
  currency?: string | null
  duration?: string | null
  conditions?: string | null
}

type Program = {
  slug: string
  name: string
  url: string
  category: string
  description?: string
  short_description?: string
  commission: Commission
  cookie_days?: number | null
  payout?: { minimum?: number | null; currency?: string | null; frequency?: string | null } | null
  attribution?: string | null
  tracking_method?: string | null
  signup_url?: string | null
  approval?: string | null
  approval_time?: string | null
  restrictions?: string[] | null
  network?: string | null
  program_age?: string | null
  verified?: boolean
  last_verified_at?: string | null
  source?: string | null
  submitted_by?: string | null
  tags?: string[] | null
  agents?: { prompt?: string | null; keywords?: string[] | null; use_cases?: string[] | null } | null
}

const programs = (registry as { programs: Program[] }).programs
const categories = (registry as { categories: string[] }).categories

// ---------- Slugs — must match src/lib/programs.ts exactly -------------------

const categoryToSlug = (c: string) =>
  c.toLowerCase().replace(/\s+/g, "-").replace(/[&]/g, "and").replace(/[^a-z0-9-]/g, "")

const networkToSlug = (n: string) =>
  n.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")

const IN_HOUSE = "in-house"

// ---------- Formatting ------------------------------------------------------

function rate(c: Commission): string {
  if (c.rate === null || c.rate === undefined || c.rate === "") return "unknown"
  return typeof c.rate === "number" ? `${c.rate}%` : String(c.rate)
}

/** "30% recurring for 12 months" — the line an agent is actually asked about. */
function commissionLine(c: Commission): string {
  const parts = [rate(c)]
  if (c.type) parts.push(String(c.type))
  if (c.duration) parts.push(`for ${c.duration}`)
  return parts.join(" ")
}

function payoutLine(p: Program): string | null {
  const pay = p.payout
  if (!pay) return null
  const bits: string[] = []
  if (pay.minimum !== null && pay.minimum !== undefined) {
    bits.push(`${pay.currency ?? "USD"} ${pay.minimum} minimum`)
  }
  if (pay.frequency) bits.push(String(pay.frequency))
  return bits.length ? bits.join(", ") : null
}

/**
 * The honesty line. Markdown has no badge to say "unconfirmed" the way the UI
 * does, and 93.6% of this registry is community-submitted and unchecked. An
 * assistant citing a wrong commission rate costs the reader real money, so the
 * caveat goes at the top of the file, not buried at the bottom.
 */
function statusBlock(p: Program): string {
  const when = p.last_verified_at ? String(p.last_verified_at) : "never"
  if (p.verified) {
    return [
      `Status: verified by OpenAffiliate`,
      `Last verified: ${when}`,
    ].join("\n")
  }
  return [
    `Status: unverified`,
    `Last verified: ${when}`,
    "",
    `These figures are community-submitted and have not been confirmed by`,
    `OpenAffiliate. Check them against the program's own page before relying`,
    `on them: ${p.signup_url ?? p.url}`,
  ].join("\n")
}

function bullets(items: string[] | null | undefined): string | null {
  if (!items || items.length === 0) return null
  return items.map(i => `- ${i}`).join("\n")
}

function section(title: string, body: string | null | undefined): string | null {
  if (!body || !String(body).trim()) return null
  return `## ${title}\n\n${String(body).trim()}`
}

function joinSections(parts: (string | null)[]): string {
  return parts.filter(Boolean).join("\n\n") + "\n"
}

// ---------- Per-program page ------------------------------------------------

function programMd(p: Program): string {
  const facts = [
    `Commission: ${commissionLine(p.commission)}`,
    p.commission.conditions ? `Commission conditions: ${p.commission.conditions}` : null,
    p.cookie_days !== null && p.cookie_days !== undefined ? `Cookie window: ${p.cookie_days} days` : null,
    payoutLine(p) ? `Payout: ${payoutLine(p)}` : null,
    p.attribution ? `Attribution: ${p.attribution}` : null,
    p.tracking_method ? `Tracking: ${p.tracking_method}` : null,
    `Network: ${p.network ?? IN_HOUSE}`,
    p.approval ? `Approval: ${p.approval}${p.approval_time ? ` (${p.approval_time})` : ""}` : null,
    p.program_age ? `Program age: ${p.program_age}` : null,
    `Category: ${p.category}`,
  ].filter(Boolean).join("\n")

  const links = [
    p.signup_url ? `Sign up: ${p.signup_url}` : null,
    `Website: ${p.url}`,
    `Full listing: ${BASE}/programs/${p.slug}`,
    `JSON: ${BASE}/api/programs/${p.slug}`,
  ].filter(Boolean).join("\n")

  return joinSections([
    `# ${p.name} affiliate program`,
    p.short_description ? `> ${p.short_description}` : null,
    statusBlock(p),
    section("Terms", facts),
    section("When to recommend", p.agents?.prompt),
    section("Use cases", bullets(p.agents?.use_cases)),
    section("Trigger keywords", p.agents?.keywords?.join(", ")),
    section("Restrictions", bullets(p.restrictions)),
    section("About", p.description),
    section("Links", links),
  ])
}

// ---------- Compact row used by index pages ---------------------------------

function row(p: Program): string {
  const mark = p.verified ? "" : " (unverified)"
  const cookie = p.cookie_days ? `, ${p.cookie_days}d cookie` : ""
  return `- [${p.name}](${BASE}/programs/${p.slug}.md) — ${commissionLine(p.commission)}${cookie}${mark}`
}

// ---------- Category / network pages ----------------------------------------

function groupMd(kind: "category" | "network", label: string, list: Program[]): string {
  const verified = list.filter(p => p.verified)
  const sorted = [...verified, ...list.filter(p => !p.verified)]
  const title = kind === "category" ? `${label} affiliate programs` : `${label} affiliate network`

  return joinSections([
    `# ${title}`,
    `> ${list.length} programs, ${verified.length} verified by OpenAffiliate.`,
    [
      `Verified programs are listed first. Everything below the verified block is`,
      `community-submitted and unconfirmed.`,
    ].join("\n"),
    section("Programs", sorted.map(row).join("\n")),
    section("Links", [
      `HTML: ${BASE}/${kind === "category" ? "categories" : "networks"}/${
        kind === "category" ? categoryToSlug(label) : networkToSlug(label)
      }`,
      `All programs: ${BASE}/programs.md`,
      `Registry entry point: ${BASE}/llms.txt`,
    ].join("\n")),
  ])
}

// ---------- llms.txt --------------------------------------------------------

function llmsTxt(): string {
  const verified = programs.filter(p => p.verified)
  const networks = [...new Set(programs.map(p => p.network ?? IN_HOUSE))].sort()

  const catLines = categories
    .map(c => {
      const inCat = programs.filter(p => p.category === c)
      const v = inCat.filter(p => p.verified).length
      return `- [${c}](${BASE}/categories/${categoryToSlug(c)}.md) — ${inCat.length} programs, ${v} verified`
    })
    .join("\n")

  const netLines = networks
    .map(n => {
      const inNet = programs.filter(p => (p.network ?? IN_HOUSE) === n)
      return `- [${n}](${BASE}/networks/${networkToSlug(n)}.md) — ${inNet.length} programs`
    })
    .join("\n")

  return joinSections([
    `# OpenAffiliate`,
    [
      `> The open registry of affiliate programs. ${programs.length} programs across`,
      `> ${categories.length} categories, each with machine-readable guidance on when`,
      `> it is worth recommending.`,
    ].join("\n"),
    // Stated up front, not buried. An agent weighting this surface deserves to
    // know how much of it has actually been checked.
    [
      `## Data quality`,
      ``,
      `${verified.length} of ${programs.length} programs (${((verified.length / programs.length) * 100).toFixed(1)}%)`,
      `have been verified by OpenAffiliate. The rest are community-submitted and`,
      `unconfirmed: the commission rate, cookie window and payout terms come from`,
      `the submitter and have not been checked against the program's own page.`,
      ``,
      `Every program file states its own status and verification date at the top.`,
      `Prefer verified entries when accuracy matters, and cite the program's`,
      `signup URL rather than this registry for anything a reader will act on.`,
    ].join("\n"),
    section(
      "Verified programs",
      verified.length
        ? verified.map(row).join("\n")
        : "None yet.",
    ),
    section("Categories", catLines),
    section("Networks", netLines),
    section(
      "Everything else",
      [
        `- [All programs, grouped by category](${BASE}/programs.md)`,
        `- [Full dump, every program in one file](${BASE}/llms-full.txt)`,
        `- [JSON API](${BASE}/api/programs) — no auth required`,
        `- [MCP server](${BASE}/api/mcp) — search_programs, get_program, list_categories`,
      ].join("\n"),
    ),
    section(
      "Conventions",
      [
        `Any listing page is available as markdown by appending .md:`,
        `${BASE}/programs/vercel.md, ${BASE}/categories/ai.md, ${BASE}/networks/impact.md`,
      ].join("\n"),
    ),
  ])
}

function llmsFullTxt(): string {
  const header = joinSections([
    `# OpenAffiliate — full registry`,
    [
      `> Every one of the ${programs.length} programs, in full. Generated from the same`,
      `> registry the website reads. For the short version see ${BASE}/llms.txt.`,
    ].join("\n"),
    [
      `${programs.filter(p => p.verified).length} programs are verified by OpenAffiliate.`,
      `The rest are community-submitted and unconfirmed — each states its own`,
      `status below.`,
    ].join("\n"),
  ])

  const sorted = [...programs.filter(p => p.verified), ...programs.filter(p => !p.verified)]
  return header + "\n" + sorted.map(programMd).join("\n---\n\n")
}

// ---------- programs.md index ----------------------------------------------

function programsIndexMd(): string {
  // 760 rows in one file is ~150KB and useless to skim. Group by category and
  // link out; llms-full.txt is where everything lives.
  const blocks = categories
    .map(c => {
      const inCat = programs.filter(p => p.category === c)
      if (!inCat.length) return null
      const v = inCat.filter(p => p.verified)
      const sorted = [...v, ...inCat.filter(p => !p.verified)]
      const shown = sorted.slice(0, 15)
      const more =
        sorted.length > shown.length
          ? `\n- … ${sorted.length - shown.length} more in [${c}](${BASE}/categories/${categoryToSlug(c)}.md)`
          : ""
      return `### ${c}\n\n${inCat.length} programs, ${v.length} verified.\n\n${shown.map(row).join("\n")}${more}`
    })
    .filter(Boolean)
    .join("\n\n")

  return joinSections([
    `# All affiliate programs`,
    [
      `> ${programs.length} programs across ${categories.length} categories.`,
      `> ${programs.filter(p => p.verified).length} verified by OpenAffiliate; the rest are`,
      `> community-submitted and unconfirmed.`,
    ].join("\n"),
    [
      `Verified programs are listed first within each category. Full detail for`,
      `every program is at ${BASE}/llms-full.txt.`,
    ].join("\n"),
    blocks,
  ])
}

// ---------- Write -----------------------------------------------------------

let written = 0

function write(relPath: string, body: string): void {
  const abs = join(OUT, relPath)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body)
  written++
}

function main(): void {
  // Clear previous output so a renamed or retired program cannot leave a file
  // behind that keeps answering as current — worse than a 404.
  for (const dir of ["programs", "categories", "networks"]) {
    rmSync(join(OUT, dir), { recursive: true, force: true })
  }

  write("llms.txt", llmsTxt())
  write("llms-full.txt", llmsFullTxt())
  write("programs.md", programsIndexMd())

  for (const p of programs) {
    write(`programs/${p.slug}.md`, programMd(p))
  }

  for (const c of categories) {
    const inCat = programs.filter(p => p.category === c)
    if (inCat.length) write(`categories/${categoryToSlug(c)}.md`, groupMd("category", c, inCat))
  }

  const networks = [...new Set(programs.map(p => p.network ?? IN_HOUSE))]
  for (const n of networks) {
    const inNet = programs.filter(p => (p.network ?? IN_HOUSE) === n)
    write(`networks/${networkToSlug(n)}.md`, groupMd("network", n, inNet))
  }

  const verified = programs.filter(p => p.verified).length
  console.log(`Markdown surface generated:`)
  console.log(`  ${written} files`)
  console.log(`  ${programs.length} programs (${verified} verified, ${programs.length - verified} unverified)`)
  console.log(`  ${categories.length} categories, ${networks.length} networks`)
  console.log(`  Output: public/`)
}

main()
