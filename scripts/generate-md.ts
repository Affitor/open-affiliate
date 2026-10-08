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
import { docsNav } from "../src/app/docs/_config"
import { changelog } from "../src/lib/changelog"
import {
  programs as sitePrograms,
  affiliateScore,
  commissionDisplay,
  getCategoryStats,
  getNetworkStats,
} from "../src/lib/programs"

const BASE = "https://openaffiliate.dev"

/**
 * How many verified programs llms.txt shows inline.
 *
 * It used to show all of them. That made the size of a fetch-once index grow
 * with the registry: at 49 verified the list was 4947 bytes, 48% of the file,
 * ~101 bytes a row, and the file sat 4 bytes under its CI byte cap. The next
 * program to be verified would have failed the build — measured, by toggling
 * one: 10316 bytes against a cap of 10240.
 *
 * Twelve is an editorial choice, not a derivation: about as many rows as a
 * reader takes in before deciding whether to follow the link. Nothing computes
 * it, and saying so is more useful than inventing a formula.
 *
 * Ties at the boundary are broken alphabetically, which matters more than the
 * number does: ranks 10-15 currently all score 79, so three tied programs are
 * shown and three are not, decided by name alone. The section says
 * "highest-scoring", so that is worth knowing — being listed here is free
 * promotion, and the cut is partly arbitrary.
 */
const VERIFIED_SAMPLE = 12

/**
 * Longest name and longest commission text rendered inline in llms.txt.
 *
 * A fixed row count is not a fixed byte count. Reviewers proved it three ways,
 * each with a schema-valid registry: `name` at 5000 characters put the index at
 * 11619 bytes, `commission.duration` at 5000 gave 11618, and a tiered
 * `commission.rate` at 5000 gave 11603 — all with twelve rows, all failing the
 * cap. None of the three has a maxLength in the schema.
 *
 * Capping only the name was the version of this that did not work: it bounded
 * one of three terms while the comment claimed the row was bounded. Both
 * free-text fields are capped here now.
 *
 * These are byte budgets, not character counts — the cap they serve is in
 * bytes, and a code-unit clamp admitted three times its number in CJK.
 *
 * The slug is bounded too, though not by the schema, which gives it a charset
 * and no maxLength: build-registry refuses a slug that is not its own filename,
 * so the filesystem's 255-byte limit caps it. Worst case across the sample
 * lands under the byte cap and above the 85% warning. Longest today is 53.
 *
 * verified.md is uncapped and prints everything in full.
 */
const INLINE_NAME_MAX = 60
const INLINE_TERMS_MAX = 80 // bytes, both
const OUT = join(process.cwd(), "public")

// ---------- Types -----------------------------------------------------------

