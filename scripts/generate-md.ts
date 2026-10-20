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

import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { generateSkills } from "./generate-skills"
import { generateArd } from "./generate-ard"

import registry from "../src/lib/registry.json"
import { formatFlat, formatPercentage } from "../src/lib/commission-mode"
import { docsNav } from "../src/app/docs/_config"
import { changelog } from "../src/lib/changelog"
import { compareText } from "../src/lib/commission-order"
import { commissionGroup, compareCommissionFigure, payoutMinText, recurringMonths, recurringText, type CommissionGroup } from "../src/lib/rankings-terms"
import {
  programs as sitePrograms,
  affiliateScore,
  commissionDisplay,
  formatCommissionDisplay,
  getCategoryStats,
  getNetworkStats,
  liveNetworks,
  rateBasis,
  networkHeading,
  networkName,
  byNetworkName,
  type CommissionStats,
  type PaidBy,
} from "../src/lib/programs"
import {
  BEST_LISTS,
  SHARED_RULES,
  VERIFIED_NOTE,
  bestListCopy,
  bestPath,
  otherLists,
  buildBestList,
  freshnessLine,
  categoryList,
  listCommissionText,
  type BestList,
} from "../src/lib/best-lists"
import { hasNoProgram, noProgramAlternatives, noProgramAnswer } from "../src/lib/no-program"
import { blogEntries, type BlogEntry } from "../src/lib/blog"
import { DISCLOSURE_SOURCE, GUIDES, guidePath, guideSelection, guideTitle, registryFacts, type GuidePost } from "../src/lib/guides"
import { directoryGroups } from "../src/lib/programs-directory"
import { buildBoard, oasGrade, oasScores, TEAM_DISCLOSURE, UNRANKED_TEXT } from "../src/lib/oas"
import { confirmedPitch, confirmedPrompt, confirmedProse, confirmedProseList, termsConfirmed, UNCONFIRMED_NOTE } from "../src/lib/confirmed-terms"
import { applyButton, blogApplyHref } from "../src/lib/apply-cta"
import {
  DISCLOSURE,
  FRESHNESS_RULE,
  checkedRange,
  checkedText,
  cookieText,
  earnText,
  getPost,
  payoutText,
  postFaq,
  postReady,
  postSelection,
  postTitle,
  type BestPost,
  type PostSelection,
} from "../src/lib/best-posts"

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
  payout?: { minimum?: number | null; currency?: string | null; frequency?: string | null; conditions?: string | null } | null
  attribution?: string | null
  tracking_method?: string | null
  signup_url?: string | null
  approval?: string | null
  approval_time?: string | null
  restrictions?: string[] | null
  network?: string | null
  also_on?: { affitor?: { url: string; commission?: Commission } } | null
  program_age?: string | null
  verified?: boolean
  last_verified_at?: string | null
  status?: string | null
  status_note?: string | null
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

/**
 * Paused, discontinued and no_program entries keep their own .md (it says so),
 * but are never listed as live: not in verified lists, rankings or counts of
 * verified.
 */
function isLive(p: { status?: string | null }): boolean {
  return (p.status ?? "active") === "active"
}
function listedVerified(p: Program): boolean {
  return Boolean(p.verified) && isLive(p)
}
/**
 * Every listing and every "N programs" count reads this set, as the HTML pages
 * read src/lib/programs' livePrograms. A brand with no program keeps its own
 * answer-only .md and is never counted as an affiliate program.
 */
const livePrograms = programs.filter(isLive)
/** Suffix for list rows: what a reader must know before trusting the terms. */
function statusMark(p: { slug: string; verified?: boolean; status?: string | null }): string {
  if (p.status === "discontinued") return " (discontinued)"
  if (p.status === "no_program") return " (no affiliate program)"
  if (p.status === "paused") return " (status unclear)"
  return p.verified ? "" : " (unverified, terms unconfirmed)"
}
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
      return formatPercentage(c.rate, c.value)
    case "flat":
      // In its own currency; product credit, not cash, says so, as the page does.
      return formatFlat(c)
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

/**
 * The brand on Affitor too (also_on), in one line under its own terms, as the
 * page shows it: "Also on Affitor: 20% recurring for 12 months, sign up: <…>".
 * No figure when Affitor publishes none.
 */
function alsoOnLine(p: Program): string | null {
  const a = p.also_on?.affitor
  if (!a) return null
  const c = a.commission
  const figure = c && c.mode !== "unknown" && c.value != null ? `: ${mdEscape(commissionLine(c))}` : ""
  return `Also on Affitor${figure}, sign up: ${mdUrl(a.url)}`
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
  const when = p.last_verified_at ? mdEscape(p.last_verified_at) : "never"
  if (hasNoProgram(p)) return noProgramStatus(p)
  if (p.status === "paused") {
    return [
      `Status: unclear (paused).${p.status_note ? ` ${mdEscape(p.status_note)}` : ""}`,
      `The terms below are the last known listing, not confirmed. Do not recommend`,
      `this program until its page works again.`,
    ].join("\n")
  }
  if (p.verified) {
    return [
      `Status: verified by OpenAffiliate`,
      `Last verified: ${when}`,
    ].join("\n")
  }
  return [
    // No date: an unverified entry's last_verified_at is a check that confirmed
    // nothing, and "Last verified: <date>" read as verification. The facts
    // below carry UNCONFIRMED_NOTE.
    `Status: unverified`,
    "",
    `These figures are community-submitted and have not been confirmed by`,
    `OpenAffiliate. Check them against the program's own page before relying`,
    `on them: ${mdUrl(p.signup_url ?? p.url)}`,
    ...(termsConfirmed(p) ? [] : ["", `Cookie, payout and approval terms are left out until they are checked.`]),
  ].join("\n")
}

function bullets(items: string[] | null | undefined): string | null {
  if (!items || items.length === 0) return null
  // Both callers pass contributor arrays: agents.use_cases and restrictions.
  return items.map(i => `- ${mdEscapeProse(i)}`).join("\n")
}

function section(title: string, body: string | null | undefined): string | null {
  if (!body || !String(body).trim()) return null
  return `## ${title}\n\n${String(body).trim()}`
}

/** "1 program", "2 programs": a count a reader sees agrees with its noun. */
function programCount(n: number): string {
  return `${n} ${n === 1 ? "program" : "programs"}`
}

function joinSections(parts: (string | null)[]): string {
  return parts.filter(Boolean).join("\n\n") + "\n"
}

