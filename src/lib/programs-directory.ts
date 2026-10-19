import { affiliateScore, isLive, type Program } from "./programs"
import { byScore } from "./score-order"

/**
 * The A–Z directory on /programs/a-z, server-rendered so every live program has a
 * link in the page's raw HTML. Sort key: the name with accents removed
 * (NFD, combining marks dropped) and ASCII-lowercased, compared by code unit,
 * slug on ties: the same on every machine, unlike localeCompare.
 */
export type DirectoryGroup = { letter: string; programs: Pick<Program, "slug" | "name">[] }

function sortKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[A-Z]/g, (c) => c.toLowerCase())
}

export function directoryGroups(programs: Pick<Program, "slug" | "name" | "status">[]): DirectoryGroup[] {
  const rows = programs
    .filter(isLive)
    .map((p) => ({ slug: p.slug, name: p.name, key: sortKey(p.name) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
  const groups = new Map<string, DirectoryGroup>()
  for (const row of rows) {
    const letter = /^[a-z]/.test(row.key) ? row.key[0] : "#"
    if (!groups.has(letter)) groups.set(letter, { letter, programs: [] })
    groups.get(letter)!.programs.push({ slug: row.slug, name: row.name })
  }
  // a–z in order, then "#" for digits and anything else.
  return [...groups.values()].sort((a, b) => (a.letter === "#" ? 1 : b.letter === "#" ? -1 : a.letter < b.letter ? -1 : 1))
}

/**
 * The homepage's two program sets, disjoint: the Rankings preview (top 5
 * live by Affiliate Score, the /rankings order), then 6 Featured verified
 * live programs in the same order, skipping any already shown.
 */
export function homepageSets(programs: Program[]): { rankings: Program[]; featured: Program[] } {
  const ranked = programs.filter(isLive).sort(byScore(affiliateScore))
  const rankings = ranked.slice(0, 5)
  const shown = new Set(rankings.map((p) => p.slug))
  const verified = ranked.filter((p) => p.verified && !shown.has(p.slug))
  return { rankings, featured: verified.slice(0, 6) }
}
