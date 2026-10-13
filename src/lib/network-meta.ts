/**
 * Everything the site says about an affiliate network, in one place: the name
 * a reader sees, how you join, a one-line description and the logo.
 *
 * Stored network values are lowercase slugs ("partnerstack", "cj-affiliate"),
 * which read as a typo in a heading or mid-sentence. Before this record there
 * were four separate name maps, and pages that used none of them printed the
 * raw slug: "partnerstack Affiliate Programs" as a page title.
 *
 * Its own module, with no registry import, so the client components that label
 * networks (rankings, the program list filter) can use it without shipping
 * registry.json to the browser. programs.ts re-exports all of it.
 */

/**
 * Marketplaces publish a directory you browse and apply through. Affiliate
 * software has none: the brand runs its own program on someone else's
 * infrastructure, so the only way in is through the brand. Direct means the
 * brand runs the program itself.
 *
 * Classified from each network's own pages. Dub and Lemon Squeezy were once
 * filed as software; both now run a directory where partners browse and apply
 * (dub.co/help/article/program-marketplace, Lemon Squeezy's Affiliate Hub).
 */
export type NetworkKind = "marketplace" | "software" | "direct"

export const NETWORK_KIND_LABEL: Record<NetworkKind, string> = {
  marketplace: "Marketplace",
  software: "Software",
  direct: "Direct",
}

export interface NetworkMeta {
  /** Display name, cased the way the brand writes it. */
  name: string
  kind: NetworkKind
  /** One factual sentence, 20 words at most. */
  description: string
  website: string | null
  /**
   * Public path of the brand's own mark, taken from its site or brand page and
   * checked by eye. Null shows the initial, the same fallback programs use.
   */
  logo: string | null
}

export const NETWORK_META: Record<string, NetworkMeta> = {
  partnerstack: {
    name: "PartnerStack",
    kind: "marketplace",
    description:
      "Partner platform for B2B SaaS, with a marketplace where partners apply to software companies' affiliate and referral programs.",
    website: "https://partnerstack.com",
    logo: "/logos/partnerstack.png",
  },
  impact: {
    name: "Impact",
    kind: "marketplace",
    description:
      "Partnership management platform (impact.com) with a marketplace connecting brands with affiliates, creators and publishers.",
    website: "https://impact.com",
    logo: "/logos/networks/impact.png",
  },
  rewardful: {
    name: "Rewardful",
    kind: "software",
    description: "Affiliate and customer referral tracking software that SaaS companies use to run their own programs.",
    website: "https://www.rewardful.com",
    logo: "/logos/networks/rewardful.png",
  },
  firstpromoter: {
    name: "FirstPromoter",
    kind: "software",
    description: "Affiliate management software SaaS companies use to run affiliate, referral and influencer programs from one platform.",
    website: "https://firstpromoter.com",
    logo: "/logos/networks/firstpromoter.png",
  },
  dub: {
    name: "Dub",
    kind: "marketplace",
    description: "Link attribution platform for short links and affiliate programs, with a marketplace where partners discover programs.",
    website: "https://dub.co",
    logo: "/logos/dub.png",
  },
  tolt: {
    name: "Tolt",
    kind: "software",
    description: "Affiliate software for SaaS startups running their own program, working with Stripe, Paddle and Chargebee.",
    website: "https://tolt.com",
    logo: "/logos/networks/tolt.png",
  },
  lemonsqueezy: {
    name: "Lemon Squeezy",
    kind: "marketplace",
    description:
      "Merchant of record for software and digital products, with an Affiliate Hub where affiliates browse and join store programs.",
    website: "https://www.lemonsqueezy.com",
    logo: "/logos/lemon-squeezy.jpg",
  },
  "cj-affiliate": {
    name: "CJ Affiliate",
    kind: "marketplace",
    description: "Affiliate network formerly called Commission Junction, where publishers apply to advertisers' programs from one account.",
    website: "https://www.cj.com",
    logo: "/logos/networks/cj-affiliate.svg",
  },
  awin: {
    name: "Awin",
    kind: "marketplace",
    description: "Global affiliate network where publishers join advertisers' programs from one account; Awin also owns ShareASale.",
    website: "https://www.awin.com",
    logo: "/logos/networks/awin.png",
  },
  creem: {
    name: "Creem",
    kind: "software",
    description: "Merchant of record for SaaS with a built-in affiliate platform; partners join each brand's program by invitation or link.",
    website: "https://www.creem.io",
    logo: "/logos/networks/creem.png",
  },
  affitor: {
    name: "Affitor",
    kind: "marketplace",
    description: "AI-native affiliate network for SaaS: one partner account, then apply to each program in its marketplace.",
    website: "https://affitor.com",
    logo: "/logos/networks/affitor.png",
  },
  tapfiliate: {
    name: "Tapfiliate",
    kind: "software",
    description: "Affiliate tracking software that brands use to run their own affiliate and referral programs.",
    website: "https://tapfiliate.com",
    logo: null,
  },
  "in-house": {
    name: "In-house",
    kind: "direct",
    description: "Programs the brand runs itself, on its own site or platform, with no network account to open first.",
    website: null,
    logo: null,
  },
}

/** Display name for a stored network value. Unknown values are title-cased. */
export function networkName(network: string): string {
  const meta = NETWORK_META[network]
  if (meta) return meta.name
  return network
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

export function networkKind(network: string): NetworkKind {
  return NETWORK_META[network]?.kind ?? "software"
}
