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
  // Phase 1b (high-paying, beginners, free posts), captured 2026-10-21.
  dreamhost: program("dreamhost", "https://www.dreamhost.com/affiliates/"),
  moz: program("moz", "https://moz.com/moz-affiliate"),
  interserver: program("interserver", "https://www.interserver.net/affiliate.html"),
  "wp-engine": program("wp-engine", "https://wpengine.com/affiliate-program/"),
  elementor: program("elementor", "https://elementor.com/affiliates/signup/"),
  "creative-fuel": program("creative-fuel", "https://creativefuel.ai/affiliates"),
  storychief: program("storychief", "https://www.storychief.io/partnership-program"),
  craft: program("craft", "https://www.craft.do/affiliates"),
  "se-ranking": program("se-ranking", "https://seranking.com/affiliate.html"),
  "eleven-labs-inc": program("eleven-labs-inc", "https://elevenlabs.io/affiliates"),
  uptimerobot: program("uptimerobot", "https://uptimerobot.com/affiliate/"),
  "simplybook-me": program("simplybook-me", "https://simplybook.me/en/affiliate-program"),
  pixelcut: program("pixelcut", "https://www.pixelcut.ai/affiliate"),
  xtiles: program("xtiles", "https://xtiles.app/en/affiliate/"),
  metricool: program("metricool", "https://metricool.com/affiliate-program/"),
  thematic: program("thematic", "https://hellothematic.com/thematic-affiliate-squad/"),
  "copyspace-ai": program("copyspace-ai", "https://www.copyspace.ai/affiliates"),
  revid: program("revid", "https://www.revid.ai/affiliates"),
  vidyo: program("vidyo", "https://quso.ai/affiliate-program"),
  voila: program("voila", "https://www.getvoila.ai/affiliate-program"),
  vsub: program("vsub", "https://vsub.io/affiliate"),
  // Phase 1c (AI, marketing, design posts), captured 2026-10-21.
  runway: program("runway", "https://runway.com/affiliate-program"),
  heygen: program("heygen", "https://www.heygen.com/geniverse/social-creator-program"),
  adcreative: program("adcreative", "https://www.adcreative.ai/affiliate"),
  synthesia: program("synthesia", "https://www.synthesia.io/partners/affiliates"),
  "opus-clip": program("opus-clip", "https://www.opus.pro/affiliate"),
  clickfunnels: program("clickfunnels", "https://www.clickfunnels.com/affiliate-program"),
  nightwatch: program("nightwatch", "https://nightwatch.io/seo-affiliate-program/"),
  seobility: program("seobility", "https://www.seobility.net/en/affiliates/"),
  "frase-io": program("frase-io", "https://www.frase.io/partners/affiliates"),
  wisepops: program("wisepops", "https://wisepops.com/partner-program"),
  databox: program("databox", "https://databox.com/affiliate-program"),
  foreplay: program("foreplay", "https://www.foreplay.co/affiliates"),
  themify: program("themify", "https://themify.me/affiliates"),
  brandbird: program("brandbird", "https://www.brandbird.app/affiliates"),
  "pineapple-builder": program("pineapple-builder", "https://www.pineapplebuilder.com/affiliates"),
  strikingly: program("strikingly", "https://www.strikingly.com/affiliate-program"),
  templatemonster: program("templatemonster", "https://affiliates.templatemonster.com/affiliates/"),
  "beaver-builder": program("beaver-builder", "https://www.wpbeaverbuilder.com/affiliates/"),
  visme: program("visme", "https://www.visme.co/partners/"),
  pikzels: program("pikzels", "https://pikzels.com/affiliate"),
  fotor: program("fotor", "https://www.fotor.com/affiliates.html"),
  "kyma-api": program("kyma-api", `${AFFITOR_MARKETPLACE}/kyma-api`),
  // Phase 1d (sales, rewardful posts), captured 2026-10-21.
  notroa: program("notroa", `${AFFITOR_MARKETPLACE}/notroa`),
  mailshake: program("mailshake", "https://mailshake.com/affiliate-program/"),
  salesblink: program("salesblink", "https://affiliate.salesblink.io/program"),
  close: program("close", "https://close.com/partners"),
  hunter: program("hunter", "https://hunter.io/affiliate-program"),
  pumpgtm: program("pumpgtm", "https://pumpgtm.com/ambassadors"),
  "capsule-and-transpond": program("capsule-and-transpond", "https://capsulecrm.com/partner-program/affiliate/"),
  dalilou: program("dalilou", `${AFFITOR_MARKETPLACE}/dalilou`),
  fullenrich: program("fullenrich", "https://fullenrich.com/affiliates"),
  "talkio-ai": program("talkio-ai", "https://www.talkio.ai/partners/affiliates"),
  bannerbear: program("bannerbear", "https://www.bannerbear.com/affiliate/"),
  nuelink: program("nuelink", "https://nuelink.com/affiliate"),
  ocoya: program("ocoya", "https://www.ocoya.com/affiliates"),
  mindstamp: program("mindstamp", "https://mindstamp.com/affiliates"),
  podia: program("podia", "https://www.podia.com/affiliates"),
  transistor: program("transistor", "https://transistor.fm/affiliates/"),
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
  marketerhire: "marketerhire.com is on our blocked-hosts list (website terms restrict automated access)",
  rippling: "its affiliate page is on PartnerStack, which is on our blocked-hosts list",
  saleshandy: "saleshandy.com is on our blocked-hosts list (website terms restrict automated access)",
  melio: "melio.com is on our blocked-hosts list (website terms restrict automated access)",
  "speak-ai": "speakai.co is on our blocked-hosts list (website terms restrict automated access)",
  "cal-com": "cal.com is on our blocked-hosts list (website terms restrict automated access)",
  // 2026-10-21: the signup page is served with its styles from getrewardful.com, a blocked host, so it rendered unstyled; not used.
  manatal: "its signup page loads its styles from a blocked host and rendered unstyled",
  reclaim: "its affiliate page is on PartnerStack, which is on our blocked-hosts list",
  gamma: "its affiliate page is on PartnerStack, which is on our blocked-hosts list",
  "campaign-monitor-by-marigold": "its affiliate page is on PartnerStack, which is on our blocked-hosts list",
  teikametrics: "its affiliate page is on PartnerStack, which is on our blocked-hosts list",
  later: "its affiliate page is on PartnerStack, which is on our blocked-hosts list",
  envato: "envato.com is on our blocked-hosts list (website terms restrict automated access)",
  // 2026-10-21: affiliate.decktopus.com is a Rewardful-hosted portal (CNAME domains.rewardful.com); never requested.
  decktopus: "its affiliate pages are hosted by Rewardful, which is on our blocked-hosts list",
  "originality-ai": "originality.ai is on our blocked-hosts list (website terms restrict automated access)",
  // 2026-10-21: outranking.io/affiliate-program answered 521 (origin down).
  outranking: "the page did not load when we captured it, so we show the logo instead",
  // 2026-10-21: the only affiliate page the brand publishes is its terms document.
  "neurith-tools": "its only affiliate page is a terms document, so we show the logo instead",
}

