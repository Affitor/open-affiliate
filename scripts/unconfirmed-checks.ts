/**
 * Checks that an unverified program shows no cookie window, payout or approval,
 * in figures or in prose, and marks its commission unconfirmed; and that a
 * verified program still shows exactly its stored terms
 * (src/lib/confirmed-terms.ts). Pure functions returning problems, so
 * verify-machine-surfaces can also feed them a mutated input and require a
 * failure: a check that cannot fail proves nothing.
 *
 * An unverified page is read whole, scripts included: the JSON-LD and the RSC
 * payload ship to every reader too. Prose is judged sentence by sentence with
 * the same statesTerms() the renderer uses.
 */
import { statesTerms, termsConfirmed, UNCONFIRMED_NOTE } from "../src/lib/confirmed-terms"
import type { Program } from "../src/lib/programs"

/** Fields the API leaves out for an unverified program; `payout` stays as {}. */
export const HIDDEN_API_KEYS = ["cookieDays", "payoutMethods", "approval", "approvalTime"] as const

const COOKIE_BADGE = /\b\d+d cookie\b/
const APPROVAL_LABEL: Record<string, string> = { auto: "Automatic", manual: "Manual review", "invite-only": "Invite only" }
/** A term field serialized as data: a key with a value, quoted (JSON) or not (a JS object literal). */
const SERIALIZED_TERM = /["']?\b(?:cookieDays|cookie_days|payoutMethods|approvalTime|approval_time)\b["']?\s*:\s*(?!null\b|undefined\b|void\b)["'\d[]/

function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
}

/** Sentences of a text, split as confirmedProse splits them. */
function sentences(text: string): string[] {
  return text
    .split("\n")
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * The program's own markup: no comments, and no cards linking other programs
 * (related programs show their own commission). Scripts stay, with the RSC
 * payload's escaped quotes read as plain quotes.
 */
function ownHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<a [^>]*href="\/programs\/[a-z0-9-]+"[^>]*>[\s\S]*?<\/a>/g, " ")
    .replace(/\\"/g, '"')
}

/** The visible text of the page's own markup, one block per element. */
function visibleBlocks(own: string): string[] {
  return decodeEntities(
    own
      .replace(/<script[\s\S]*?<\/script>/g, "\n")
      .replace(/<style[\s\S]*?<\/style>/g, "\n")
      .replace(/<(?:p|div|li|dd|dt|h[1-6]|td|th|span|a|button)\b[^>]*>/g, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .split("\n")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean)
}

/** Every string inside the page's JSON-LD blocks. */
function jsonLdStrings(html: string): string[] {
  const out: string[] = []
  const walk = (v: unknown): void => {
    if (typeof v === "string") out.push(v)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === "object") Object.values(v).forEach(walk)
  }
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      walk(JSON.parse(m[1]))
    } catch {
      out.push(m[1])
    }
  }
  return out
}

/**
 * How the program page writes each term in its markup (a label right after
 * its icon's </svg>, the How to Join fields as whole <p> elements), and the
 * same labels as RSC payload strings.
 */
const TERM_MARKUP: [string, RegExp][] = [
  ["a cookie badge", /(?:<\/svg>|")(?:\d+d cookie(?: \(unconfirmed\))?|Cookie not published|Code-based, no cookie)(?:<\/div>|")/],
  ["a Cookie row", /<\/svg>Cookie<\/span>|"Cookie"/],
  ["a Min payout row", /<\/svg>Min payout<\/span>|"Min payout"/],
  ["a Frequency row", /<\/svg>Frequency<\/span>|"Frequency"/],
  ["a Payment methods row", /<\/svg>\s*Payment methods<\/span>|" ?Payment methods"/],
  ["an approval badge", /(?:<\/svg>|")(?:Automatic|Manual review|Invite only)(?:<\/div>|")/],
  ["an Approval or Approval time field", />Approval(?: time)?<\/p>|"Approval(?: time)?"/],
  ["a serialized term field", SERIALIZED_TERM],
]

/** /programs/<slug> as served. */
export function termsHtmlProblems(p: Program, html: string): string[] {
  const own = ownHtml(html)
  const blocks = visibleBlocks(own)
  const marked = blocks.includes(UNCONFIRMED_NOTE)
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
      problems.push(`does not show its minimum payout ($${p.payout.minimum})`)
    }
    if (p.payout.frequency && !own.includes(`</svg>Frequency</span><span class="text-sm font-semibold"><span class="capitalize">${p.payout.frequency}</span></span>`)) {
      problems.push(`does not show its payout frequency (${p.payout.frequency})`)
    }
    const label = p.approval ? APPROVAL_LABEL[p.approval] : undefined
    if (label && !own.includes(`</svg>${label}</div>`)) problems.push(`does not show its approval (${label})`)
    // How to Join, where the approval time shows, is not rendered for a paused program.
    if (p.approvalTime && p.status !== "paused" && !own.includes(`>Approval time</p><p class="text-sm font-medium">${p.approvalTime}</p>`)) {
      problems.push(`does not show its approval time (${p.approvalTime})`)
    }
    return problems
  }
  if (!marked) problems.push(`does not mark its commission "${UNCONFIRMED_NOTE}"`)
  for (const [what, markup] of TERM_MARKUP) {
    const hit = markup.exec(own)
    if (hit) problems.push(`shows ${what} (${JSON.stringify(hit[0])})`)
  }
  if (COOKIE_BADGE.test(own)) problems.push(`carries a cookie window ("${COOKIE_BADGE.exec(own)![0]}")`)
  // Stored values specific enough to find anywhere: "1-5 business days", not "instant".
  if (p.approvalTime && /\d/.test(p.approvalTime) && own.includes(p.approvalTime)) problems.push(`carries its approval time ("${p.approvalTime}")`)
  const prose = blocks.flatMap(sentences).find(statesTerms)
  if (prose) problems.push(`states a term in prose ("${prose.slice(0, 120)}")`)
  const ld = jsonLdStrings(html).flatMap(sentences).find(statesTerms)
  if (ld) problems.push(`states a term in its JSON-LD ("${ld.slice(0, 120)}")`)
  return problems
}

