import { byOas, isLive, networksByProgramCount, networkToSlug, type Program } from "./programs"
import { hasNoProgram } from "./no-program"
import { termsConfirmed } from "./confirmed-terms"
import { networkKind, networkName } from "./network-meta"
import { NETWORK_TERMS, type NetworkTerms } from "./network-terms"
import { TERMS_MAX_AGE_DAYS, type LookFor } from "./best-posts"
import type { Faq } from "./program-seo"
import { AFFITOR_MARKETPLACE } from "./affitor-link"
import { BEST_LISTS, bestPath } from "./best-lists"
import { GUIDES, guidePath, guideTitle } from "./guides"
import { READ_MORE_COUNT } from "./best-standard"

/**
 * /best/affiliate-networks: the affiliate networks in the registry, on the
 * standard post layout. A network here is a marketplace that partners join and
 * that pays them itself (network-meta kind "marketplace"); affiliate software
 * (Rewardful, FirstPromoter…) is explained apart. Every figure comes from the
 * registry or from NETWORK_TERMS, which quotes each network's own pages; the
 * copy below holds words only (scripts/best-posts.test.ts fails on a digit).
 */
export interface NetworkCopy {
  /** network-meta key. */
  network: string
  /** The network's own page for partners, linked inline (the {braces} in `why`). */
  partnerUrl: string
  why: string
  verdict: string
}

export interface NetworksPost {
  slug: string
  checked: string
  title: (n: number, year: number) => string
  description: string
  intro: string
  lookFor: LookFor
  networks: NetworkCopy[]
  softwareHeading: string
  softwareText: string
  howWeChose: string
  /** BestList slugs, then guide slugs, for "Read more". */
  related: string[]
  guides: string[]
}

