/**
 * Links from OpenAffiliate to a brand's own site carry one UTM shape, added at
 * render time: the YAML keeps the brand's plain URL. No registry import, so
 * client components can use it.
 */

import { isAffitorHref } from "@/lib/affitor-link"

/** Where on OA the reader left from: the utm_medium of the link. */
export type OutboundSurface = "program_page" | "list" | "compare" | "blog"

/**
 * `url` with utm_source=openaffiliate, utm_medium=<surface>, utm_campaign=<slug>.
 * Returned unchanged: affitor.com links (affitorUrl tags those), a URL that
 * already carries any utm_* parameter (the brand's own tag wins), and anything
 * that is not an absolute http(s) URL.
 */
export function outboundUrl(url: string, surface: OutboundSurface, slug: string): string {
  let href: URL
  try {
    href = new URL(url)
  } catch {
    return url
  }
  if (href.protocol !== "https:" && href.protocol !== "http:") return url
  if (isAffitorHref(url)) return url
  for (const key of href.searchParams.keys()) if (key.toLowerCase().startsWith("utm_")) return url
  href.searchParams.set("utm_source", "openaffiliate")
  href.searchParams.set("utm_medium", surface)
  href.searchParams.set("utm_campaign", slug)
  return href.toString()
}
