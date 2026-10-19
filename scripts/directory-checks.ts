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

/** Slugs linked under /<base>/ (programs, or networks) in a section, in page order, each once. */
export function linkedSlugs(html: string, id: string, base = "programs"): string[] | null {
  const body = section(html, id)
  if (body === null) return null
  const seen: string[] = []
  for (const m of body.matchAll(new RegExp(`<a\\b[^>]*?\\shref="\\/${base}\\/([a-z0-9-]+)"`, "g"))) if (!seen.includes(m[1])) seen.push(m[1])
  return seen
}

/** Raw anchor count in a section, duplicates included (the directory lists each program once). */
export function anchorCount(html: string, id: string, base = "programs"): number {
  return [...(section(html, id) ?? "").matchAll(new RegExp(`<a\\b[^>]*?\\shref="\\/${base}\\/[a-z0-9-]+"`, "g"))].length
}

/** Problems with a section's links against the expected slugs, in order. */
export function sectionProblems(html: string, id: string, expected: string[], exactCount = false, base = "programs"): string[] {
  const got = linkedSlugs(html, id, base)
  if (got === null) return [`no <section id="${id}">`]
  const problems: string[] = []
  if (got.join(",") !== expected.join(",")) {
    const missing = expected.filter((s) => !got.includes(s))
    const extra = got.filter((s) => !expected.includes(s))
    problems.push(`#${id} links ${got.length}, expected ${expected.length} in order (missing ${missing.slice(0, 3).join(" ") || "none"}, extra ${extra.slice(0, 3).join(" ") || "none"})`)
  }
  if (exactCount && anchorCount(html, id, base) !== expected.length) problems.push(`#${id} has ${anchorCount(html, id, base)} ${base.slice(0, -1)} anchors for ${expected.length} ${base}`)
  return problems
}