export const NETWORKS_POST: NetworksPost = {
  slug: "affiliate-networks",
  checked: "2026-10-21",
  title: (n, year) => `${n} Best Affiliate Networks in ${year}`,
  description:
    "The best affiliate networks for partners, from PartnerStack and Impact to CJ and Awin: how each pays, how you join, and real programs on each one.",
  intro:
    "An affiliate network gives you one partner account for many brands' programs and pays you on their behalf. These are the networks in our registry that do both, with how each pays and how you join, from their own pages.",
  lookFor: {
    heading: "How to choose an affiliate network",
    intro: "Networks differ less in their pitch than in their terms. Check these before you open an account:",
    criteria: [
      {
        name: "The programs on it",
        text: "A network is only as useful as the brands it carries for your audience, so browse its programs before you sign up.",
        link: { href: "/networks", label: "See every network" },
      },
      {
        name: "How it pays",
        text: "Payout days, methods, currencies and fees differ from network to network, and a brand on it can add its own minimum or hold.",
      },
      {
        name: "How you join",
        text: "Some networks vet every applicant or ask for a deposit, and each brand on a network can still review you before you get a link.",
      },
      {
        name: "Network or software",
        text: "Tracking software runs a brand's own program, and the brand approves and pays you. Only a network gives you one account for many brands.",
      },
    ],
  },
  networks: [
    {
      network: "partnerstack",
      partnerUrl: "https://partnerstack.com",
      why: "PartnerStack is a partner platform for B2B SaaS, with a {marketplace} where partners apply to software companies' affiliate and referral programs. It carries the most programs in our registry, across marketing, sales, finance and developer tools.",
      verdict: "The widest choice of software programs. Its platform terms bar automated access, so we do not read its pages; the payout and approval terms that apply are each program's own.",
    },
    {
      network: "impact",
      partnerUrl: "https://impact.com/partners/affiliate-partners/",
      why: "Impact (impact.com) is a partnership platform whose {affiliate marketplace} connects publishers with brands across many categories, and tracks and pays partners for them.",
      verdict: "A fit for publishers who want many large brands under one account.",
    },
    {
      network: "affitor",
      partnerUrl: AFFITOR_MARKETPLACE,
      why: "Affitor is an affiliate network for SaaS: you open one partner account, then apply to each program in its {marketplace}, where some programs approve you instantly.",
      verdict: "A fit for partners promoting SaaS and AI tools.",
    },
    {
      network: "dub",
      partnerUrl: "https://dub.co",
      why: "Dub is a link attribution platform for short links and affiliate programs, with a {partner marketplace} where partners discover the programs that run on it.",
      verdict: "Our lanes never fetch Dub's network pages, so the payout and approval terms shown are each program's own.",
    },
    {
      network: "awin",
      partnerUrl: "https://www.awin.com/us/publishers/content-creator-influencer",
      why: "Awin is a global affiliate network, and the owner of ShareASale, where {publishers} join advertisers' programs from one account, from websites to social channels.",
      verdict: "A fit for content creators, including those without a website.",
    },
    {
      network: "cj-affiliate",
      partnerUrl: "https://www.cj.com/publisher",
      why: "CJ Affiliate, formerly Commission Junction, is an affiliate network where {publishers} apply to advertisers' programs from one account.",
      verdict: "A fit for publishers working with established brands, with payouts in many currencies.",
    },
    {
      network: "lemonsqueezy",
      partnerUrl: "https://docs.lemonsqueezy.com/help/affiliates/becoming-an-affiliate",
      why: "Lemon Squeezy is a merchant of record for software and digital products, with an {Affiliate Hub} where approved affiliates browse and join store programs.",
      verdict: "A fit for promoting indie software and digital products; a small fee comes out of each referral.",
    },
  ],
  softwareHeading: "Affiliate networks and affiliate software",
  softwareText:
    "Affiliate software is not a network. A brand runs its own program on it, approves you and pays you itself, so there is no network account to open and no marketplace to browse. These programs in our registry run on affiliate software:",
  howWeChose:
    "We listed every affiliate network in the OpenAffiliate registry that runs a marketplace partners join and pays partners itself, ordered by how many live programs we list on each. How each one pays and how you join come from its own public pages, which we quote and date in our data; a network whose terms bar automated reading is shown without them. The example programs are the highest-scoring verified programs on each network.",
  related: ["saas-affiliate-programs", "recurring-affiliate-programs", "rewardful-affiliate-programs"],
  guides: ["what-is-affiliate-marketing", "how-to-start-affiliate-marketing"],
}

export interface NetworkEntry {
  network: string
  name: string
  copy: NetworkCopy
  /** Live programs on the network in the registry, and how many are verified. */
  programs: number
  verified: number
  /** What the network's own pages say; null when we do not read them (its host is on schema/blocked-hosts.json). */
  terms: NetworkTerms | null
  /** Up to EXAMPLES verified programs with fresh terms, in byOas order (OAS, then commission). */
  examples: Program[]
}

export const EXAMPLES = 3

const fresh = (p: Program, asOf: Date) => p.lastVerifiedAt != null && asOf.getTime() - Date.parse(p.lastVerifiedAt) <= TERMS_MAX_AGE_DAYS * 86_400_000

/** The post's networks, most live programs first, each with its registry counts, terms and examples. */
export function networkEntries(post: NetworksPost = NETWORKS_POST, asOf: Date = new Date(post.checked)): NetworkEntry[] {
  const byNetwork = new Map(networksByProgramCount().map((n) => [n.network, n.programs]))
  return post.networks
    .filter((c) => networkKind(c.network) === "marketplace" && byNetwork.has(c.network))
    .map((copy) => {
      const programs = byNetwork.get(copy.network)!
      const examples = programs
        .filter((p) => p.verified && isLive(p) && termsConfirmed(p) && !hasNoProgram(p) && fresh(p, asOf))
        .sort(byOas)
        .slice(0, EXAMPLES)
      return {
        network: copy.network,
        name: networkName(copy.network),
        copy,
        programs: programs.length,
        verified: programs.filter((p) => p.verified).length,
        terms: NETWORK_TERMS[copy.network] ?? null,
        examples,
      }
    })
    .sort((a, b) => b.programs - a.programs || a.name.localeCompare(b.name))
}

