/**
 * Screenshots of brands' public affiliate pages shown on standard /best posts.
 * Each was taken headless (capture-media skill, slate window frame) at the
 * URL the program's YAML cites as its source, after checking the host against
 * schema/blocked-hosts.json and the site's robots.txt; every request to a
 * blocked host, sub-resources included, was aborted, and a page behind a bot
 * challenge was skipped, never bypassed. A program with no entry shows its
 * logo card instead.
 */
export interface Capture {
  /** Public path of the 1200 px WebP. */
  src: string
  /** The page captured, as the reader can open it. */
  url: string
  /** YYYY-MM-DD the capture was taken. */
  captured: string
  width: number
  height: number
}

const HOSTING = "2026-10-21"
const shot = (slug: string, url: string, captured = HOSTING): Capture => ({
  src: `/media/best/hosting/${slug}-affiliate-page.webp`,
  url,
  captured,
  width: 1200,
  height: 813,
})

export const CAPTURES: Record<string, Capture> = {
  nestify: shot("nestify", "https://nestify.io/affiliates/"),
  "hosting-com": shot("hosting-com", "https://hosting.com/about/affiliate-program/"),
  "bunny-net": shot("bunny-net", "https://bunny.net/affiliate/"),
  contabo: shot("contabo", "https://contabo.com/en-us/affiliate-program/"),
  greengeeks: shot("greengeeks", "https://www.greengeeks.com/affiliates"),
  hostpapa: shot("hostpapa", "https://www.hostpapa.com/about-hostpapa/affiliates/"),
  infomaniak: shot("infomaniak", "https://www.infomaniak.com/en/membership"),
  kinsta: shot("kinsta", "https://kinsta.com/affiliates/"),
  verpex: shot("verpex", "https://affiliates.verpex.com/affiliates/"),
}

/** Why a program on a standard post has no capture, said on the page next to its logo. */
export const CAPTURE_SKIPPED: Record<string, string> = {
  // 2026-10-21: robots.txt and the affiliate page both answered 403 to an automated client.
  siteground: "the page did not load for our automated browser, so we show the logo instead",
}

/** "kinsta.com/affiliates": the URL as a caption shows it. */
export function captureHost(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")
}
