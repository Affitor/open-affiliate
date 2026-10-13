/**
 * Checks that an unverified program shows no cookie window, payout or approval,
 * in figures or in prose, and marks its commission unconfirmed; and that a
 * verified program still shows exactly its stored terms
 * (src/lib/confirmed-terms.ts). Pure functions returning problems, so
 * verify-machine-surfaces can also feed them a mutated input and require a
 * failure: a check that cannot fail proves nothing.
 *
 * Prose is checked two ways. Every sentence the filter drops from a program's
 * stored text must be absent from its page, RSC payload, twin and API body.
 * And every sentence anywhere on those surfaces, page chrome included, is run
 * through namesTerm(), which recognises a stated term without firing on
 * "rankings are never paid".
 */
import { namesTerm, proseSentences, statesTerms, termsConfirmed, UNCONFIRMED_NOTE } from "../src/lib/confirmed-terms"
import type { Program } from "../src/lib/programs"

/** Fields the API leaves out for an unverified program; `payout` stays as {}. */
export const HIDDEN_API_KEYS = ["cookieDays", "payoutMethods", "approval", "approvalTime"] as const

const COOKIE_BADGE = /\b\d+d cookie\b/
const APPROVAL_LABEL: Record<string, string> = { auto: "Automatic", manual: "Manual review", "invite-only": "Invite only" }
/** A term field serialized as data: a key with a value, quoted (JSON) or not (a JS object literal). */
const SERIALIZED_TERM = /["']?\b(?:cookieDays|cookie_days|payoutMethods|approvalTime|approval_time)\b["']?\s*:\s*(?!null\b|undefined\b|void\b)["'\d[]/
const SLUG_KEY = /["']?\bslug\b["']?\s*:\s*["']([a-z0-9-]+)["']/g

function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
}

/** Sentences of a text, segmented as confirmedProse segments them. */
function sentences(text: string): string[] {
  return proseSentences(text)
    .map((s) => s.sentence.trim())
    .filter(Boolean)
}

function squash(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

/**
 * The sentences confirmedProse drops from a program's stored free text. None
 * may reach a reader. Shorter than 20 characters is too generic to look for.
 */
export function droppedSentences(p: Program): string[] {
  if (termsConfirmed(p)) return []
  const texts = [p.description, p.shortDescription, p.agentPrompt, p.commission.conditions ?? "", ...(p.agentUseCases ?? []), ...(p.restrictions ?? [])]
  return [...new Set(texts.flatMap(sentences).filter(statesTerms).map(squash).filter((s) => s.length >= 20))]
}

function leakedSentence(p: Program, corpus: string): string | undefined {
  const text = squash(corpus)
  return droppedSentences(p).find((s) => text.includes(s))
}

/** A JavaScript string literal's contents, unescaped. */
function unescapeJs(inner: string): string {
  let out = ""
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]
    if (c !== "\\") {
      out += c
      continue
    }
    const n = inner[++i]
    if (n === "n") out += "\n"
    else if (n === "t") out += "\t"
    else if (n === "r") out += "\r"
    else if (n === "u" && /^[0-9a-fA-F]{4}$/.test(inner.slice(i + 1, i + 5))) {
      out += String.fromCharCode(parseInt(inner.slice(i + 1, i + 5), 16))
      i += 4
    } else if (n === "x" && /^[0-9a-fA-F]{2}$/.test(inner.slice(i + 1, i + 3))) {
      out += String.fromCharCode(parseInt(inner.slice(i + 1, i + 3), 16))
      i += 2
    } else if (n !== undefined) out += n
  }
  return out
}

/** The RSC (Flight) payload of a served page: every self.__next_f.push string, decoded. */
function flightPayload(html: string): string {
  let out = ""
  for (const m of html.matchAll(/self\.__next_f\.push\(\[\d+,"((?:[^"\\]|\\.)*)"\]\)/g)) out += unescapeJs(m[1]) + "\n"
  return out
}

/** Every string literal in a Flight payload, decoded: the text the page renders and the props it passes. */
function payloadStrings(flight: string): string[] {
  return [...flight.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => unescapeJs(m[1]))
}

/** The visible text of a page's markup, one block per element. */
function visibleBlocks(html: string): string[] {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/g, "\n")
      .replace(/<style[\s\S]*?<\/style>/g, "\n")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(?:p|div|li|dd|dt|h[1-6]|td|th|span|a|button)\b[^>]*>/g, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .split("\n")
    .map(squash)
    .filter(Boolean)
}

/** Every string value inside a parsed JSON value. */
function stringsIn(value: unknown): string[] {
  if (typeof value === "string") return [value]
  if (Array.isArray(value)) return value.flatMap(stringsIn)
  if (value && typeof value === "object") return Object.values(value).flatMap(stringsIn)
  return []
}

