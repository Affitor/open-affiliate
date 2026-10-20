import { affiliateScore, isLive, type Program } from "./programs"
import { byScore } from "./score-order"
import { buildBoard, isStale, oasScores, type OasScore } from "./oas"

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
 * The homepage's two program sets, disjoint: the Rankings preview, then 6
 * Featured verified live programs by Affiliate Score, skipping any already
 * shown. Once OAS is published the preview is the top 5 of the OAS
 * leaderboard, so the number on the homepage is the one each program page and
 * report shows; until then it is the top 5 by Affiliate Score.
 *
 * Pages refresh on their own schedules (homepage hourly, program page and
 * report daily), so the preview leaves out any program whose review reaches
 * 90 days within HOME_LOOKAHEAD_DAYS: it drops a score before any page that
 * links from it can. Ranks are the leaderboard's own, ties shared.
 */
export const HOME_LOOKAHEAD_DAYS = 2

export function homepageSets(
  programs: Program[],
  scores: OasScore[] = oasScores,
  today: Date = new Date(),
): { rankings: Program[]; ranks: number[]; featured: Program[]; by: "oas" | "affiliate-score" } {
  const ranked = programs.filter(isLive).sort(byScore(affiliateScore))
  const bySlug = new Map(programs.map((p) => [p.slug, p]))
  const horizon = new Date(today.getTime() + HOME_LOOKAHEAD_DAYS * 864e5)
  const board = buildBoard(scores, ranked, today)
    .filter((r) => r.rank != null && !isStale(r.score.checked_at, horizon))
    .slice(0, 5)
  const by = board.length ? "oas" : "affiliate-score"
  const rankings = board.length ? board.map((r) => bySlug.get(r.program.slug)!) : ranked.slice(0, 5)
  const ranks = board.length ? board.map((r) => r.rank!) : rankings.map((_, i) => i + 1)
  const shown = new Set(rankings.map((p) => p.slug))
  const verified = ranked.filter((p) => p.verified && !shown.has(p.slug))
  return { rankings, ranks, featured: verified.slice(0, 6), by }
}