/** The Terms (or Last known terms) section of a twin: where generate-md states terms. */
function termsSection(lines: string[]): string[] {
  const start = lines.findIndex((l) => l === "## Terms" || l === "## Last known terms")
  if (start === -1) return []
  const end = lines.findIndex((l, i) => i > start && l.startsWith("## "))
  return lines.slice(start + 1, end === -1 ? undefined : end)
}

/** Markdown with its escapes undone, for comparing a line with a stored value. */
function unescapeMd(line: string): string {
  return line.replace(/\\(.)/g, "$1")
}

/** programs/<slug>.md, as generate-md writes it. */
export function termsMdProblems(p: Program, md: string): string[] {
  const all = md.split("\n")
  const lines = termsSection(all).map(unescapeMd)
  if (lines.length === 0) return ["has no Terms section"]
  const line = (prefix: string) => lines.find((l) => l.startsWith(prefix))
  const problems: string[] = []
  if (termsConfirmed(p)) {
    if (md.includes(UNCONFIRMED_NOTE)) problems.push("marks verified terms unconfirmed")
    if (p.cookieDays != null && line("Cookie window: ") !== `Cookie window: ${p.cookieDays} days`) {
      problems.push(`does not show its cookie window (${p.cookieDays} days)`)
    }
    const payout = [p.payout.minimum != null ? `${p.payout.currency ?? "USD"} ${p.payout.minimum} minimum` : null, p.payout.frequency]
      .filter(Boolean)
      .join(", ")
    if (payout && line("Payout: ") !== `Payout: ${payout}`) problems.push(`does not show its payout (${payout})`)
    const approval = p.approval ? `Approval: ${p.approval}${p.approvalTime ? ` (${p.approvalTime})` : ""}` : null
    if (approval && line("Approval: ") !== approval) problems.push(`does not show its approval (${approval})`)
    return problems
  }
  // Right after the Commission line, so the marker sits next to the figure.
  const at = lines.findIndex((l) => l.startsWith("Commission: "))
  if (at === -1 || lines[at + 1] !== UNCONFIRMED_NOTE) problems.push(`does not follow its Commission line with "${UNCONFIRMED_NOTE}"`)
  for (const prefix of ["Cookie window:", "Payout:", "Approval:"]) {
    if (line(prefix)) problems.push(`shows "${prefix}"`)
  }
  // The whole twin, prose sections included.
  const text = all.map(unescapeMd).join("\n")
  if (COOKIE_BADGE.test(text)) problems.push(`shows a cookie window ("${COOKIE_BADGE.exec(text)![0]}")`)
  const prose = sentences(text).find(statesTerms)
  if (prose) problems.push(`states a term in prose ("${prose.slice(0, 120)}")`)
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
    if (body.approvalTime !== p.approvalTime) problems.push(`approvalTime is ${JSON.stringify(body.approvalTime)}, stored ${p.approvalTime}`)
    return problems
  }
  for (const key of HIDDEN_API_KEYS) if (key in body) problems.push(`returns ${key} (${JSON.stringify(body[key])})`)
  if (JSON.stringify(body.payout) !== "{}") problems.push(`returns payout ${JSON.stringify(body.payout)}`)
  for (const field of ["description", "shortDescription", "agentPrompt", "commissionConditions"]) {
    const prose = sentences(String(body[field] ?? "")).find(statesTerms)
    if (prose) problems.push(`states a term in ${field} ("${prose.slice(0, 120)}")`)
  }
  for (const field of ["agentUseCases", "restrictions"]) {
    const prose = ((body[field] as string[] | undefined) ?? []).flatMap(sentences).find(statesTerms)
    if (prose) problems.push(`states a term in ${field} ("${prose.slice(0, 120)}")`)
  }
  return problems
}

/**
 * A browser chunk (or any shipped JS/JSON): a term field serialized with a
 * value must belong to a verified program, judged by the nearest slug before
 * it. `confirmed(slug)` says whether that slug's terms are shown.
 */
export function chunkProblems(text: string, confirmed: (slug: string) => boolean | undefined): string[] {
  const problems: string[] = []
  const slugs = [...text.matchAll(/["']?\bslug\b["']?\s*:\s*["']([a-z0-9-]+)["']/g)].map((m) => ({ at: m.index!, slug: m[1] }))
  const term = new RegExp(SERIALIZED_TERM.source, "g")
  for (const m of text.matchAll(term)) {
    let owner: string | undefined
    for (const s of slugs) {
      if (s.at > m.index!) break
      owner = s.slug
    }
    if (owner === undefined || confirmed(owner) !== true) {
      problems.push(`${JSON.stringify(m[0])} for ${owner ?? "no slug"}`)
      if (problems.length >= 5) break
    }
  }
  return problems
}