/** Affiliate software in the registry (network-meta kind "software"), most live programs first. */
export function softwareEntries(): { network: string; name: string; programs: number }[] {
  return networksByProgramCount()
    .filter((n) => networkKind(n.network) === "software")
    .map((n) => ({ network: n.network, name: networkName(n.network), programs: n.programs.length }))
}

export const networkPath = (network: string) => `/networks/${networkToSlug(network)}`

const andList = (items: string[]) => (items.length < 3 ? items.join(" and ") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`)

/** The FAQ, every figure computed: what the registry holds and what each network's pages say. */
export function networksFaq(entries: NetworkEntry[], esc: (t: string) => string = (t) => t): Faq[] {
  const [first, second, third] = entries
  const software = softwareEntries()
  const paid = entries.filter((e) => e.terms)
  const notRead = entries.filter((e) => !e.terms).map((e) => esc(e.name))
  const faq: Faq[] = []
  if (first) {
    faq.push({
      q: "Which affiliate network has the most programs?",
      a: `In our registry, ${esc(first.name)} leads with ${first.programs} live programs${second ? `, then ${esc(second.name)} (${second.programs})` : ""}${third ? ` and ${esc(third.name)} (${third.programs})` : ""}. The best network for you is the one that carries the brands your audience buys from.`,
    })
  }
  faq.push({
    q: "What is the difference between an affiliate network and affiliate software?",
    a: `A network gives you one partner account for many brands and pays you on their behalf. Affiliate software, such as ${andList(software.slice(0, 3).map((s) => esc(s.name)))}, runs a single brand's program: you apply to the brand, and the brand pays you.`,
  })
  if (paid.length) {
    faq.push({
      q: "How do affiliate networks pay partners?",
      a: `Each network sets its own schedule and methods. ${paid.map((e) => `${esc(e.name)}: ${esc(e.terms!.paid.text.replace(/\.$/, ""))}.`).join(" ")}${notRead.length ? ` We do not read ${andList(notRead)}'s pages, so their programs' own terms apply.` : ""}`,
    })
  }
  const awin = entries.find((e) => e.network === "awin")
  faq.push({
    q: "Do affiliate networks charge partners?",
    a: `Some do. ${[
      awin?.terms ? `Awin asks for a small deposit to join, refunded at your first payment threshold` : null,
      entries.some((e) => e.network === "lemonsqueezy" && e.terms) ? `Lemon Squeezy takes a small fee from each referral` : null,
    ]
      .filter(Boolean)
      .join(", and ")}. Read each network's payout page before you count on a figure.`,
  })
  if (awin?.terms) {
    faq.push({
      q: "Can I join an affiliate network without a website?",
      a: "Awin says a website is not required and accepts social channels. On other networks, check the sign-up rules and each program's own terms, which can ban some channels.",
    })
  }
  return faq
}

/** "7 Best Affiliate Networks in 2026": the count is the networks shown. */
export function networkPostTitle(entries: NetworkEntry[] = networkEntries(), asOf: Date = new Date()): string {
  return NETWORKS_POST.title(entries.length, asOf.getUTCFullYear())
}

export const NETWORKS_POST_PATH = `/best/${NETWORKS_POST.slug}`

/** Read more: the post's related lists, then its guides, the first READ_MORE_COUNT. */
export function networkReadMoreLinks(): { href: string; label: string }[] {
  const lists = NETWORKS_POST.related.flatMap((slug) => BEST_LISTS.filter((l) => l.slug === slug)).map((l) => ({ href: bestPath(l), label: l.h1 }))
  const guides = NETWORKS_POST.guides.flatMap((slug) => GUIDES.filter((g) => g.slug === slug)).map((g) => ({ href: guidePath(g), label: guideTitle(g) }))
  return [...lists, ...guides].slice(0, READ_MORE_COUNT)
}
