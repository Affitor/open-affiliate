import { commissionDisplay, commissionUnknown, isCreditReward, isLive, type Program } from "@/lib/programs"
import { isUnverified } from "@/lib/program-seo"

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
 */
export function applyButton(program: Program): { label: string; href: string } {
  if (program.network === "affitor" && isLive(program) && program.signupUrl) {
    const href = new URL(program.signupUrl)
    href.searchParams.set("utm_source", "openaffiliate")
    href.searchParams.set("utm_medium", "apply")
    href.searchParams.set("utm_campaign", program.slug)
    return { label: "Apply on Affitor", href: href.toString() }
  }
  return {
    label: isUnverified(program) ? checkTermsLabel(program.name) : applyEarnLabel(program.commission),
    href: program.signupUrl ?? program.url,
  }
}
