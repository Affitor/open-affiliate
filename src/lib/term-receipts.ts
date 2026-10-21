import { readFileSync } from "fs"
import { join } from "path"
import { parse } from "yaml"

/**
 * What a program's YAML says about its terms beyond the registry fields,
 * read at build from programs/<slug>.yaml (the /best pages are static):
 *
 * - Receipts: the verbatim quotes the verifier left, one comment line per
 *   checked fact, `# "quote" (source, checked YYYY-MM-DD)`, right above the
 *   field it backs. Only lines of exactly that shape count:
 *   - one `(source, checked date)` group; a line citing two sources is a
 *     conflict note, not a receipt;
 *   - the source is on the program's own site (or a subdomain of it); a
 *     quote from a directory or network page is never shown as the brand's;
 *   - the quoted parts before it, joined with an ellipsis; words outside the
 *     quotes are the verifier's, never shown as the brand's;
 *   - attached to the next YAML key with no blank line in between, which
 *     names the field;
 *   - at most RECEIPT_MAX_WORDS words, the limit for a public verbatim quote.
 * - Conflicts: the `conflicts` entries, terms the brand states two ways.
 * - Not published: the `not_published` keys, plus `# <term>: not published …`
 *   comments, the terms the verifier found the brand does not publish.
 * - A network outside the registry's list: a comment written right above
 *   `network: null` (the verifier names the platform there).
 */
export interface Receipt {
  field: "commission" | "cookie" | "payout" | "approval"
  quote: string
  /** https URL of the source on the program's own site. */
  href: string
  /** The source as written in the YAML, e.g. "kinsta.com/affiliates". */
  source: string
  checked: string
}

export const RECEIPT_MAX_WORDS = 25

const FIELD_OF: Record<string, Receipt["field"]> = {
  commission: "commission",
  rate: "commission",
  cookie_days: "cookie",
  payout: "payout",
  minimum: "payout",
  frequency: "payout",
  methods: "payout",
  approval: "approval",
}

/** `# cookie window: not published on …` → the schema field it names. */
const NOT_PUBLISHED_COMMENT: Record<string, string> = {
  "cookie window": "cookie_days",
  cookie_days: "cookie_days",
  "payout minimum": "payout.minimum",
  "payout methods": "payout.methods",
  "payment methods": "payout.methods",
  approval: "approval",
}

const CITE = /\(([^()]+),\s*checked (\d{4}-\d{2}-\d{2})\)/g

/** The program's own host without "www." ("kinsta.com" from "https://www.kinsta.com"). */
function siteHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "")
  } catch {
    return null
  }
}

/** The source as an https URL when it is on the program's own site (or a subdomain), else null. */
function sourceHref(source: string, programUrl: string): string | null {
  const own = siteHost(programUrl)
  if (!own) return null
  let url: URL
  try {
    url = new URL(/^https?:\/\//.test(source) ? source : `https://${source}`)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase()
  if (host !== own && !host.endsWith(`.${own}`)) return null
  url.protocol = "https:"
  return url.toString()
}

export function parseReceipts(yaml: string, programUrl: string): Receipt[] {
  const lines = yaml.split("\n")
  const out: Receipt[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line.startsWith("#")) continue
    const cites = [...line.matchAll(CITE)]
    if (cites.length !== 1) continue
    const before = line.slice(1, cites[0].index).trim()
    const quotes = [...before.matchAll(/"([^"]+)"/g)].map((m) => m[1].trim()).filter(Boolean)
    if (!quotes.length) continue
    const quote = quotes.join(" … ")
    if (quote.split(/\s+/).length > RECEIPT_MAX_WORDS) continue
    // The field: the first key after this comment block, with no blank line in between.
    let j = i + 1
    while (j < lines.length && lines[j].trim().startsWith("#")) j++
    const key = lines[j]?.match(/^\s*([a-z_]+):/)?.[1]
    const field = key ? FIELD_OF[key] : undefined
    if (!field) continue
    const source = cites[0][1].trim()
    const href = sourceHref(source, programUrl)
    if (!href) continue
    out.push({ field, quote, href, source: source.replace(/^https?:\/\//, "").replace(/\/$/, ""), checked: cites[0][2] })
  }
  return out
}

export interface TermNotes {
  receipts: Receipt[]
  /** Schema fields the brand states two ways: "cookie_days", "payout.minimum". */
  conflicts: Set<string>
  /** Schema fields the verifier found unpublished: "cookie_days", "payout.methods". */
  notPublished: Set<string>
  /** `network: null` carries a comment naming a platform outside the registry's network list. */
  networkOutsideList: boolean
}

export function parseNotes(text: string, programUrl: string): TermNotes {
  const doc = (text ? parse(text) : null) as { conflicts?: { field?: unknown }[]; not_published?: Record<string, unknown> } | null
  const conflicts = new Set((doc?.conflicts ?? []).map((c) => String(c.field ?? "")).filter(Boolean))
  const notPublished = new Set(Object.keys(doc?.not_published ?? {}))
  const lines = text.split("\n")
  for (const line of lines) {
    const m = line.trim().match(/^#\s*([a-z_ ]+?):\s*not published\b/i)
    const field = m ? NOT_PUBLISHED_COMMENT[m[1].toLowerCase()] : undefined
    if (field) notPublished.add(field)
  }
  const net = lines.findIndex((l) => /^network:\s*null\s*$/.test(l))
  const networkOutsideList = net > 0 && lines[net - 1].trim().startsWith("#")
  return { receipts: parseReceipts(text, programUrl), conflicts, notPublished, networkOutsideList }
}

const cache = new Map<string, TermNotes>()

/** The notes in programs/<slug>.yaml; empty when the file cannot be read. */
export function termNotes(slug: string, programUrl: string): TermNotes {
  if (!cache.has(slug)) {
    let text = ""
    try {
      text = readFileSync(join(process.cwd(), "programs", `${slug}.yaml`), "utf8")
    } catch {
      text = ""
    }
    cache.set(slug, parseNotes(text, programUrl))
  }
  return cache.get(slug)!
}

/**
 * The one quote a program block shows: the newest commission receipt, else
 * the newest receipt for a field whose fact the block shows (`shows`), so a
 * quote never sits next to an empty fact it seems to source.
 */
export function leadReceipt(receipts: Receipt[], shows: (field: Receipt["field"]) => boolean = () => true): Receipt | null {
  const newest = [...receipts].sort((a, b) => b.checked.localeCompare(a.checked))
  return newest.find((r) => r.field === "commission") ?? newest.find((r) => shows(r.field)) ?? null
}
