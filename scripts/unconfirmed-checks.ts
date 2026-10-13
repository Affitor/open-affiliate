/**
 * Checks that an unverified program shows no cookie window, payout or approval
 * and marks its commission unconfirmed, and that a verified program still shows
 * all three (src/lib/confirmed-terms.ts). Pure functions returning problems, so
 * verify-machine-surfaces can also feed them a mutated page and require a
 * failure: a check that cannot fail proves nothing.
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
 * The program's own markup: no scripts or styles, and no cards linking other
 * programs (related programs show their own terms).
 */
function ownHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<a [^>]*href="\/programs\/[a-z0-9-]+"[^>]*>[\s\S]*?<\/a>/g, " ")
}

function text(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ")
}

/** /programs/<slug> as served. */
export function termsHtmlProblems(p: Program, html: string): string[] {
  const own = ownHtml(html)
  const seen = text(own)
  const problems: string[] = []
  if (termsConfirmed(p)) {
    if (seen.includes(UNCONFIRMED_NOTE)) problems.push("marks verified terms unconfirmed")
    if (p.cookieDays != null) {
      const badge = p.cookieDays === 0 ? "Code-based, no cookie" : `${p.cookieDays}d cookie`
      const row = p.cookieDays === 0 ? "Cookie None (code-based)" : `Cookie ${p.cookieDays} days`
      if (!seen.includes(badge) || !seen.includes(row)) problems.push(`does not show its cookie window (${p.cookieDays} days)`)
    }
    if (p.payout.minimum != null && !seen.includes(`Min payout $${p.payout.minimum}`)) problems.push("does not show its minimum payout")
    if (p.approval && ["auto", "manual", "invite-only"].includes(p.approval) && !own.includes("lucide-zap")) {
      problems.push("does not show its approval")
    }
    return problems
  }
  if (!seen.includes(UNCONFIRMED_NOTE)) problems.push(`does not mark its commission "${UNCONFIRMED_NOTE}"`)
  if (COOKIE_BADGE.test(seen)) problems.push(`shows a cookie window ("${COOKIE_BADGE.exec(seen)![0]}")`)
  for (const label of ["Cookie not published", "Code-based, no cookie", "Min payout", "Payment methods", "Approval time"]) {
    if (seen.includes(label)) problems.push(`shows "${label}"`)
  }
  if (/\bCookie (?:\d+ days|None \(code-based\)|Not published)/.test(seen)) problems.push("shows a Cookie row")
  if (/>Frequency<\/span>/.test(own)) problems.push("shows a payout frequency")
  if (/>Approval<\/p>/.test(own) || own.includes("lucide-zap")) problems.push("shows an approval")
  return problems
}

/** programs/<slug>.md, as generate-md writes it. */
export function termsMdProblems(p: Program, md: string): string[] {
  const lines = md.split("\n")
  const has = (prefix: string) => lines.some((l) => l.startsWith(prefix))
  const problems: string[] = []
  if (termsConfirmed(p)) {
    if (md.includes(UNCONFIRMED_NOTE)) problems.push("marks verified terms unconfirmed")
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
  if (COOKIE_BADGE.test(md)) problems.push(`shows a cookie window ("${COOKIE_BADGE.exec(md)![0]}")`)
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
