import { AFFITOR_ATTR, isAffitorHref } from "../src/lib/affitor-link"

/**
 * Every anchor in served HTML whose href is on affitor.com must be a tracked
 * component (it renders AFFITOR_ATTR and records affitor_cta_click) and carry
 * the openaffiliate UTM. Returns the problems and how many tracked anchors were
 * seen, so a caller can refuse a vacuous pass.
 */
export function affitorAnchorProblems(html: string): { problems: string[]; tracked: number } {
  const problems: string[] = []
  let tracked = 0
  for (const [tag] of html.matchAll(/<a\b[^>]*>/g)) {
    const raw = /\shref="([^"]*)"/.exec(tag)?.[1]
    if (!raw) continue
    const href = raw.replaceAll("&amp;", "&")
    if (!isAffitorHref(href)) continue
    if (!tag.includes(` ${AFFITOR_ATTR}=`)) problems.push(`untracked Affitor link ${href}`)
    else tracked++
    if (new URL(href).searchParams.get("utm_source") !== "openaffiliate") problems.push(`Affitor link without the UTM ${href}`)
  }
  return { problems, tracked }
}