// ---------- Per-program page ------------------------------------------------

/**
 * The entry's free text as a reader may see it: unverified, the sentences that
 * state a cookie window, payout or approval term are dropped
 * (confirmed-terms.ts). The structured terms are gated in programMd.
 */
function shownProse(p: Program): Program {
  if (termsConfirmed(p)) return p
  return {
    ...p,
    short_description: confirmedPitch(p, p.short_description),
    description: confirmedPitch(p, p.description),
    commission: { ...p.commission, conditions: confirmedProse(p, p.commission.conditions) || null },
    restrictions: confirmedProseList(p, p.restrictions),
    agents: p.agents && { ...p.agents, prompt: confirmedPrompt(p, p.agents.prompt), use_cases: confirmedProseList(p, p.agents.use_cases) },
  }
}

export function programMd(entry: Program): string {
  const p = shownProse(entry)
  // Unverified: commission marked, cookie window, payout and approval left out (confirmed-terms.ts).
  const confirmed = termsConfirmed(p)
  const payout = confirmed ? payoutLine(p) : null
  const facts = [
    `Commission: ${mdEscape(commissionLine(p.commission))}`,
    confirmed ? null : UNCONFIRMED_NOTE,
    p.commission.conditions ? `Commission conditions: ${mdEscape(p.commission.conditions)}` : null,
    alsoOnLine(p),
    confirmed && p.cookie_days !== null && p.cookie_days !== undefined ? `Cookie window: ${mdEscape(String(p.cookie_days))} days` : null,
    payout ? `Payout: ${mdEscape(payout)}` : null,
    confirmed && p.payout?.conditions ? `Payout conditions: ${mdEscape(p.payout.conditions)}` : null,
    p.attribution ? `Attribution: ${mdEscape(p.attribution)}` : null,
    p.tracking_method ? `Tracking: ${mdEscape(p.tracking_method)}` : null,
    `Network: ${mdEscape(p.network ?? IN_HOUSE)}`,
    confirmed && p.approval ? `Approval: ${mdEscape(p.approval)}${p.approval_time ? ` (${mdEscape(p.approval_time)})` : ""}` : null,
    p.program_age ? `Program age: ${mdEscape(p.program_age)}` : null,
    `Category: ${mdEscape(p.category)}`,
  ].filter(Boolean).join("\n")

  const links = [
    p.signup_url && !hasNoProgram(p) ? `Sign up: ${mdUrl(p.signup_url)}` : null,
    `Website: ${mdUrl(p.url)}`,
    `Full listing: ${BASE}/programs/${p.slug}`,
    `JSON: ${BASE}/api/programs/${p.slug}`,
  ].filter(Boolean).join("\n")

  return joinSections([
    `# ${mdHeading(p.name)} affiliate program`,
    p.short_description ? `> ${mdEscapeProse(p.short_description)}` : null,
    statusBlock(p),
    hasNoProgram(p) ? noProgramAlternativesSection(p) : section(p.status === "paused" ? "Last known terms" : "Terms", facts),
    section("When to recommend", p.agents?.prompt && mdEscapeProse(p.agents.prompt)),
    section("Use cases", bullets(p.agents?.use_cases)),
    // A body, not an inline fact: section() puts the first keyword at column zero.
    section("Trigger keywords", p.agents?.keywords && mdEscapeProse(p.agents.keywords.join(", "))),
    hasNoProgram(p) ? null : section("Restrictions", bullets(p.restrictions)),
    section("About", p.description && mdEscapeProse(p.description)),
    section("Links", links),
  ])
}

// ---------- No-program page -------------------------------------------------

/**
 * A brand with no program to join gets the answer the HTML page and the API
 * give, worded by the same helper: no, when it was checked, and the dated
 * source. The "Status:" prefix stays for readers keyed on it.
 */
function noProgramStatus(p: Program): string {
  const site = sitePrograms.find(s => s.slug === p.slug)
  if (!site) throw new Error(`${p.slug}: missing from the site registry`)
  return [
    p.status === "discontinued" ? "Status: discontinued." : "Status: no affiliate program.",
    `Does ${mdEscape(p.name)} have an affiliate program? ${mdEscape(noProgramAnswer(site))}`,
  ].join("\n")
}

/** Where a Terms section would be: the page's alternatives, as rows linking their twins. */
function noProgramAlternativesSection(p: Program): string | null {
  const site = sitePrograms.find(s => s.slug === p.slug)
  if (!site) return null
  const rows = noProgramAlternatives(site)
    .map(a => programs.find(r => r.slug === a.slug))
    .filter((r): r is Program => Boolean(r))
    .map(row)
  return section(`${mdHeading(p.name)} affiliate program alternatives`, rows.join("\n"))
}

// ---------- Compact row used by index pages ---------------------------------

function row(p: Program): string {
  const mark = statusMark(p)
  const cookie = termsConfirmed(p) && p.cookie_days ? `, ${p.cookie_days}d cookie` : ""
  return `- [${mdEscape(p.name)}](${BASE}/programs/${p.slug}.md) — ${mdEscape(`${commissionLine(p.commission)}${cookie}`)}${mark}`
}

/** As `row`, but with both free-text fields capped. See INLINE_NAME_MAX. */
function indexRow(p: Program): string {
  const cookie = termsConfirmed(p) && p.cookie_days ? `, ${p.cookie_days}d cookie` : ""
  const terms = mdEscape(`${commissionLine(p.commission)}${cookie}`)
  return `- [${clamp(mdEscape(p.name), INLINE_NAME_MAX)}](${BASE}/programs/${p.slug}.md) — ${clamp(terms, INLINE_TERMS_MAX)}`
}

