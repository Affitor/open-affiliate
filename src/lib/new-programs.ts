import { confirmedTerms, isLive, type Program } from "./programs"

export const REGISTRY_URL = "https://openaffiliate.dev"
export const RSS_LIMIT = 50

/** Today and the preceding 29 UTC calendar days, excluding future entries. */
export function newPrograms(programs: Program[], now = new Date()): Program[] {
  const today = now.toISOString().slice(0, 10)
  const start = new Date(`${today}T00:00:00Z`)
  start.setUTCDate(start.getUTCDate() - 29)
  const first = start.toISOString().slice(0, 10)
  return programs.filter((p) => isLive(p) && p.createdAt >= first && p.createdAt <= today)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt, "en") || a.slug.localeCompare(b.slug, "en"))
    .map(confirmedTerms)
}

function xml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!)
}

export function newProgramsRss(programs: Program[], now = new Date()): string {
  const items = newPrograms(programs, now).slice(0, RSS_LIMIT)
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>New on OpenAffiliate</title><link>${REGISTRY_URL}/new</link>
<description>Recently added affiliate programs on OpenAffiliate</description><language>en</language>
<atom:link href="${REGISTRY_URL}/new.xml" rel="self" type="application/rss+xml"/>
${items.map((p) => {
    const url = `${REGISTRY_URL}/programs/${encodeURIComponent(p.slug)}`
    return `<item><title>${xml(p.name)}</title><link>${url}</link><guid isPermaLink="true">${url}</guid><pubDate>${new Date(`${p.createdAt}T00:00:00Z`).toUTCString()}</pubDate><description>${xml(p.shortDescription)}</description></item>`
  }).join("\n")}
</channel></rss>`
}
