import { AFFITOR_MARKETPLACE } from "./affitor-link"

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
/** A capture in public/media/best/<dir>/: "hosting" for the first post, "programs" for every later one (a program can appear in several posts). */
const shot = (slug: string, url: string, captured = HOSTING, dir = "hosting"): Capture => ({
  src: `/media/best/${dir}/${slug}-affiliate-page.webp`,
  url,
  captured,
  width: 1200,
  height: 813,
})
const program = (slug: string, url: string, captured = "2026-10-21") => shot(slug, url, captured, "programs")

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
  // Phase 1a (recurring, lifetime, saas posts), captured 2026-10-21.
  webflow: program("webflow", "https://webflow.com/solutions/affiliates"),
  waalaxy: program("waalaxy", "https://www.waalaxy.com/affiliate-program"),
  "better-stack": program("better-stack", "https://betterstack.com/affiliates"),
  "fathom-analytics": program("fathom-analytics", "https://usefathom.com/affiliates"),
  landbot: program("landbot", "https://landbot.io/affiliates"),
  surveysparrow: program("surveysparrow", "https://surveysparrow.com/partners/"),
  raycast: program("raycast", "https://www.raycast.com/blog/affiliate-program"),
  blogify: program("blogify", "https://blogify.ai/partner-program/"),
  "snov-io": program("snov-io", "https://snov.io/affiliate-program"),
  "123formbuilder": program("123formbuilder", "https://www.123formbuilder.com/affiliate-program/"),
  clickmagick: program("clickmagick", "https://www.clickmagick.com/referral-program/"),
  fliki: program("fliki", "https://fliki.ai/affiliate-program"),
  ghost: program("ghost", "https://ghost.org/referrals/"),
  helpcrunch: program("helpcrunch", "https://helpcrunch.com/affiliate-program.html"),
  mailerlite: program("mailerlite", "https://www.mailerlite.com/affiliate"),
  "pabbly-connect": program("pabbly-connect", "https://www.pabbly.com/affiliates/"),
  "1password": program("1password", "https://1password.com/partners"),
  idrive: program("idrive", "https://www.idrive.com/reseller/"),
  vwo: program("vwo", "https://wingify.com/partners/affiliate/"),
  cloudtalk: program("cloudtalk", "https://www.cloudtalk.io/affiliate-program/"),
  "housecall-pro": program("housecall-pro", "https://www.housecallpro.com/paid-affiliates/"),
  seerist: program("seerist", `${AFFITOR_MARKETPLACE}/seerist`),
}

/** Why a program on a standard post has no capture (a record; the page shows the logo card). */
export const CAPTURE_SKIPPED: Record<string, string> = {
  // 2026-10-21: robots.txt and the affiliate page both answered 403 to an automated client.
  siteground: "the page did not load for our automated browser, so we show the logo instead",
  // 2026-10-21: the page answered 403 with a bot challenge ("Just a moment..."); not bypassed.
  "ticket-tailor": "the page answered with a bot challenge, which we do not bypass",
  // Hosts in schema/blocked-hosts.json: never requested.
  convertkit: "kit.com is on our blocked-hosts list (website terms restrict automated access)",
  "krispcall-communications-inc": "krispcall.com is on our blocked-hosts list (terms on automated access not yet resolved)",
  thinkific: "thinkific.com is on our blocked-hosts list (website terms restrict automated access)",
  brevo: "brevo.com is on our blocked-hosts list (website terms restrict automated access)",
  freshbooks: "freshbooks.com is on our blocked-hosts list (website terms restrict automated access)",
  similarweb: "its affiliate page is on PartnerStack, which is on our blocked-hosts list",
  "streak-crm-for-gmail": "its affiliate page is on PartnerStack, which is on our blocked-hosts list",
  tresorit: "its affiliate page is on PartnerStack, which is on our blocked-hosts list",
  "beautiful-ai": "its affiliate page is on PartnerStack, which is on our blocked-hosts list",
}

/** "kinsta.com/affiliates": the URL as a caption shows it. */
export function captureHost(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")
}
