import { commissionDisplay, commissionLabel, commissionUnknown, isCreditReward, isLive, type Program } from "@/lib/programs"
import { isUnverified } from "@/lib/program-seo"
import { affitorUrl } from "@/lib/affitor-link"
import { outboundUrl, type OutboundSurface } from "@/lib/outbound-link"

/** Whitespace-separated tokens. "&" counts, so the signed cap stays at 4. */
export function ctaWordCount(label: string): number {
  return label.trim().split(/\s+/).filter(Boolean).length
}

/**
 * Program-page apply button. Signed form: "Apply & earn {commission}%",
 * no em dash, at most 4 words. A flat fee keeps its dollar sign and does
 * not gain a percent. A rate that would run past 4 words falls back to
 * "Apply & earn" rather than a truncated number.
 */
export function applyEarnLabel(commission: Program["commission"]): string {
  const prefix = "Apply & earn"
  if (commissionUnknown(commission)) return prefix
  // Credits are not cash: no dollar figure in the button.
  if (isCreditReward(commission)) return `${prefix} credits`
  const shown = commissionDisplay(commission)
  if (!shown || shown === "Not published") return prefix
  // A stored rate that qualifies the figure ("$15 to $1,000", "up to 30%") would be
  // overstated by "Apply & earn $1,000": no number then. A bare "25" is the figure.
  const stored = String(commission.rate ?? "").trim()
  const norm = (x: string) => x.replace(/[\s,]/g, "").replace(/\.0+(?=\D|$)/, "").toLowerCase()
  if (stored && !/^\d+(\.\d+)?$/.test(stored) && norm(stored) !== norm(shown)) return prefix
  const label = `${prefix} ${shown}`
  if (/[—–]/.test(label) || ctaWordCount(label) > 4) return prefix
  return label
}

/** Unverified program: no number in the button, since none is confirmed. Same 4-word cap. */
export function checkTermsLabel(brand: string): string {
  const label = `Check terms on ${brand}`
  return ctaWordCount(label) > 4 ? "Check program terms" : label
}

/**
 * Label and link for both apply buttons on a program page.
 *
 * A live program on the Affitor marketplace is joined on Affitor, so the
 * button says where it goes. The UTM is added here, at render time: the YAML
 * keeps the plain marketplace link that scripts/sync-affitor.ts compares on.
 * Any other brand link gets the openaffiliate UTM for `surface` (outboundUrl).
 */
export function applyButton(program: Program, surface: OutboundSurface): { label: string; href: string } {
  if (program.network === "affitor" && isLive(program) && program.signupUrl) {
    return { label: "Apply on Affitor", href: affitorHref(program.signupUrl, program.slug) }
  }
  return {
    label: isUnverified(program) ? checkTermsLabel(program.name) : applyEarnLabel(program.commission),
    href: outboundUrl(program.signupUrl ?? program.url, surface, program.slug),
  }
}

/** An Affitor marketplace link with the apply UTM, which the YAML never stores. */
function affitorHref(url: string, slug: string): string {
  return affitorUrl("apply", slug, url)
}

/**
 * The line and secondary button for a brand that also lists on Affitor
 * (also_on.affitor), under its own program's terms, which keep the main
 * button. "Also on Affitor: 20% recurring/12mo" from structured fields only,
 * like every commission on the site; just "Also on Affitor" when Affitor
 * publishes no figure. Null when the brand is not on Affitor.
 */
export function alsoOnAffitor(program: Program): { line: string; label: string; href: string } | null {
  const entry = program.alsoOn?.affitor
  if (!entry) return null
  const c = entry.commission
  const figure = c && !commissionUnknown(c) ? `: ${commissionDisplay(c)} ${commissionLabel(c)}` : ""
  return { line: `Also on Affitor${figure}`, label: "Apply on Affitor", href: affitorHref(entry.url, program.slug) }
}