/** Every string inside the page's JSON-LD blocks. */
function jsonLdStrings(html: string): string[] {
  return [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].flatMap((m) => {
    try {
      return stringsIn(JSON.parse(m[1]))
    } catch {
      return [m[1]]
    }
  })
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
  const blocks = visibleBlocks(html)
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
  const flight = payloadStrings(flightPayload(html))
  for (const [where, texts] of [
    ["prose", blocks],
    ["its JSON-LD", jsonLdStrings(html)],
    ["its RSC payload", flight],
  ] as const) {
    const named = texts.flatMap(sentences).find(namesTerm)
    if (named) problems.push(`states a term in ${where} ("${named.slice(0, 120)}")`)
  }
  const leaked = leakedSentence(p, [...blocks, ...flight].join("\n"))
  if (leaked) problems.push(`carries a dropped sentence ("${leaked.slice(0, 120)}")`)
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
  const named = sentences(text).find(namesTerm)
  if (named) problems.push(`states a term in prose ("${named.slice(0, 120)}")`)
  const leaked = leakedSentence(p, text)
  if (leaked) problems.push(`carries a dropped sentence ("${leaked.slice(0, 120)}")`)
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
  const commission = (body.commission ?? {}) as Record<string, unknown>
  const prose: [string, unknown][] = [
    ["description", body.description],
    ["shortDescription", body.shortDescription],
    ["agentPrompt", body.agentPrompt],
    ["commissionConditions", body.commissionConditions],
    ["commission.conditions", commission.conditions],
    ["agentUseCases", body.agentUseCases],
    ["restrictions", body.restrictions],
  ]
  for (const [field, value] of prose) {
    const texts = (Array.isArray(value) ? value : [value]).map((v) => String(v ?? ""))
    const stated = texts.flatMap(sentences).find(statesTerms)
    if (stated) problems.push(`states a term in ${field} ("${stated.slice(0, 120)}")`)
  }
  const leaked = leakedSentence(p, stringsIn(body).join("\n"))
  if (leaked) problems.push(`carries a dropped sentence ("${leaked.slice(0, 120)}")`)
  return problems
}

/**
 * The object a position sits in, found by brace depth, and the slug key at
 * that object's own level, before or after the position. Walks up to the
 * enclosing objects when the object has no slug. Strings with braces in them
 * can mislead it; data records rarely carry any.
 */
function ownerSlug(text: string, at: number): string | undefined {
  let from = at
  for (let level = 0; level < 4; level++) {
    let start = -1
    for (let i = from, depth = 0; i >= 0 && from - i < 50_000; i--) {
      const c = text[i]
      if (c === "}") depth++
      else if (c === "{") {
        if (depth === 0) {
          start = i
          break
        }
        depth--
      }
    }
    if (start === -1) return undefined
    let end = -1
    for (let i = start + 1, depth = 0; i < text.length && i - start < 100_000; i++) {
      const c = text[i]
      if (c === "{") depth++
      else if (c === "}") {
        if (depth === 0) {
          end = i
          break
        }
        depth--
      }
    }
    if (end === -1) return undefined
    const record = text.slice(start + 1, end)
    // The slug at the record's own depth, not one inside a nested object.
    let depth = 0
    let cursor = 0
    for (const m of record.matchAll(SLUG_KEY)) {
      for (; cursor < m.index!; cursor++) {
        if (record[cursor] === "{") depth++
        else if (record[cursor] === "}") depth--
      }
      if (depth === 0) return m[1]
    }
    from = start - 1
  }
  return undefined
}

/** The strings a bundle passes to JSON.parse, decoded: data shipped as escaped JSON. */
function embeddedJson(text: string): string[] {
  return [...text.matchAll(/JSON\.parse\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1\s*\)/g)].map((m) => unescapeJs(m[2]))
}

export interface ChunkScan {
  /** Term fields serialized for a program whose terms are unconfirmed. */
  problems: string[]
  /** Term fields found on a verified program's record: proof the scan reads real records. */
  confirmedRecords: number
}

/**
 * Shipped data (a browser chunk, a prerendered page's RSC payload): a term
 * field serialized with a value belongs to the record it sits in, wherever the
 * record's slug is, and must not belong to a program whose terms are
 * unconfirmed. Escaped JSON handed to JSON.parse is decoded and read too.
 * `confirmed(slug)` is undefined for a slug that is not a program (the docs'
 * illustrative examples), which is not judged.
 */
export function chunkScan(text: string, confirmed: (slug: string) => boolean | undefined): ChunkScan {
  const scan: ChunkScan = { problems: [], confirmedRecords: 0 }
  for (const body of [text, ...embeddedJson(text)]) {
    for (const m of body.matchAll(new RegExp(SERIALIZED_TERM.source, "g"))) {
      const owner = ownerSlug(body, m.index!)
      if (owner === undefined) continue
      const shown = confirmed(owner)
      if (shown === true) scan.confirmedRecords++
      else if (shown === false && scan.problems.length < 5) scan.problems.push(`${JSON.stringify(m[0])} for ${owner}`)
    }
  }
  return scan
}
