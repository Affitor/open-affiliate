import { readFileSync } from "fs"
import { join } from "path"
import { parse } from "yaml"

/**
 * The verbatim quotes the verifier left in a program's YAML, one comment line
 * per checked fact: `# "quote" (source, checked YYYY-MM-DD)`, written right
 * above the field it backs. They are the receipts for the terms a post shows.
 *
 * Read at build from programs/<slug>.yaml (the /best pages are static). Only
 * lines of exactly that shape count:
 * - one `(source, checked date)` group; a line citing two sources is a
 *   conflict note, not a receipt;
 * - the quoted parts before it, joined with an ellipsis; words outside the
 *   quotes are the verifier's, never shown as the brand's;
 * - attached to the next YAML key with no blank line in between, which names
 *   the field;
 * - at most RECEIPT_MAX_WORDS words, the limit for a public verbatim quote.
 */
export interface Receipt {
  field: "commission" | "cookie" | "payout" | "approval"
  quote: string
  /** https URL on the program's own site, or null when the source is not one. */
  href: string | null
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

const CITE = /\(([^()]+),\s*checked (\d{4}-\d{2}-\d{2})\)/g

/** The program's own registrable host ("kinsta.com" from "https://www.kinsta.com"). */
function siteHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "")
  } catch {
    return null
  }
}

/** A link only to the program's own site (or a subdomain of it), over https. */
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
    out.push({ field, quote, href: sourceHref(source, programUrl), source: source.replace(/^https?:\/\//, "").replace(/\/$/, ""), checked: cites[0][2] })
  }
  return out
}

const cache = new Map<string, { receipts: Receipt[]; conflicts: string[] }>()

function read(slug: string, programUrl: string) {
  if (!cache.has(slug)) {
    let text = ""
    try {
      text = readFileSync(join(process.cwd(), "programs", `${slug}.yaml`), "utf8")
    } catch {
      text = ""
    }
    // `conflicts` (schema: field + quote) is not mapped into the registry; read it here.
    const doc = (text ? parse(text) : null) as { conflicts?: { field?: unknown }[] } | null
    const conflicts = (doc?.conflicts ?? []).map((c) => String(c.field ?? "")).filter(Boolean)
    cache.set(slug, { receipts: parseReceipts(text, programUrl), conflicts })
  }
  return cache.get(slug)!
}

/** The receipts in programs/<slug>.yaml; none when the file cannot be read. */
export function termReceipts(slug: string, programUrl: string): Receipt[] {
  return read(slug, programUrl).receipts
}

/** Fields the brand states two ways (YAML `conflicts`), which the registry leaves blank: "cookie_days", "payout.minimum". */
export function termConflicts(slug: string, programUrl: string): string[] {
  return read(slug, programUrl).conflicts
}

/**
 * The one quote a program block shows: the commission's, else the first
 * receipt for another field. A quote of fewer than three words ("€20.00")
 * proves little on its own, so a longer receipt for another field goes first.
 */
export function leadReceipt(receipts: Receipt[]): Receipt | null {
  const words = (r: Receipt) => r.quote.replaceAll("…", " ").trim().split(/\s+/).length
  const order = (rs: Receipt[]) => [...rs.filter((r) => r.field === "commission"), ...rs.filter((r) => r.field !== "commission")]
  return order(receipts).find((r) => words(r) >= 3) ?? order(receipts)[0] ?? null
}