/**
 * Escape contributor text before it becomes Markdown.
 *
 * Program names, commission figures, descriptions, agent prompts, categories,
 * status notes, dates, URLs — all of it comes from YAML a contributor wrote,
 * and all of it was interpolated straight into every surface this script
 * writes. Reviewers took fields through the real pipeline, with valid YAML:
 *
 *   commission.duration  -> a second link inside a row meant to hold one
 *   commission.conditions-> a link and a raw <b> on the program page
 *   attribution          -> <img src=x onerror=…> verbatim
 *   description          -> "# PWNED HEADING" at column zero, and a <script>
 *   category             -> a live link in llms.txt's Categories section and
 *                           the H1 of categories/*.md, via a 21st category
 *                           that build-registry happily minted
 *   description "X\n===" -> a setext heading; an unclosed ``` fence in one
 *                           description swallowed every later program in
 *                           llms-full.txt
 *   last_verified_at     -> a link on the program page, in verified.md and,
 *                           in ten characters, in a best list's FAQ
 *
 * Twice the comment here claimed the class was closed while fields were still
 * raw. The lesson is in the shape of the bug, not the instances — every
 * contributor string is hostile until escaped, so one of the three functions
 * below is applied at every site that writes one. What is written raw is
 * numbers this script computes, text this repo's code supplies (docs, best-list
 * criteria, the changelog), and slugs. A slug must equal its filename
 * (build-registry), and the auto-merge policy admits only
 * `programs/[a-z0-9-]+.yaml`; any other filename is in a diff a person merges.
 *
 * Three functions, because one would be wrong in every direction, plus
 * `mdHeading` for the one context with a rule of its own.
 *
 * `mdEscape` is for short inline facts. It collapses line breaks and
 * neutralises anything that can open a link, emphasis, a code span,
 * strikethrough, a table cell or raw HTML.
 *
 * `mdEscapeProse` is for block bodies — descriptions, prompts, restrictions,
 * keywords. These go through `section()`, which emits `## Title\n\n${body}`, so
 * they sit at column zero and the line-start markers matter there; that is the
 * hole in "this text never starts a line", which was true only of the two
 * fields the first attempt covered. But escaping every `*` and `_` in a
 * paragraph of English is noise a reader has to see through, so prose keeps
 * those and neutralises structure instead: brackets, raw HTML, code spans,
 * table pipes, indentation, and anything at the start of a line that can open
 * a block.
 *
 * `mdUrl` is for URL fields printed for a reader to copy, as `<…>` autolinks.
 * mdEscape would write `utm\_source` into them, and an agent copies the raw
 * bytes — six programs' links would break that way today. A URL has its own
 * escape, so the few characters an autolink cannot hold are percent-encoded.
 *
 * `mdHeading` is mdEscape for text inside an ATX heading, where a trailing run
 * of `#` is read as the closing sequence and dropped: category "AI #" rendered
 * as "AI".
 *
 * Not neutralised, deliberately: GFM's autolink literals. In a GFM renderer a
 * bare `https://…`, `www.…` or e-mail address in any of these fields becomes a
 * link. Its visible text is always its own target, so it cannot pass one
 * destination off as another; what can is `[text](url)` or raw HTML, and both
 * are escaped above. An agent reading the raw file sees the same characters
 * either way, and breaking `://` to stop the autolink would corrupt every URL a
 * contributor writes in prose.
 *
 * `<`, `>` and an `&` that would start a character reference become entities,
 * because backslash does not escape them in Markdown. `&` is replaced first,
 * so an escaped `&` can never combine with a following `#` into a numeric
 * reference — which is what lets the verifier refuse `&#` outright without
 * false-failing on a name containing `&`.
 *
 * Not escaped, deliberately: `!`. Not because it is a line-start marker — it
 * is not, `![alt](url)` works mid-line — but because an image needs a `[` to
 * follow it, and `[` is escaped. That safety is coupled: if `[` ever leaves
 * the set, `!` has to join it.
 */
