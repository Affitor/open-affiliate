/**
 * Every OpenAffiliate link to affitor.com: one UTM shape and one PostHog
 * event, so the OA → Affitor click count is one query. No imports, so client
 * components can use it without pulling in the registry.
 */

export const AFFITOR_CLICK = "oa_to_affitor_click"

/** Where on OA the click came from: the `source` property of AFFITOR_CLICK. */
export type AffitorSource = "program_page" | "for_brands" | "claim" | "compare" | "list"

/** `url` (affitor.com home by default) with utm_source=openaffiliate, the given medium and campaign. */
export function affitorUrl(medium: string, campaign: string, url = "https://affitor.com/"): string {
  const href = new URL(url)
  href.searchParams.set("utm_source", "openaffiliate")
  href.searchParams.set("utm_medium", medium)
  href.searchParams.set("utm_campaign", campaign)
  return href.toString()
}

/**
 * Rendered on every tracked anchor whose href is on affitor.com, so a check of
 * served HTML can tell a tracked link from a plain one.
 */
export const AFFITOR_ATTR = "data-oa-affitor"

/** affitor.com or any of its subdomains. */
export function isAffitorHref(href: string): boolean {
  try {
    const host = new URL(href).hostname
    return host === "affitor.com" || host.endsWith(".affitor.com")
  } catch {
    return false
  }
}

/**
 * /for-brands copy, here so a test can hold it to "no pricing, no promises".
 * The Affitor sentence states only what affitor.com's own home page says
 * (checked 2026-10-13): an affiliate network for SaaS; connect Stripe; set
 * revenue share, CPC or CPL commissions; share the program link.
 */
export const FOR_BRANDS = {
  title: "For brands",
  h1: "List your affiliate program, or run one on Affitor",
  description:
    "Add your affiliate program to OpenAffiliate, the open registry people and AI agents search, or launch a program on Affitor.",
  body:
    "OpenAffiliate is an open registry of affiliate programs that people and AI agents search. Submit your program, or correct an existing listing, and the change lands as a public pull request. If you don't run a program yet, Affitor, the affiliate network for SaaS that maintains OpenAffiliate, lets you launch one: connect Stripe, set revenue share, CPC or CPL commissions, and share your program link with partners.",
  submit: "Submit your program",
  /** The link to /for-brands in the program page's brand box. */
  programPageLink: "List your program",
  affitor: "Run one on Affitor",
} as const
