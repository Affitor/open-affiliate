/**
 * Served-HTML checks for N-2: the /programs A–Z directory and the homepage
 * program sections, read inside their own <section id>, anchors matched by
 * their href attribute among any others (<Link> also writes class).
 */
function section(html: string, id: string): string | null {
  const start = html.indexOf(`<section id="${id}"`)
  if (start < 0) return null
  const end = html.indexOf("</section>", start)
  return end < 0 ? null : html.slice(start, end)
}

/** Program slugs linked in a section, in page order, each once. */
export function linkedSlugs(html: string, id: string): string[] | null {
  const body = section(html, id)
  if (body === null) return null
  const seen: string[] = []
  for (const m of body.matchAll(/<a\b[^>]*?\shref="\/programs\/([a-z0-9-]+)"/g)) if (!seen.includes(m[1])) seen.push(m[1])
  return seen
}

/** Raw anchor count in a section, duplicates included (the directory lists each program once). */
export function anchorCount(html: string, id: string): number {
  return [...(section(html, id) ?? "").matchAll(/<a\b[^>]*?\shref="\/programs\/[a-z0-9-]+"/g)].length
}

/** Problems with a section's links against the expected slugs, in order. */
export function sectionProblems(html: string, id: string, expected: string[], exactCount = false): string[] {
  const got = linkedSlugs(html, id)
  if (got === null) return [`no <section id="${id}">`]
  const problems: string[] = []
  if (got.join(",") !== expected.join(",")) {
    const missing = expected.filter((s) => !got.includes(s))
    const extra = got.filter((s) => !expected.includes(s))
    problems.push(`#${id} links ${got.length}, expected ${expected.length} in order (missing ${missing.slice(0, 3).join(" ") || "none"}, extra ${extra.slice(0, 3).join(" ") || "none"})`)
  }
  if (exactCount && anchorCount(html, id) !== expected.length) problems.push(`#${id} has ${anchorCount(html, id)} program anchors for ${expected.length} programs`)
  return problems
}
