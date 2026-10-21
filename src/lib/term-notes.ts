import { readFileSync } from "fs"
import { join } from "path"
import { parse } from "yaml"

/**
 * What a program's YAML records about its terms beyond the registry fields,
 * read at build from programs/<slug>.yaml (the /best pages are static):
 * - conflicts: the `conflicts` entries, terms the brand states two ways;
 * - not published: the `not_published` keys, plus `# <term>: not published …`
 *   comments, the terms the verifier found the brand does not publish.
 */
export interface TermNotes {
  /** Schema fields the brand states two ways: "cookie_days", "payout.minimum". */
  conflicts: Set<string>
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
  const doc = (text ? parse(text) : null) as { conflicts?: { field?: unknown }[]; not_published?: Record<string, unknown> } | null
  const conflicts = new Set((doc?.conflicts ?? []).map((c) => String(c.field ?? "")).filter(Boolean))
  const notPublished = new Set(Object.keys(doc?.not_published ?? {}))
  for (const line of text.split("\n")) {
    const m = line.trim().match(/^#\s*([a-z_ ]+?):\s*not published\b/i)
    const field = m ? NOT_PUBLISHED_COMMENT[m[1].toLowerCase()] : undefined
    if (field) notPublished.add(field)
  }
  return { conflicts, notPublished }
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