function mdEscape(text: string): string {
  // Line breaks collapse to spaces. An inline fact is written into one line of
  // a one-line contract, and a contributor newline broke that: `Framer\n[US]`
  // split a row in two, which the verifier then refused, and a multi-line
  // duration did the same to the date column. It also reopened the line-start
  // markers this function deliberately leaves alone — a heading or a code
  // block on the second line — which is the other half of why "this text never
  // starts a line" was only true of where it was being used. CommonMark ends a
  // line at CR as well as LF, and YAML's "\r" escape delivers a bare CR.
  return entities(text).replace(/\s*[\r\n]+\s*/g, " ").replace(/([\\`*_[\]~|])/g, "\\$1")
}

function mdEscapeProse(text: string): string {
  return entities(text)
    .replace(/\r\n?/g, "\n")
    // Backticks and pipes anywhere, not only at line start: a backtick pair made
    // a code span, which decodes nothing, so `<tag>` printed as `&lt;tag&gt;`;
    // and rows of pipes over a `| --- |` line made a GFM table.
    .replace(/([\\`[\]|])/g, "\\$1")
    // Per line, because section() puts the first one at column zero and a
    // contributor newline puts the rest there too. Indentation goes first: it
    // means nothing in a description, and four spaces of it make a code block.
    // Then the first character is escaped whenever it can open a block —
    // heading, list item, setext underline, thematic break, fence — whatever
    // follows it: requiring a space after it let `===` and a lone `-` (both turn
    // the line above into a heading) and an unclosed `~~~` through. An
    // ordered-list marker takes the backslash on its `.` or `)`, because one
    // before a digit is printed.
    .split("\n")
    .map(line =>
      line
        .replace(/^[ \t]+/, "")
        .replace(/^([#+\-*=_~])/, "\\$1")
        .replace(/^(\d+)([.)])(?=\s|$)/, "$1\\$2"),
    )
    .join("\n")
}

function mdHeading(text: string): string {
  return mdEscape(text).replace(/#/g, "\\#")
}

function mdUrl(url: string): string {
  // Written as an autolink, `<https://…>`. A bare URL is still Markdown:
  // `https://x.example/**verified**` rendered <strong> under CommonMark, and
  // GFM's autolink literal trims an unmatched trailing `)`, sending
  // `https://x.example)` to a different host than the one the URL names.
  // Inside `<…>` there is no emphasis, no entity decoding, no backslash escape
  // and no trimming, so the text and the link are both the URL, in every
  // renderer measured (commonmark.js, GFM via micromark, markdown-it).
  //
  // What an autolink cannot hold is whitespace, `<` or `>`, so those are
  // percent-encoded, with `[`, `]`, backslash and backtick. The schema's URL
  // patterns make the rest true before a value gets here: an absolute
  // lowercase http(s) URL in printable ASCII, no backslash, no character
  // reference (a data bug), and an authority that is only a lowercase ASCII
  // domain name of at most 253 characters: no port, no IP address and no
  // `xn--` label. So the host shown is the host a URL parser reaches, byte
  // for byte. Every looser host let some renderer show another one (a
  // 259-character one dropped, `%61` decoded into the shown host, `!` split
  // off with the port, `0x7f.1` shown for 127.0.0.1, punycode shown as a
  // Unicode look-alike, `Flippa.com` and `:443` normalised away). Anything
  // else — only possible if the schema was bypassed — is printed bare rather
  // than given angle brackets, because `<foo>` without a scheme is an HTML
  // tag and `<javascript:…>` is a link.
  const out = String(url).replace(/[\s<>[\]\\`]/g, encodeURIComponent)
  return /^https?:\/\/[^/?#]/.test(out) ? `<${out}>` : out
}

function entities(text: string): string {
  // String(): YAML can put a number where the type says string, and the
  // template literals these calls replaced coerced it instead of throwing.
  return String(text)
    // Only an `&` that would start a character reference, so `&lt;` reads as
    // typed and no `&#` reaches the output. A bare `&` is text in CommonMark:
    // escaping every one put `&amp;` on 412 lines of today's output, "HR &amp;
    // Recruiting" in an H1 among them, for no structural gain.
    .replace(/&(?=#|[A-Za-z][A-Za-z0-9]*;)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
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
  // Clamping runs after escaping, so the cut can land between a backslash and
  // the character it escapes, leaving a stray `\` in a published file. Drop a
  // trailing odd-length backslash run. Escaping after clamping is not the fix:
  // the budget has to measure the bytes actually written.
  const trimmed = out.trimEnd()
  const trailing = /\\*$/.exec(trimmed)![0].length
  const safe = trailing % 2 === 1 ? trimmed.slice(0, -1) : trimmed
  return `${safe}\u2026`
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
  return date ? `checked ${date[1]}` : `checked ${mdEscape(raw)}`
}

// ---------- Network pages ---------------------------------------------------
// Category pages are lists now: see bestListMd.

function networkMd(label: string, list: Program[]): string {
  const verified = list.filter(listedVerified)
  const sorted = [...verified, ...list.filter(p => !listedVerified(p))]

  return joinSections([
    // Same H1 as the HTML page: the display name, never the stored slug.
    `# ${mdHeading(networkHeading(label))}`,
    `> ${programCount(list.length)}, ${verified.length} verified by OpenAffiliate.`,
    [
      `Verified programs are listed first. Everything below the verified block is`,
      `community-submitted and unconfirmed.`,
    ].join("\n"),
    section("Programs", sorted.map(row).join("\n")),
    section("Links", [
      `HTML: ${BASE}/networks/${networkToSlug(label)}`,
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
        `- [Rankings of verified programs by commission](${BASE}/rankings.md)`,
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
    .filter(listedVerified)
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
      `> The ${programCount(verified.length)} OpenAffiliate has checked against the`,
      `> program's own page, highest Affiliate Score first. The other`,
      `> ${livePrograms.length - verified.length} live programs are community-submitted`,
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
        `- [All ${programCount(livePrograms.length)}, grouped by category](${BASE}/programs.md)`,
        `- [Every program in full](${BASE}/llms-full.txt)`,
      ].join("\n"),
    ),
  ])
}

export function llmsTxt(): string {
  const verified = programs.filter(listedVerified)

  const catLines = categories
    .map(c => {
      const inCat = livePrograms.filter(p => p.category === c)
      const v = inCat.filter(listedVerified).length
      return `- [${mdEscape(c)}](${BASE}/categories/${categoryToSlug(c)}.md) — ${programCount(inCat.length)}, ${v} verified`
    })
    .join("\n")

  // A to Z by display name, in-house last: the homepage band's order (networksByName).
  const netLines = [...liveNetworks]
    .sort((a, b) => Number(a === IN_HOUSE) - Number(b === IN_HOUSE) || byNetworkName(a, b))
    .map(n => {
      const inNet = livePrograms.filter(p => (p.network ?? IN_HOUSE) === n)
      return `- [${mdEscape(networkName(n))}](${BASE}/networks/${networkToSlug(n)}.md) — ${programCount(inNet.length)}`
    })
    .join("\n")

  return joinSections([
    `# OpenAffiliate`,
    [
      `> The open registry of affiliate programs. ${programCount(livePrograms.length)} across`,
      `> ${categories.length} categories, each with machine-readable guidance on when`,
      `> it is worth recommending.`,
    ].join("\n"),
    section("When to use OpenAffiliate", [
      `- Find affiliate programs for a product or niche; compare commission, cookie and payout terms before recommending one.`,
      `- Read a program's agentPrompt, restrictions and verification date before recommending it. Cite its program page and link its signup URL for applications.`,
      `- Call MCP at ${BASE}/mcp (search_programs, get_program, list_categories).`,
      `- Follow the [OpenAffiliate skill](${BASE}/skill/SKILL.md); discover it through the [agent-skills index](${BASE}/.well-known/agent-skills/index.json) or the [ARD catalog](${BASE}/.well-known/ard.json).`,
      `- Use REST: GET /api/programs, GET /api/programs/{slug}, GET /api/categories. [OpenAPI 3.1 schema](${BASE}/openapi.json).`,
      `- REST sends API-Version: 1. Breaking changes need a new version; deprecations get Deprecation and Sunset headers 90+ days ahead.`,
      `- Fetch /index.md or append .md to a program, category or network URL. Pages with a Markdown twin also accept Accept: text/markdown.`,
    ].join("\n")),
    // Stated up front, not buried. An agent weighting this surface deserves to
    // know how much of it has actually been checked.
    [
      `## Data quality`,
      ``,
      `${verified.length} of ${programCount(livePrograms.length)} (${((verified.length / livePrograms.length) * 100).toFixed(1)}%)`,
      `have been verified by OpenAffiliate. The rest are community-submitted and`,
      `unconfirmed: the commission rate comes from the submitter and has not been`,
      `checked against the program page, and their cookie window, payout and`,
      `approval terms are left out until it is.`,
      ``,
      `Every program file states its own status and verification date at the top.`,
      `Prefer verified entries when accuracy matters, and cite the program's`,
      `signup URL rather than this registry for anything a reader will act on.`,
    ].join("\n"),
    section(
      "Freshness",
      [
        `${freshnessLine(sitePrograms)}.`,
        ``,
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
        `- [Best affiliate programs, and every ranked list](${BASE}/best.md)`,
        `- [Blog: guides and ranked lists, newest first](${BASE}/blog.md)`,
        `- [All programs A to Z](${BASE}/programs/a-z.md)`,
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
      `> Every one of the ${programCount(livePrograms.length)}, in full. Generated from the same`,
      `> registry the website reads. For the short version see ${BASE}/llms.txt,`,
      `> and for just the checked ones ${BASE}/verified.md.`,
    ].join("\n"),
    [
      `${programCount(programs.filter(listedVerified).length)} ${programs.filter(listedVerified).length === 1 ? "is" : "are"} verified by OpenAffiliate.`,
      `The rest are community-submitted and unconfirmed — each states its own`,
      `status below.`,
    ].join("\n"),
  ])

  const sorted = [...livePrograms.filter(listedVerified), ...livePrograms.filter(p => !listedVerified(p))]
  // Not counted above: no program to join, or a status nobody could confirm.
  const notLive = programs.filter(p => !isLive(p))
  const tail = notLive.length
    ? "\n---\n\n" + joinSections([
        section(
          "Not live",
          [
            `No affiliate program to join, or its status is unclear. Each page says which, and why.`,
            ``,
            ...notLive.map(p => `- [${mdEscape(p.name)}](${BASE}/programs/${p.slug}.md)${statusMark(p)}`),
          ].join("\n"),
        ),
      ])
    : ""
  return header + "\n" + sorted.map(programMd).join("\n---\n\n") + tail
}

// ---------- programs.md index ----------------------------------------------

function programsIndexMd(): string {
  // 760 rows in one file is ~150KB and useless to skim. Group by category and
  // link out; llms-full.txt is where everything lives.
  const blocks = categories
    .map(c => {
      const inCat = livePrograms.filter(p => p.category === c)
      if (!inCat.length) return null
      const v = inCat.filter(listedVerified)
      const sorted = [...v, ...inCat.filter(p => !listedVerified(p))]
      const shown = sorted.slice(0, 15)
      const more =
        sorted.length > shown.length
          ? `\n- … ${sorted.length - shown.length} more in [${mdEscape(c)}](${BASE}/categories/${categoryToSlug(c)}.md)`
          : ""
      return `### ${mdHeading(c)}\n\n${programCount(inCat.length)}, ${v.length} verified.\n\n${shown.map(row).join("\n")}${more}`
    })
    .filter(Boolean)
    .join("\n\n")

  return joinSections([
    `# All affiliate programs`,
    [
      `> ${programCount(livePrograms.length)} across ${categories.length} categories.`,
      `> ${livePrograms.filter(listedVerified).length} verified by OpenAffiliate; the rest are`,
      `> community-submitted and unconfirmed.`,
    ].join("\n"),
    [
      `Verified programs are listed first within each category. Full detail for`,
      `every program is at ${BASE}/llms-full.txt.`,
    ].join("\n"),
    blocks,
  ])
}

// ---------- /blog and /programs/a-z (redesign r3) ---------------------------

/** The /blog index: the same entries, in the same order, as the page (blog.ts). */
export function blogMd(): string {
  const { posts, lists } = blogEntries()
  const row = (e: BlogEntry, meta: string) => `- [${mdEscape(e.title)}](${BASE}${e.href}.md) — ${meta}`
  return joinSections([
    `# Guides and ranked lists`,
    `> ${posts.length} posts and ${lists.length} ranked lists, newest first. Every figure comes from the registry; each list is rebuilt from it at every build.`,
    section("Posts", posts.map(e => row(e, `${e.programs} picks${e.date ? `, checked ${e.date}` : ""}`)).join("\n")),
    section("Ranked lists", lists.map(e => row(e, `${programCount(e.programs)}, ${e.verified} verified${e.date ? `, last checked ${e.date}` : ""}`)).join("\n")),
    section("Links", [`HTML: ${BASE}/blog`, `Registry entry point: ${BASE}/llms.txt`].join("\n")),
  ])
}

/** /programs/a-z: every live program by name, in the page's directory order. */
export function programsAzMd(): string {
  const groups = directoryGroups(sitePrograms)
  return joinSections([
    `# All affiliate programs A to Z`,
    `> ${programCount(livePrograms.length)}, by name. Grouped by category with terms: ${BASE}/programs.md`,
    ...groups.map(g =>
      section(
        g.letter === "#" ? "0-9 and other" : g.letter.toUpperCase(),
        g.programs.map(p => `- [${mdEscape(p.name)}](${BASE}/programs/${p.slug}.md)`).join("\n"),
      ),
    ),
    section("Links", [`HTML: ${BASE}/programs/a-z`, `Registry entry point: ${BASE}/llms.txt`].join("\n")),
  ])
}

// ---------- Pages that were HTML-only ---------------------------------------

function indexMd(): string {
  return joinSections([
    `# OpenAffiliate`,
    [
      `> The open registry of affiliate programs. Built for developers and AI agents.`,
      `> ${freshnessLine(sitePrograms)}.`,
    ].join("\n"),
    section(
      "Read this as an agent",
      [
        `- [Entry point](${BASE}/llms.txt)`,
        `- [Full registry](${BASE}/llms-full.txt)`,
        `- [All programs](${BASE}/programs.md)`,
        `- [Verified programs](${BASE}/verified.md)`,
        `- [Rankings](${BASE}/rankings.md)`,
        `- [Blog](${BASE}/blog.md)`,
        `- [Changelog](${BASE}/changelog.md)`,
        `- [One program](${BASE}/programs/vercel.md)`,
        `- HTML home: ${BASE}/`,
      ].join("\n"),
    ),
  ])
}

function rankingsMd(): string {
  // The HTML table's three lists: a percentage and a dollar amount are never ranked against each other.
  const ranked = sitePrograms.filter((p) => isLive(p) && p.verified)
  const inGroup = (g: CommissionGroup) => {
    const list = ranked.filter((p) => commissionGroup(p.commission) === g)
    return g === "other" ? list.sort((a, b) => compareText(a.name, b.name)) : list.sort((a, b) => compareCommissionFigure(a, b))
  }
  const programLines = (g: CommissionGroup) => inGroup(g)
    .map((p, i) => {
      const terms = [
        `${commissionDisplay(p.commission)} ${p.commission.type}`,
        `recurring: ${recurringText(recurringMonths(p.commission)).toLowerCase()}`,
        `cookie: ${p.cookieDays != null ? `${p.cookieDays} days` : "not published"}`,
        `payout minimum: ${(payoutMinText(p.payout.minimum, p.payout.currency) ?? "not published").toLowerCase()}`,
        ...(p.lastVerifiedAt ? [`checked ${p.lastVerifiedAt.slice(0, 10)}`] : []),
      ]
      return `${i + 1}. [${mdEscape(p.name)}](${BASE}/programs/${p.slug}.md) — ${mdEscape(terms.join(", "))}`
    })
    .join("\n")
  // Rates and flat payouts stay apart, as on the HTML tabs (commissionStats).
  // Unconfirmed figures count, so each line says which: the average with how
  // many of its rates are unconfirmed, a named program with "unconfirmed".
  const paidBy = (label: string, x: PaidBy | null, flat: boolean) =>
    x
      ? [`${label} ${formatCommissionDisplay(x.value, flat)} ([${mdEscape(x.program.name)}](${BASE}/programs/${x.program.slug}.md)${termsConfirmed(x.program) ? "" : ", unconfirmed"})`]
      : []
  const groupFigures = (s: CommissionStats) => [
    ...(s.avgRate != null ? [`average rate ${formatCommissionDisplay(s.avgRate, false)} across ${rateBasis(s)}`] : []),
    ...paidBy("top rate", s.topRate, false),
    ...paidBy("top flat payout", s.topFlatUsd, true),
  ]
  const networkLines = getNetworkStats()
    .map(n => `- [${mdEscape(networkName(n.network))}](${BASE}/networks/${networkToSlug(n.network)}.md) — ${[programCount(n.programCount), ...groupFigures(n)].join(", ")}`)
    .join("\n")
  const categoryLines = getCategoryStats()
    .map(c => `- [${mdEscape(c.category)}](${BASE}/categories/${categoryToSlug(c.category)}.md) — ${[programCount(c.programCount), ...groupFigures(c)].join(", ")}`)
    .join("\n")

  // The OAS leaderboard leads the HTML page once oas-scores.json has entries; empty, it adds nothing.
  const board = buildBoard(oasScores, sitePrograms.filter(isLive), new Date())
  const report = (slug: string) => `${BASE}/programs/${slug}/oas`
  const oasLines = board.length
    ? [
        ...board.filter((r) => r.rank != null).map((r) => `${r.rank}. [${mdEscape(r.program.name)}](${report(r.program.slug)}) — OAS ${r.oas}/100 (${oasGrade(r.oas!)}), ${mdEscape(r.program.category)}`),
        "",
        ...board.filter((r) => r.rank == null).map((r) => `- [${mdEscape(r.program.name)}](${report(r.program.slug)}) — ${r.oas != null ? `OAS ${r.oas}/100, ` : ""}${UNRANKED_TEXT[r.unranked!]}`),
        "",
        `OAS, the OpenAffiliate Score, measures how clearly a program publishes its terms and protects its partners, from the terms verified on its own page; nobody pays to rank. Every program is ranked by the same rules, whoever runs it. Equal scores share a rank. ${TEAM_DISCLOSURE}`,
      ].join("\n")
    : null

  return joinSections([
    `# Affiliate program rankings`,
    [
      ...(board.length ? [`> Ranked by OAS first, the full list at ${BASE}/rankings/leaderboard.md; the commission lists below are ${BASE}/rankings/commission.`, `>`] : []),
      `> ${ranked.length} verified programs, every figure checked on the brand's own`,
      `> terms page, in the three lists of ${board.length ? `${BASE}/rankings/commission` : `${BASE}/rankings`}: a percentage of the`,
      `> sale and a flat US-dollar amount, each highest first (on a tie, the one`,
      `> that recurs longer first), then tiered, hybrid, unpublished and other`,
      `> rewards A to Z. The table there can also sort by how long the commission`,
      `> recurs, cookie length, payout minimum or check date.`,
      `>`,
      `> Network and category figures keep percentage rates and flat US-dollar`,
      `> payouts apart. Credit and gift-card rewards, tiered and hybrid deals,`,
      `> flat amounts in other currencies and unpublished rates count in neither;`,
      `> a percentage counts in any currency. Unconfirmed figures count and are`,
      `> marked "unconfirmed".`,
    ].join("\n"),
    section("Ranked by OAS", oasLines),
    section("Programs paying a percentage of the sale", programLines("percent")),
    section("Programs paying a flat amount", programLines("flat")),
    section("Tiered, hybrid and other commissions", programLines("other")),
    section("Networks", networkLines),
    section("Categories", categoryLines),
    section("Links", [`HTML: ${BASE}/rankings`, ...(board.length ? [`Leaderboard: ${BASE}/rankings/leaderboard`, `By commission: ${BASE}/rankings/commission`] : [])].join("\n")),
  ])
}

/**
 * /rankings/leaderboard: the whole OAS board in /rankings order (OAS high to
 * low, equal scores A to Z), then the programs still scoring. Empty while
 * oas-scores.json has no entries, like the page.
 */
export function leaderboardMd(): string | null {
  const live = sitePrograms.filter(isLive)
  const board = buildBoard(oasScores, live, new Date())
  if (!board.length) return null
  const bySlug = new Map(live.map((p) => [p.slug, p]))
  const report = (slug: string) => `${BASE}/programs/${slug}/oas`
  const facts = (slug: string) => {
    const p = bySlug.get(slug)!
    let domain = ""
    try {
      domain = new URL(p.url).hostname.replace(/^www\./, "")
    } catch {}
    return [domain, p.category, networkName(p.network ?? IN_HOUSE), p.lastVerifiedAt ? `verified ${p.lastVerifiedAt.slice(0, 10)}` : null]
      .filter(Boolean)
      .map((x) => mdEscape(String(x)))
      .join(" · ")
  }
  const ranked = board.filter((r) => r.rank != null)
  const rest = board.filter((r) => r.rank == null)
  return joinSections([
    "# OAS leaderboard",
    "> Every scored affiliate program ranked by OAS, the OpenAffiliate Score: how clearly a program publishes its terms and protects its partners, from the terms verified on its own page. Equal scores share a rank and are listed A to Z. Nobody pays to rank.",
    section(`Ranked (${ranked.length})`, ranked.map((r) => `${r.rank}. [${mdEscape(r.program.name)}](${report(r.program.slug)}) — OAS ${r.oas}/100 (${oasGrade(r.oas!)}) · ${facts(r.program.slug)}`).join("\n")),
    rest.length ? section(`Not ranked yet (${rest.length})`, rest.map((r) => `- [${mdEscape(r.program.name)}](${report(r.program.slug)}) — ${UNRANKED_TEXT[r.unranked!]} · ${facts(r.program.slug)}`).join("\n")) : null,
    section("Links", [`HTML: ${BASE}/rankings/leaderboard`, `By category: ${BASE}/rankings/leaderboard?category=<category-slug>`, `Rankings: ${BASE}/rankings.md`].join("\n")),
  ])
}

// ---------- Best-of lists --------------------------------------------------

/**
 * Same rows, intro and FAQ as the list's page, from the same builder. The hub
 * (/best, written to best.md) is the one llms.txt points at, and it links every
 * other list, so adding a list never grows the index.
 */
function bestListMd(list: BestList, path: string): string {
  const data = buildBestList(list)
  const { intro, faq } = bestListCopy(data, mdEscape)
  const rows = data.rows
    .map((p, i) => {
      const cookie = termsConfirmed(p) && p.cookieDays != null ? `, ${p.cookieDays}d cookie` : ""
      // A referral reward keeps its published wording, as the page does.
      const terms =
        p.kind === "referral"
          ? [listCommissionText(p), p.commission.type, p.commission.duration ? `for ${p.commission.duration}` : null]
              .filter(Boolean)
              .join(" ")
          : commissionLine(p.commission)
      // The page's columns, in its order: commission, type, duration, cookie,
      // network, then the program page's apply link with the list UTM, as the page shows it.
      const facts = mdEscape(`${terms}${cookie}, network: ${networkName(p.network ?? IN_HOUSE)}`)
      return `${i + 1}. [${mdEscape(p.name)}](${BASE}/programs/${p.slug}.md) — ${facts}${statusMark(p)}, sign up: ${mdUrl(applyButton(p, "list").href)}`
    })
    .join("\n")
  return joinSections([
    // A category list's H1, criteria and FAQ carry the category name, which
    // no enum guards; bestListCopy escaped the FAQ's share of it.
    `# ${mdHeading(list.h1)}`,
    `> ${intro}`,
    [
      `How we picked: ${mdEscape(list.criteria)} ${mdEscape(list.rules ?? SHARED_RULES)}`,
      data.checked ? `Verified ${mdEscape(data.checked)}: ${VERIFIED_NOTE}` : null,
    ].filter(Boolean).join("\n\n"),
    section("Programs", rows),
    section("FAQ", faq.map(f => `### ${f.q.replace(/#/g, "\\#")}\n\n${f.a}`).join("\n\n")),
    section(
      "Other lists",
      otherLists(list)
        .map(l => {
          const other = buildBestList(l)
          return `- [${l.h1}](${BASE}${bestPath(l)}.md) — ${programCount(other.total)}, ${other.verified.length} verified`
        })
        .join("\n"),
    ),
    section("Links", [
      `HTML: ${BASE}${path}`,
      `All categories: ${BASE}/categories`,
      `Registry entry point: ${BASE}/llms.txt`,
    ].join("\n")),
  ])
}

/**
 * The twin of an editorial post: the same programs as the page (postSelection
 * as of the build), every figure from structured fields, each Apply link the
 * page's blogApplyHref.
 */
function bestPostMd(post: BestPost, selection: PostSelection, path: string): string {
  const range = checkedRange(selection)
  const rows = selection.shown
    .map(({ program: p, copy }, i) => {
      const facts = mdEscape(`you earn ${earnText(p)}, cookie: ${cookieText(p)}, payout: ${payoutText(p)}, terms checked ${checkedText(p)}`)
      return [
        `${i + 1}. [${mdEscape(p.name)}](${BASE}/programs/${p.slug}.md) — ${mdEscape(copy.bestFor)}. ${facts}, apply: ${mdUrl(blogApplyHref(p, post.slug))}`,
        `   ${mdEscapeProse(copy.why)}${copy.notFor ? ` Not for: ${mdEscapeProse(copy.notFor)}` : ""}`,
      ].join("\n")
    })
    .join("\n")
  const faq = postFaq(post, selection, mdEscape)
  return joinSections([
    `# ${mdHeading(postTitle(post, selection))}`,
    range ? `By the OpenAffiliate team · Terms checked between ${range[0]} and ${range[1]}` : null,
    `> ${mdEscapeProse(post.intro)}`,
    DISCLOSURE,
    section("Programs", rows),
    section(
      "How we chose",
      [`${mdEscapeProse(post.howWeChose)} ${FRESHNESS_RULE}`, ...(post.leftOut ?? []).map(l => `Left out: ${mdEscape(l.name)}, ${mdEscapeProse(l.reason)}`)].join("\n\n"),
    ),
    faq.length ? section("FAQ", faq.map(f => `### ${f.q.replace(/#/g, "\\#")}\n\n${f.a}`).join("\n\n")) : null,
    section("Links", [`HTML: ${BASE}${path}`, `All lists: ${BASE}/best.md`, `Registry entry point: ${BASE}/llms.txt`].join("\n")),
  ].filter((x): x is string => Boolean(x)))
}

/** The twin of a guide (/blog/<slug>): the page's text, its registry facts and programs, each Apply link the page's blogApplyHref. */
function guideMd(g: GuidePost): string {
  const selection = guideSelection(g)
  const f = registryFacts()
  const count = (t: string) => f.byType.find(x => x.type === t)?.count ?? 0
  const facts = [
    `- Pay a recurring commission: ${count("recurring")} of ${f.verified}`,
    `- Pay for the customer's lifetime: ${f.lifetime} of ${f.verified}`,
    `- Pay once per sale: ${count("one-time")} of ${f.verified}`,
    f.cookie ? `- Publish a cookie window: ${f.cookie.published} of ${f.verified}` : null,
    f.cookie ? `- Median cookie window: ${f.cookie.median} days` : null,
    f.cookie ? `- Middle half of cookie windows: ${f.cookie.p25} to ${f.cookie.p75} days` : null,
    `- Approve every applicant automatically: ${f.approval.auto} of ${f.verified}`,
    `- Review applications by hand: ${f.approval.manual} of ${f.verified}`,
    `- Pay by PayPal: ${f.payout.paypal} of ${f.verified}`,
  ].filter(Boolean).join("\n")
  const sections = g.sections.map(s =>
    section(
      s.heading,
      [
        ...s.paragraphs.map(mdEscapeProse),
        ...(s.steps ?? []).map((st, i) => `${i + 1}. **${mdEscape(st.title)}.** ${mdEscapeProse(st.text)}${st.link ? ` [${mdEscape(st.link.label)}](${BASE}${st.link.href})` : ""}`),
      ].join("\n\n"),
    ),
  )
  const rows = selection.shown
    .map(({ program: p, copy }, i) => {
      const terms = mdEscape(`you earn ${earnText(p)}, cookie: ${cookieText(p)}, payout: ${payoutText(p)}, terms checked ${checkedText(p)}`)
      return [
        `${i + 1}. [${mdEscape(p.name)}](${BASE}/programs/${p.slug}.md) — ${mdEscape(copy.bestFor)}. ${terms}, apply: ${mdUrl(blogApplyHref(p, g.slug))}`,
        `   ${mdEscapeProse(copy.why)}${copy.notFor ? ` Not for: ${mdEscapeProse(copy.notFor)}` : ""}`,
      ].join("\n")
    })
    .join("\n")
  return joinSections([
    `# ${mdHeading(guideTitle(g))}`,
    `By the OpenAffiliate team · Updated ${g.checked}`,
    `> ${mdEscapeProse(g.answer)}`,
    DISCLOSURE,
    sections[0] ?? null,
    section("What the registry shows", `Verified programs in the OpenAffiliate registry, terms checked up to ${f.asOf}.\n\n${facts}`),
    ...sections.slice(1),
    rows ? section("Programs to start with", `${mdEscapeProse(g.programsIntro)}\n\n${rows}`) : null,
    g.rules.length ? section("Rules that trip people up", [mdEscapeProse(g.rulesIntro), ...g.rules.map(r => `- ${mdEscapeProse(r.text)} [Terms](${BASE}/programs/${r.slug}.md)`)].join("\n\n")) : null,
    section("Disclose every affiliate link", `${mdEscapeProse(g.disclosure)} Source: [${mdEscape(DISCLOSURE_SOURCE.label)}](${DISCLOSURE_SOURCE.href})`),
    g.faq.length ? section("FAQ", g.faq.map(q => `### ${q.q.replace(/#/g, "\\#")}\n\n${mdEscapeProse(q.a)}`).join("\n\n")) : null,
    section("Links", [`HTML: ${BASE}${guidePath(g)}`, `All guides and lists: ${BASE}/blog.md`, `Registry entry point: ${BASE}/llms.txt`].join("\n")),
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
    const summary = entry.summary ? `${entry.summary}\n\n` : ""
    const link = entry.link ? `\n\n${entry.link.label}: ${BASE}${entry.link.href}` : ""
    return `## ${entry.date} · ${entry.title}\n\n${summary}${items}${link}`
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
  generateSkills(process.cwd())
  generateArd(process.cwd())
  // Clear previous output so a renamed or retired program cannot leave a file
  // behind that keeps answering as current — worse than a 404.
  for (const dir of ["programs", "categories", "networks", "best", "blog", "rankings"]) {
    rmSync(join(OUT, dir), { recursive: true, force: true })
  }

  write("llms.txt", llmsTxt())
  write("verified.md", verifiedMd())
  write("llms-full.txt", llmsFullTxt())
  write("programs.md", programsIndexMd())
  write("docs.md", docsMd())
  write("index.md", indexMd())
  write("rankings.md", rankingsMd())
  const leaderboard = leaderboardMd()
  if (leaderboard) write("rankings/leaderboard.md", leaderboard)
  write("changelog.md", changelogMd())
  write("blog.md", blogMd())
  for (const g of GUIDES) write(`${guidePath(g).slice(1)}.md`, guideMd(g))
  for (const list of BEST_LISTS) {
    const post = getPost(list.slug)
    const selection = post ? postSelection(post) : null
    write(
      `${bestPath(list).slice(1)}.md`,
      post && selection && postReady(selection) ? bestPostMd(post, selection, bestPath(list)) : bestListMd(list, bestPath(list)),
    )
  }

  for (const p of programs) {
    write(`programs/${p.slug}.md`, programMd(p))
  }
  // After the program twins: programs/ is cleared above, and no program has the slug "a-z".
  write("programs/a-z.md", programsAzMd())

  // Category twins come from the same builder as the category pages, so the
  // order, intro and FAQ match the HTML.
  for (const c of categories) {
    write(`categories/${categoryToSlug(c)}.md`, bestListMd(categoryList(c), `/categories/${categoryToSlug(c)}`))
  }

  // Live networks only, the same set that gets an HTML page.
  const networks = liveNetworks
  for (const n of networks) {
    const inNet = livePrograms.filter(p => (p.network ?? IN_HOUSE) === n)
    write(`networks/${networkToSlug(n)}.md`, networkMd(n, inNet))
  }

  // Proxy needs only paths, not registry data or Markdown bodies in its bundle.
  // Discover HTML routes from source so unsupported pages retain their HTML response.
  const app = join(process.cwd(), "src/app")
  const appFiles = readdirSync(app, { recursive: true }).map(String)
  const publicFiles = readdirSync(OUT, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(OUT.length))
  const html = appFiles
    .filter((path) => path.endsWith("page.tsx"))
    .map((path) => "/" + path.replace(/(^|\/)page\.tsx$/, "").replace(/\/$/, ""))
  const handlers = appFiles.filter((path) => path.endsWith("route.ts"))
    .map((path) => "/" + path.replace(/(^|\/)route\.ts$/, ""))
  // Next's file-based metadata endpoints are not route.ts files.
  handlers.push("/robots.txt", "/sitemap.xml", "/favicon.ico", "/opengraph-image", "/programs/[slug]/opengraph-image")
  const manifest = {
    markdown: publicFiles.filter((path) => path.endsWith(".md")).sort(),
    html: html.sort(),
    assets: publicFiles.filter((path) => !path.endsWith(".md")).sort(),
    handlers: handlers.sort(),
  }
  writeFileSync(join(process.cwd(), "src/lib/agentic-paths.json"), JSON.stringify(manifest, null, 2) + "\n")

  const verified = programs.filter(listedVerified).length
  console.log(`Markdown surface generated:`)
  console.log(`  ${written} files`)
  console.log(`  ${programCount(livePrograms.length)} live (${verified} verified, ${livePrograms.length - verified} unverified), ${programs.length - livePrograms.length} not live`)
  console.log(`  ${categories.length} categories, ${networks.length} networks`)
  console.log(`  Output: public/`)
}

// Only when run as a script, so a test can import programMd without writing public/.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
