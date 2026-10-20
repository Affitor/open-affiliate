import { compareText } from "./commission-order"
import type { BoardRow } from "./oas"

/**
 * What the "Score your program" box searches, sent by the server so the
 * browser makes no request: slug, name, domain, and the score. `oas` is the
 * number, "scoring" while the score is in progress, or null when the program
 * has no OAS report yet. Tuples keep the page payload small.
 */
export type ScoreEntry = [slug: string, name: string, domain: string, oas: number | "scoring" | null]

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

export function scoreIndex(programs: { slug: string; name: string; url: string }[], board: BoardRow[]): ScoreEntry[] {
  const scored = new Map(board.map((r) => [r.program.slug, r.oas ?? "scoring"] as const))
  return programs.map((p) => [p.slug, p.name, domainOf(p.url), scored.get(p.slug) ?? null])
}

/**
 * Programs a query names, best first: an exact name or domain, then a prefix,
 * then anywhere in the name, domain or slug. A pasted URL is read as its
 * domain ("https://www.cal.com/pricing" → "cal.com").
 */
export function matchPrograms(index: ScoreEntry[], query: string, limit = 5): ScoreEntry[] {
  const q = query
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "")
  if (q.length < 2) return []
  const score = ([slug, name, domain]: ScoreEntry) => {
    const n = name.toLowerCase()
    if (n === q || domain === q || slug === q) return 0
    if (n.startsWith(q) || domain.startsWith(q) || slug.startsWith(q)) return 1
    if (n.includes(q) || domain.includes(q) || slug.includes(q)) return 2
    return 3
  }
  return index
    .map((e) => [score(e), e] as const)
    .filter(([s]) => s < 3)
    .sort((a, b) => a[0] - b[0] || compareText(a[1][1], b[1][1]))
    .slice(0, limit)
    .map(([, e]) => e)
}
