import { affiliateScore, isLive, type Program } from "./programs"
import { byScore } from "./score-order"
import { buildBoard, isStale, oasScores, type OasScore } from "./oas"
import { verifiedDate } from "./best-lists"
import type { Faq } from "./program-seo"

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
 * links from it can. Positions are the leaderboard's own (unique, compareBoard order).
 */
export const HOME_LOOKAHEAD_DAYS = 2

export function homepageSets(
  programs: Program[],
  scores: OasScore[] = oasScores,
  today: Date = new Date(),
): { rankings: Program[]; ranks: number[]; verified: (string | null)[]; featured: Program[]; by: "oas" | "affiliate-score" } {
  const ranked = programs.filter(isLive).sort(byScore(affiliateScore))
  const bySlug = new Map(programs.map((p) => [p.slug, p]))
  const horizon = new Date(today.getTime() + HOME_LOOKAHEAD_DAYS * 864e5)
  const board = buildBoard(scores, ranked, today)
    .filter((r) => r.rank != null && !isStale(r.score.checked_at, horizon))
    .slice(0, 5)
  const by = board.length ? "oas" : "affiliate-score"
  const rankings = board.length ? board.map((r) => bySlug.get(r.program.slug)!) : ranked.slice(0, 5)
  const ranks = board.length ? board.map((r) => r.rank!) : rankings.map((_, i) => i + 1)
  // Each OAS row shows the score's verified date, the one the tie-break orders by.
  const verified = board.length ? board.map((r) => r.score.checked_at ?? null) : rankings.map(() => null)
  const shown = new Set(rankings.map((p) => p.slug))
  const verifiedPrograms = ranked.filter((p) => p.verified && !shown.has(p.slug))
  return { rankings, ranks, verified, featured: verifiedPrograms.slice(0, 6), by }
}

/** Rows the /programs hub server-renders, and ListItems in its ItemList JSON-LD. */
export const HUB_ROWS = 100

export interface ProgramsHub {
  /** Live programs. */
  total: number
  /** Live programs whose terms are verified. */
  verified: number
  /** verifiedDate() over the live rows (YYYY-MM-DD), or null when none is verified. */
  checked: string | null
  title: string
  /** The opening sentence, also the meta description. */
  sentence: string
  /** "Oct 20, 2026", the checked date as shown; null with no checked date. */
  updated: string | null
  /** The first HUB_ROWS ranked programs, in leaderboard order, with their position and score. */
  top: { program: Program; rank: number; oas: number; checked: string | null }[]
  faq: Faq[]
}

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" })
const n = (x: number) => x.toLocaleString("en-US")
const andList = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`)

/**
 * Everything /programs says about the registry as a whole: title, opening
 * sentence, freshness line, the top rows by OAS and the FAQ. Every number and
 * date is computed here from the registry (lessons: counts are never typed),
 * and the FAQ answers come from structured fields only: counts, `verified`,
 * `approval` and the OAS board. No "highest paying" question: no structured
 * field compares a percentage with a flat payout.
 */
export function programsHub(
  programs: Program[],
  scores: OasScore[] = oasScores,
  today: Date = new Date(),
): ProgramsHub {
  const live = programs.filter(isLive)
  const verified = live.filter((p) => p.verified)
  const checked = verifiedDate(live)
  const updated = checked ? fmt(checked, { month: "short", day: "numeric", year: "numeric" }) : null
  const month = checked ? ` (${fmt(checked, { month: "short", year: "numeric" })})` : ""
  const title = `Affiliate Program Directory: ${n(live.length)} Programs, ${n(verified.length)} Verified${month}`
  const sentence =
    `OpenAffiliate is an open database of ${n(live.length)} affiliate programs; ` +
    `${n(verified.length)} have their terms verified on the brand's own affiliate page` +
    (checked ? `, last checked ${checked}.` : ".")

  const bySlug = new Map(live.map((p) => [p.slug, p]))
  const ranked = buildBoard(scores, live, today).filter((r) => r.rank != null && r.oas != null)
  const top = ranked.slice(0, HUB_ROWS).map((r) => ({
    program: bySlug.get(r.program.slug)!,
    rank: r.rank!,
    oas: r.oas!,
    checked: r.score.checked_at ?? null,
  }))

  // Approval is a confirmed term (confirmed-terms.ts): counted on verified programs only.
  const auto = verified.filter((p) => p.approval === "auto")
  const manual = verified.filter((p) => p.approval === "manual").length
  const invite = verified.filter((p) => p.approval === "invite-only").length
  const unstated = verified.length - auto.length - manual - invite
  const autoSlugs = new Set(auto.map((p) => p.slug))
  const autoTop = ranked.filter((r) => autoSlugs.has(r.program.slug)).slice(0, 3).map((r) => r.program.name)
  const rest = [
    manual ? `${n(manual)} review each application by hand` : "",
    invite ? `${n(invite)} are invite-only` : "",
    unstated ? `${n(unstated)} do not state how they approve` : "",
  ].filter(Boolean)

  const faq: Faq[] = [
    {
      q: "Where can I find affiliate programs?",
      a:
        `In an affiliate program directory. OpenAffiliate lists ${n(live.length)} affiliate programs in one open directory ` +
        "you can filter by category, commission type, network, payout method and cookie window; every program has its own page with its terms. " +
        "The same data is free as a REST API, an MCP server and Markdown files, with no API key.",
    },
    {
      q: "How many affiliate programs does OpenAffiliate list?",
      a:
        `${n(live.length)} live affiliate programs. ${n(verified.length)} of them have their terms verified on the brand's own affiliate page` +
        (checked ? `; the most recent check was on ${checked}.` : ".") +
        " The others show their commission marked unconfirmed until they are checked.",
    },
  ]
  if (auto.length) {
    faq.push({
      q: "What are the easiest affiliate programs to get into?",
      a:
        `Programs that approve new affiliates automatically. Of the ${n(verified.length)} programs with verified terms, ${n(auto.length)} approve automatically` +
        (autoTop.length ? `; the highest ranked by OAS ${autoTop.length === 1 ? "is" : "are"} ${andList(autoTop)}.` : ".") +
        (rest.length ? ` Of the others, ${andList(rest)}.` : ""),
    })
  }
  return { total: live.length, verified: verified.length, checked, title, sentence, updated, top, faq }
}