/** "kinsta.com/affiliates": the URL as a caption shows it. */
export function captureHost(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")
}

/**
 * Networks' public pages for partners on /best/affiliate-networks, captured
 * 2026-10-21 with every blocked host aborted and a request log per page. A
 * network whose host is blocked (PartnerStack, Dub) has a reason instead.
 */
const network = (key: string, url: string): Capture => ({
  src: `/media/best/networks/${key}-partner-page.webp`,
  url,
  captured: "2026-10-21",
  width: 1200,
  height: 813,
})

export const NETWORK_CAPTURES: Record<string, Capture> = {
  impact: network("impact", "https://impact.com/partners/affiliate-partners/"),
  "cj-affiliate": network("cj-affiliate", "https://www.cj.com/publisher"),
  awin: network("awin", "https://www.awin.com/us/publishers/content-creator-influencer"),
  lemonsqueezy: network("lemonsqueezy", "https://docs.lemonsqueezy.com/help/affiliates/becoming-an-affiliate"),
  affitor: network("affitor", `${AFFITOR_MARKETPLACE}`),
}

export const NETWORK_CAPTURE_SKIPPED: Record<string, string> = {
  partnerstack: "partnerstack.com is on our blocked-hosts list (its platform terms bar automated access)",
  dub: "dub.co is on our blocked-hosts list (Dub network listings are never fetched by our lanes)",
}