type Commission = {
  type?: string | null
  rate?: string | number | null
  mode?: "percentage" | "flat" | "tiered" | "hybrid" | "unknown"
  value?: number | null
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

const registryData = registry as {
  generated_at: string
  programs: Program[]
  categories: string[]
}
const programs = registryData.programs
const categories = registryData.categories
const generatedAt = registryData.generated_at

// ---------- Slugs — must match src/lib/programs.ts exactly -------------------

const categoryToSlug = (c: string) =>
  c.toLowerCase().replace(/\s+/g, "-").replace(/[&]/g, "and").replace(/[^a-z0-9-]/g, "")

const networkToSlug = (n: string) =>
  n.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")

const IN_HOUSE = "in-house"

// ---------- Formatting ------------------------------------------------------

/**
 * Reads the typed shape rather than the raw string. An agent citing this
 * surface should never be handed the word "varies" in a commission slot —
 * "Not published" says the same thing without looking like a value.
 */
function rate(c: Commission): string {
  switch (c.mode) {
    case "percentage":
      return c.value != null ? `${c.value}%` : "Not published"
    case "flat":
      return c.value != null ? `$${c.value.toLocaleString()}` : "Not published"
    case "tiered":
    case "hybrid":
      return String(c.rate)
    case "unknown":
      return "Not published"
  }
  if (c.rate === null || c.rate === undefined || c.rate === "") return "Not published"
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
    `Commission: ${mdEscape(commissionLine(p.commission))}`,
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
    `# ${mdEscape(p.name)} affiliate program`,
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
  return `- [${mdEscape(p.name)}](${BASE}/programs/${p.slug}.md) — ${mdEscape(`${commissionLine(p.commission)}${cookie}`)}${mark}`
}

/** As `row`, but with both free-text fields capped. See INLINE_NAME_MAX. */
function indexRow(p: Program): string {
  const cookie = p.cookie_days ? `, ${p.cookie_days}d cookie` : ""
  const terms = mdEscape(`${commissionLine(p.commission)}${cookie}`)
  return `- [${clamp(mdEscape(p.name), INLINE_NAME_MAX)}](${BASE}/programs/${p.slug}.md) — ${clamp(terms, INLINE_TERMS_MAX)}`
}

/**
 * Escape contributor text before it becomes Markdown.
 *
 * Program names, commission rates and durations come from YAML a contributor
 * wrote, and they were interpolated straight into every generated surface. A
 * reviewer took that through the real pipeline: `commission.duration` set to
 * `[Extra](/programs/11x.md)` — valid against the schema, short enough to
 * survive the length cap — produced
 *
 *   - [Framer](…/programs/framer.md) — 50% recurring for [Extra](/programs/11x.md), 90d cookie
 *
 * which is a second link in a row that is supposed to hold one, and the
 * verifier counted the row as one program. Emphasis, code spans and raw HTML
 * had the same opening. This closes the class rather than the instance: with
 * the literals escaped, contributor text can only ever render as text.
 *
 * `&`, `<` and `>` become entities because backslash does not escape them in
 * Markdown; everything else takes a backslash, which CommonMark strips on
 * render, so `Framer [US]` still reads as `Framer [US]`.
 */
function mdEscape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Only what can open structure mid-line: a code span, emphasis, or a link.
    // Not `-`, `+`, `#` or `1.`, which are list and heading markers and only
    // mean anything at the start of a line — this text is always interpolated
    // after "- [" or after "— ", so it never starts one. Escaping them anyway
    // turned "10% one-time" into "10% one\\-time" across every surface, which
    // is noise in a file meant to be read.
    .replace(/([\\`*_[\]])/g, "\\$1")
}

/**
 * Truncate to a byte budget, never mid-character.
 *
 * The first version counted `String.length`, which is UTF-16 code units, while
 * the thing it exists to protect is a byte cap. A reviewer measured the gap:
 * every verified program given a 300-character CJK name and duration — inside
 * both code-unit clamps — put the index at 10630 bytes and failed the cap. A
 * clamp of 60 code units admits 180 bytes of CJK.
 *
 * `slice` also cuts surrogate pairs. With emoji names the first version wrote
 * twelve U+FFFD into llms.txt, one per row, while verified.md — same data, no
 * clamp — had none. Iterating by code point cannot split one.
 */
function clamp(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text) <= maxBytes) return text
  let out = ""
  let used = 0
  for (const ch of text) {
    const size = Buffer.byteLength(ch)
    if (used + size > maxBytes - 3) break // 3 bytes for the ellipsis
    out += ch
    used += size
  }
  return `${out.trimEnd()}\u2026`
}

/**
 * Verified rows for verified.md, each carrying the date it was checked.
 *
 * The page tells a reader the terms were read from the program's own page on a
 * stated date. A reviewer caught that no entry stated one — the claim was
 * simply false. Rather than drop the sentence, the date it promises is now
 * here; verified.md has no size cap, so provenance is affordable.
 */
function verifiedRow(p: Program): string {
  return `${row(p)} — ${checkedOn(p)}`
}

/**
 * The checked date, as a plain calendar date.
 *
 * `last_verified_at` is not one shape in the registry: 48 entries are
 * `YYYY-MM-DD` and one is `2026-04-18 19:51:47.799000+00:00`, interpolated raw
 * in the first version of this column. Microsecond precision on "we read this
 * page" is noise that implies more than was measured, and a column with two
 * formats reads like a bug. Truncating to the date is the honest rendering.
 */
function checkedOn(p: Program): string {
  const raw = p.last_verified_at
  if (!raw) return "date not recorded"
  const date = /^(\d{4}-\d{2}-\d{2})/.exec(raw)
  return date ? `checked ${date[1]}` : `checked ${raw}`
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

// ---------- Integration -----------------------------------------------------

/**
 * How to query the registry live rather than read a snapshot of it. This is
 * the difference between an agent citing a file and an agent answering from
 * current data, so it goes in llms.txt itself rather than behind a link.
 *
 * Written here rather than lifted from AGENTS.md: that file also carries
 * repo-development instructions ("this is NOT the Next.js you know") that mean
 * nothing to an agent consuming the registry.
 */
const INTEGRATION = `### MCP — recommended

HTTP, no install:

\`\`\`bash
claude mcp add --transport http openaffiliate ${BASE}/mcp
\`\`\`

stdio, for local tools:

\`\`\`json
{ "mcpServers": { "openaffiliate": { "command": "npx", "args": ["-y", "openaffiliate-mcp"] } } }
\`\`\`

Tools: \`search_programs\` (keyword, category, commission type, verified),
\`get_program\` (full detail including the recommendation guidance), and
\`list_categories\`.

### Agent skill

One \`SKILL.md\` for agents that load skills (Claude Code and others):

\`\`\`bash
mkdir -p ~/.claude/skills/openaffiliate
curl -s ${BASE}/skill/SKILL.md -o ~/.claude/skills/openaffiliate/SKILL.md
\`\`\`

### REST — no auth

\`\`\`
GET ${BASE}/api/programs?q=ai&category=AI&type=recurring&verified=true
GET ${BASE}/api/programs/{slug}
GET ${BASE}/api/categories
\`\`\`

### CLI

\`\`\`bash
npx openaffiliate search "database" --json
npx openaffiliate info vercel --json
npx openaffiliate categories --json
\`\`\``

// ---------- docs.md ---------------------------------------------------------

/**
 * An index, not a conversion. The 13 docs pages are hand-written TSX with no
 * content source to generate from — turning them into markdown means moving
 * them to MDX first, which is a refactor rather than a generator.
 *
 * But docs/_config.ts already holds every page's title, group and description,
 * and it is the same source the sidebar and prev/next navigation read. That is
 * enough for a map an agent can navigate, with no second copy of the prose.
 */
function docsMd(): string {
  const groups = docsNav
    .map(g => {
      const items = g.items
        .map(i => `- [${i.title}](${BASE}${i.href})${i.description ? ` — ${i.description}` : ""}`)
        .join("\n")
      return `### ${g.label}\n\n${items}`
    })
    .join("\n\n")

  return joinSections([
    `# OpenAffiliate documentation`,
    [
      `> How to query the registry from code, an agent, or the terminal.`,
      `> Pages below are HTML; the registry data itself is available as markdown.`,
    ].join("\n"),
    section("Integration", INTEGRATION),
    section("Pages", groups),
    section(
      "Registry as markdown",
      [
        `- [Entry point](${BASE}/llms.txt)`,
        `- [All programs by category](${BASE}/programs.md)`,
        `- [Rankings by Affiliate Score](${BASE}/rankings.md)`,
        `- [Changelog](${BASE}/changelog.md)`,
        `- [Full dump](${BASE}/llms-full.txt)`,
        `- Any program, category or network page, with .md appended`,
      ].join("\n"),
    ),
  ])
}

// ---------- llms.txt --------------------------------------------------------

function verifiedByScore(): Program[] {
  // affiliateScore returns NaN for a program with no cookie_days
  // (Math.min(undefined / 90, 1)). NaN subtraction is NaN, which is falsy, so
  // `||` would fall through for that pair only — a comparator that is
  // non-transitive for some pairs and consistent for others, which leaves the
  // sort order implementation-defined. The index would then list the wrong
  // twelve, and no check would notice, because the checks count rows rather
  // than identify them. One program in the registry hits this today
  // (unverified, so latent). Non-finite sorts last.
  const score = new Map(
    sitePrograms.map(p => {
      const s = affiliateScore(p)
      return [p.slug, Number.isFinite(s) ? s : -1] as const
    }),
  )
  return programs
    .filter(p => p.verified)
    .sort(
      (a, b) =>
        (score.get(b.slug) ?? -1) - (score.get(a.slug) ?? -1) ||
        a.name.localeCompare(b.name),
    )
}

/**
 * Every verified program, uncapped. This is where the list llms.txt used to
 * inline now lives, so the index can stay a fixed size while the data grows.
 */
function verifiedMd(): string {
  const verified = verifiedByScore()
  return joinSections([
    `# Verified affiliate programs`,
    [
      `> The ${verified.length} programs OpenAffiliate has checked against the`,
      `> program's own page, highest Affiliate Score first. The other`,
      `> ${programs.length - verified.length} in the registry are community-submitted`,
      `> and unconfirmed.`,
    ].join("\n"),
    section(
      "What verified means",
      [
        `The commission rate, cookie window and payout terms below were read from`,
        `the program's own page on the date each entry states, or the entry says`,
        `the date was not recorded. Everything still changes without notice, so`,
        `cite the program's signup URL for anything a reader will act on.`,
      ].join("\n"),
    ),
    section(
      "Programs",
      verified.length
        ? verified.map(verifiedRow).join("\n")
        : `No program has been checked against its own page yet.`,
    ),
    section(
      "Elsewhere",
      [
        `- [Short index](${BASE}/llms.txt)`,
        `- [All ${programs.length} programs, grouped by category](${BASE}/programs.md)`,
        `- [Every program in full](${BASE}/llms-full.txt)`,
      ].join("\n"),
    ),
  ])
}

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
      `the submitter and have not been checked against the program page.`,
      ``,
      `Every program file states its own status and verification date at the top.`,
      `Prefer verified entries when accuracy matters, and cite the program's`,
      `signup URL rather than this registry for anything a reader will act on.`,
    ].join("\n"),
    section(
      "Freshness",
      [
        `This snapshot was generated ${generatedAt}.`,
        `Use the API or MCP tools below when you need the latest deployed data.`,
      ].join("\n"),
    ),
    // The heading says "sample" because it is one: a reader skimming headings
    // would otherwise take this for the whole verified set, and the omission is
    // systematic rather than random — every program that survives the cut pays
    // 30-50% recurring.
    //
    // The claim line has the same shape at every count, zero included. An
    // earlier version emitted a bare "None yet." there, which the verifier's
    // new check could not read, so an empty verified set failed CI: generator
    // and verifier disagreeing about the contract between them.
    section(
      verified.length > VERIFIED_SAMPLE
        ? "Verified programs (sample)"
        : "Verified programs",
      [
        verified.length > VERIFIED_SAMPLE
          ? `Highest-scoring ${VERIFIED_SAMPLE} of ${verified.length} verified. Full list: ${BASE}/verified.md`
          : `All ${verified.length} verified. Also at ${BASE}/verified.md`,
        ``,
        verified.length
          ? verifiedByScore().slice(0, VERIFIED_SAMPLE).map(indexRow).join("\n")
          : `No program has been checked against its own page yet.`,
      ].join("\n"),
    ),
    section("Categories", catLines),
    section("Networks", netLines),
    // Querying beats citing: this surface is a snapshot, the API is current.
    section("Querying this registry", INTEGRATION),
    section(
      "Primary pages",
      [
        `- [Browse programs](${BASE}/programs): Search and filter the registry.`,
        `- [Rankings](${BASE}/rankings.md): Compare programs, categories, and networks.`,
        `- [Compare](${BASE}/compare): Compare up to four programs side by side.`,
        `- [About and data policy](${BASE}/about): Publisher identity, verification policy, and contact.`,
        `- [Sitemap](${BASE}/sitemap.xml): Canonical index of HTML pages.`,
      ].join("\n"),
    ),
    section(
      "Everything else",
      [
        `- [All programs, grouped by category](${BASE}/programs.md)`,
        `- [Full dump, every program in one file](${BASE}/llms-full.txt)`,
        `- [Documentation index](${BASE}/docs.md)`,
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
      `> registry the website reads. For the short version see ${BASE}/llms.txt,`,
      `> and for just the checked ones ${BASE}/verified.md.`,
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

// ---------- Pages that were HTML-only ---------------------------------------

function indexMd(): string {
  return joinSections([
    `# OpenAffiliate`,
    [
      `> The open registry of affiliate programs. ${programs.length} programs.`,
      `> Built for developers and AI agents.`,
    ].join("\n"),
    section(
      "Read this as an agent",
      [
        `- [Entry point](${BASE}/llms.txt)`,
        `- [Full registry](${BASE}/llms-full.txt)`,
        `- [All programs](${BASE}/programs.md)`,
        `- [Verified programs](${BASE}/verified.md)`,
        `- [Rankings](${BASE}/rankings.md)`,
        `- [Changelog](${BASE}/changelog.md)`,
        `- [One program](${BASE}/programs/vercel.md)`,
        `- HTML home: ${BASE}/`,
      ].join("\n"),
    ),
  ])
}

function rankingsMd(): string {
  const ranked = [...sitePrograms].sort(
    (a, b) => affiliateScore(b) - affiliateScore(a) || a.name.localeCompare(b.name),
  )
  const programLines = ranked
    .map((p, i) => {
      const mark = p.verified ? "" : " (unverified)"
      return `${i + 1}. [${mdEscape(p.name)}](${BASE}/programs/${p.slug}.md) — score ${affiliateScore(p)}, ${mdEscape(commissionDisplay(p.commission))} ${p.commission.type}${mark}`
    })
    .join("\n")
  const networkLines = getNetworkStats()
    .map(n => `- [${n.network}](${BASE}/networks/${networkToSlug(n.network)}.md) — ${n.programCount} programs, best ${n.bestCommissionDisplay}, top [${n.topProgram.name}](${BASE}/programs/${n.topProgram.slug}.md)`)
    .join("\n")
  const categoryLines = getCategoryStats()
    .map(c => `- [${c.category}](${BASE}/categories/${categoryToSlug(c.category)}.md) — ${c.programCount} programs, best ${c.highestCommissionDisplay}, top [${c.topProgram.name}](${BASE}/programs/${c.topProgram.slug}.md)`)
    .join("\n")

  return joinSections([
    `# Affiliate program rankings`,
    [
      `> ${ranked.length} programs ordered by Affiliate Score, the same score as`,
      `> the podium on ${BASE}/rankings and the homepage preview.`,
      `> The interactive table can also sort by verified content, commission,`,
      `> or cookie length. Those orders depend on live filters, so they are not`,
      `> copied here.`,
    ].join("\n"),
    section("Programs", programLines),
    section("Networks", networkLines),
    section("Categories", categoryLines),
    section("Links", `HTML: ${BASE}/rankings`),
  ])
}

const CHANGELOG_TAG: Record<string, string> = {
  new: "New",
  improved: "Improved",
  fixed: "Fixed",
}

function changelogMd(): string {
  const entries = changelog.map(entry => {
    const items = entry.items
      .map(item => `- ${CHANGELOG_TAG[item.tag] ?? item.tag}: ${item.text}`)
      .join("\n")
    return `## ${entry.date} — ${entry.title}\n\n${items}`
  })
  return joinSections([
    `# Changelog`,
    `> What's new in OpenAffiliate. Same entries as ${BASE}/changelog.`,
    entries.join("\n\n"),
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
  write("verified.md", verifiedMd())
  write("llms-full.txt", llmsFullTxt())
  write("programs.md", programsIndexMd())
  write("docs.md", docsMd())
  write("index.md", indexMd())
  write("rankings.md", rankingsMd())
  write("changelog.md", changelogMd())

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
