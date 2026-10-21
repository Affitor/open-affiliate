import { readFileSync } from "fs"
import { join } from "path"
import { parse } from "yaml"

/**
 * What a program's YAML records about its terms beyond the registry fields,
 * read at build from programs/<slug>.yaml (the /best pages are static):
 * - conflicts: the `conflicts` entries, terms the brand states two ways, with
 *   the quote that records both values;
 * - not published: the `not_published` keys, plus `# <term>: not published …`
 *   comments, the terms the verifier found the brand does not publish.
 */
export interface TermNotes {
  /** Schema fields the brand states two ways: "cookie_days", "payout.minimum". */
  conflicts: Set<string>
  /** Each conflicting field's recorded quote (schema: `conflicts[].quote`). */
  conflictQuotes: Map<string, string>
  /** Schema fields the verifier found unpublished: "cookie_days", "payout.methods". */
  notPublished: Set<string>
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

export function parseNotes(text: string): TermNotes {
  const doc = (text ? parse(text) : null) as { conflicts?: { field?: unknown; quote?: unknown }[]; not_published?: Record<string, unknown> } | null
  const conflictQuotes = new Map((doc?.conflicts ?? []).filter((c) => c.field).map((c) => [String(c.field), String(c.quote ?? "")] as const))
  const conflicts = new Set(conflictQuotes.keys())
  const notPublished = new Set(Object.keys(doc?.not_published ?? {}))
  for (const line of text.split("\n")) {
    const m = line.trim().match(/^#\s*([a-z_ ]+?):\s*not published\b/i)
    const field = m ? NOT_PUBLISHED_COMMENT[m[1].toLowerCase()] : undefined
    if (field) notPublished.add(field)
  }
  return { conflicts, conflictQuotes, notPublished }
}

const cache = new Map<string, TermNotes>()

/** The notes in programs/<slug>.yaml; empty when the file cannot be read. */
export function termNotes(slug: string): TermNotes {
  if (!cache.has(slug)) {
    let text = ""
    try {
      text = readFileSync(join(process.cwd(), "programs", `${slug}.yaml`), "utf8")
    } catch {
      text = ""
    }
    cache.set(slug, parseNotes(text))
  }
  return cache.get(slug)!
}

/** The quoted parts of a conflict quote: `site: "a" other: "b". Checked …` → ["a", "b"]. */
function quotedParts(quote: string): string[] {
  return [...quote.matchAll(/"([^"]*)"/g)].map((m) => m[1])
}

/**
 * The values a conflict quote records, read only from its quoted parts in a
 * fixed shape per field; null unless that yields two or more distinct values
 * (the page then says the brand gives two values without naming them).
 * - cookie_days: "N days" figures and "indefinitely" → "30 or 60 days", "30 days or indefinitely";
 * - payout.minimum: currency amounts → "$40 or $80".
 */
export function conflictValues(quote: string, field: string): string | null {
  const parts = quotedParts(quote)
  if (field === "cookie_days") {
    const days = [...new Set(parts.flatMap((t) => [...t.matchAll(/(\d+)\s?-?\s?days?\b/gi)].map((m) => Number(m[1]))))].sort((a, b) => a - b)
    const forever = parts.some((t) => /\bindefinitely\b/i.test(t))
    if (!days.length || days.length + (forever ? 1 : 0) < 2) return null
    return forever ? `${days.join(" or ")} days or indefinitely` : `${days.join(" or ")} days`
  }
  if (field === "payout.minimum") {
    const amount = (a: string) => Number(a.replace(/[^\d.]/g, ""))
    const amounts = [...new Set(parts.flatMap((t) => [...t.matchAll(/[$€£]\s?\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0].replace(/\s/g, ""))))]
    return amounts.length >= 2 ? amounts.sort((a, b) => amount(a) - amount(b)).join(" or ") : null
  }
  return null
}
