/**
 * Checks that an unverified program shows no cookie window, payout or approval
 * and marks its commission unconfirmed, and that a verified program still shows
 * all three (src/lib/confirmed-terms.ts). Pure functions returning problems, so
 * verify-machine-surfaces can also feed them a mutated page and require a
 * failure: a check that cannot fail proves nothing.
 *
 * They read the markup and lines the page and generate-md write for terms, not
 * free text: a description saying "Payment methods are not specified" or
 * "60-day cookie" is contributor prose, which rendering does not parse.
 */
import { termsConfirmed, UNCONFIRMED_NOTE } from "../src/lib/confirmed-terms"
import type { Program } from "../src/lib/programs"

/** Fields the API leaves out for an unverified program; `payout` stays as {}. */
export const HIDDEN_API_KEYS = ["cookieDays", "payoutMethods", "approval", "approvalTime"] as const

const COOKIE_BADGE = /\b\d+d cookie\b/

function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
}

/**
 * The program's own markup: no scripts, styles or comments, and no cards
 * linking other programs (related programs show their own terms).
 */
function ownHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<a [^>]*href="\/programs\/[a-z0-9-]+"[^>]*>[\s\S]*?<\/a>/g, " ")
}

/**
 * How the program page writes each term: a badge or row label right after its
 * icon's </svg>, and the How to Join labels as whole <p> elements.
 */
const APPROVAL_BADGE = /<\/svg>(?:Automatic|Manual review|Invite only)<\/div>/
const TERM_MARKUP: [string, RegExp][] = [
  ["a cookie badge", /<\/svg>(?:\d+d cookie(?: \(unconfirmed\))?|Cookie not published|Code-based, no cookie)<\/div>/],
  ["a Cookie row", /<\/svg>Cookie<\/span>/],
  ["a Min payout row", /<\/svg>Min payout<\/span>/],
  ["a Frequency row", /<\/svg>Frequency<\/span>/],
  ["a Payment methods row", /<\/svg>\s*Payment methods<\/span>/],
  ["an approval badge", APPROVAL_BADGE],
  ["an Approval or Approval time field", />Approval(?: time)?<\/p>/],
]

/** /programs/<slug> as served. */
export function termsHtmlProblems(p: Program, html: string): string[] {
  const own = ownHtml(html)
  const marked = decodeEntities(own).includes(`>${UNCONFIRMED_NOTE}<`)
  const problems: string[] = []
  if (termsConfirmed(p)) {
    if (marked) problems.push("marks verified terms unconfirmed")
    if (p.cookieDays != null) {
      const badge = p.cookieDays === 0 ? "Code-based, no cookie" : `${p.cookieDays}d cookie`
      const row = p.cookieDays === 0 ? "None (code-based)" : `${p.cookieDays} days`
      if (!own.includes(`</svg>${badge}</div>`) || !own.includes(`</svg>Cookie</span><span class="text-sm font-semibold">${row}</span>`)) {
        problems.push(`does not show its cookie window (${p.cookieDays} days)`)
      }
    }
    if (p.payout.minimum != null && !own.includes(`</svg>Min payout</span><span class="text-sm font-semibold">$${p.payout.minimum}</span>`)) {
      problems.push("does not show its minimum payout")
    }
    if (p.approval && ["auto", "manual", "invite-only"].includes(p.approval) && !APPROVAL_BADGE.test(own)) {
      problems.push("does not show its approval")
    }
    return problems
  }
  if (!marked) problems.push(`does not mark its commission "${UNCONFIRMED_NOTE}"`)
  for (const [what, markup] of TERM_MARKUP) {
    const hit = markup.exec(own)
    if (hit) problems.push(`shows ${what} (${JSON.stringify(hit[0])})`)
  }
  return problems
}

/** The Terms (or Last known terms) section of a twin: the only place generate-md states terms. */
function termsSection(md: string): string[] {
  const lines = md.split("\n")
  const start = lines.findIndex((l) => l === "## Terms" || l === "## Last known terms")
  if (start === -1) return []
  const end = lines.findIndex((l, i) => i > start && l.startsWith("## "))
  return lines.slice(start + 1, end === -1 ? undefined : end)
}

/** programs/<slug>.md, as generate-md writes it. */
export function termsMdProblems(p: Program, md: string): string[] {
  const lines = termsSection(md)
  if (lines.length === 0) return ["has no Terms section"]
  const has = (prefix: string) => lines.some((l) => l.startsWith(prefix))
  const problems: string[] = []
  if (termsConfirmed(p)) {
    if (lines.includes(UNCONFIRMED_NOTE)) problems.push("marks verified terms unconfirmed")
    if (p.cookieDays != null && !has(`Cookie window: ${p.cookieDays} days`)) problems.push(`does not show its cookie window (${p.cookieDays} days)`)
    if (p.payout.minimum != null && !has("Payout: ")) problems.push("does not show its payout")
    if (p.approval && !has("Approval: ")) problems.push("does not show its approval")
    return problems
  }
  // Right after the Commission line, so the marker sits next to the figure.
  const at = lines.findIndex((l) => l.startsWith("Commission: "))
  if (at === -1 || lines[at + 1] !== UNCONFIRMED_NOTE) problems.push(`does not follow its Commission line with "${UNCONFIRMED_NOTE}"`)
  for (const prefix of ["Cookie window:", "Payout:", "Approval:"]) {
    if (has(prefix)) problems.push(`shows "${prefix}"`)
  }
  const cookie = lines.find((l) => COOKIE_BADGE.test(l))
  if (cookie) problems.push(`shows a cookie window ("${cookie}")`)
  return problems
}

/** A program as GET /api/programs or /api/programs/{slug} returns it. */
export function termsApiProblems(p: Program, body: Record<string, unknown>): string[] {
  const problems: string[] = []
  if (!body.commission || typeof body.commission !== "object") problems.push("has no commission object")
  if (!body.payout || typeof body.payout !== "object") problems.push("has no payout object")
  if (termsConfirmed(p)) {
    if (body.cookieDays !== p.cookieDays) problems.push(`cookieDays is ${JSON.stringify(body.cookieDays)}, stored ${p.cookieDays}`)
    if (JSON.stringify(body.payout) !== JSON.stringify(p.payout)) problems.push("payout differs from the stored payout")
    if (body.approval !== p.approval) problems.push(`approval is ${JSON.stringify(body.approval)}, stored ${p.approval}`)
    return problems
  }
  for (const key of HIDDEN_API_KEYS) if (key in body) problems.push(`returns ${key} (${JSON.stringify(body[key])})`)
  if (JSON.stringify(body.payout) !== "{}") problems.push(`returns payout ${JSON.stringify(body.payout)}`)
  return problems
}
