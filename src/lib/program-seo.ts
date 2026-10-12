import { commissionDisplay, commissionUnknown, isCreditReward, IN_HOUSE, type Program } from "@/lib/programs"

const SITE = "https://openaffiliate.dev"

export function isDiscontinued(p: Program): boolean {
  return p.status === "discontinued"
}

/** Signup page broken or sources disagree: last known terms stay up, labelled as such. */
export function isPaused(p: Program): boolean {
  return p.status === "paused"
}

/** Active but no quote from the brand's own page backs the terms. */
export function isUnverified(p: Program): boolean {
  return !p.verified && !isDiscontinued(p) && !isPaused(p)
}

/**
 * Network names as a reader writes them. Raw values are lowercase slugs
 * ("awin", "in-house"), which read like a defect in a sentence.
 */
export function networkName(p: Program): string | null {
  const n = p.network ?? null
  if (!n) return null
  if (n === IN_HOUSE) return "the brand's own platform"
  const names: Record<string, string> = {
    partnerstack: "PartnerStack",
    impact: "Impact",
    rewardful: "Rewardful",
    awin: "Awin",
    "cj-affiliate": "CJ Affiliate",
    dub: "Dub",
    firstpromoter: "FirstPromoter",
    tolt: "Tolt",
    lemonsqueezy: "Lemon Squeezy",
    tapfiliate: "Tapfiliate",
  }
  return names[n] ?? n
}

/** "20% recurring for 12 months" / "$15 per sale" / null when nothing was published. */
export function earningPhrase(p: Program): string | null {
  const c = p.commission
  if (commissionUnknown(c)) return null
  const amount = commissionDisplay(c)
  // A two-part deal already says what it pays per what; "per sale" after it misreads.
  if (c.mode === "hybrid") return c.duration ? `${amount}, for ${c.duration}` : amount
  if (c.type === "recurring") {
    return c.duration ? `${amount} recurring for ${c.duration}` : `${amount} recurring`
  }
  if (isCreditReward(c)) return `${amount} per referral`
  return `${amount} per sale`
}

/** Title label after the figure; empty when the raw rate already says it. */
function rateLabel(c: Program["commission"]): string {
  if (c.mode === "hybrid") return ""
  if (c.type === "recurring") return " Recurring"
  if (isCreditReward(c)) return " per Referral"
  if (c.mode === "flat") return " per Sale"
  return c.type === "one-time" ? " One-Time" : ""
}

/** Title under 60 characters: the query, the number, the site. No dashes. */
export function seoTitle(p: Program): string {
  if (isDiscontinued(p)) return `${p.name} Affiliate Program: Discontinued | OpenAffiliate`
  const base = `${p.name} Affiliate Program`
  // Unconfirmed figures stay out of the search snippet; the page shows them labelled.
  const rate = isPaused(p)
    ? ": Status Unclear"
    : isUnverified(p)
      ? ": Terms and How to Join"
      : commissionUnknown(p.commission)
        ? ""
        : `: ${commissionDisplay(p.commission)}${rateLabel(p.commission)}`
  const full = `${base}${rate} | OpenAffiliate`
  return full.length <= 60 ? full : `${base}${rate}`.length <= 60 ? `${base}${rate}` : `${base} | OpenAffiliate`
}

/** 120 to 155 characters: what you earn, the terms that decide it, where it runs. */
export function seoDescription(p: Program): string {
  if (isDiscontinued(p)) {
    return `${p.name} no longer runs an affiliate program. Compare similar programs that still pay commission, with their terms and how to join.`
  }
  if (isPaused(p)) {
    return `${p.name} affiliate program status is unclear. See the last known terms, not confirmed, and similar programs that still pay commission.`
  }
  if (isUnverified(p)) {
    return `${p.name} affiliate program: community-submitted terms we have not confirmed, where to check them, and similar programs to compare.`
  }
  const parts: string[] = []
  const earn = earningPhrase(p)
  parts.push(earn ? `Earn ${earn} promoting ${p.name}.` : `${p.name} affiliate program terms.`)
  const terms: string[] = []
  if (p.cookieDays) terms.push(`${p.cookieDays}-day cookie`)
  if (p.payout?.minimum) terms.push(`$${p.payout.minimum} minimum payout`)
  const net = networkName(p)
  if (terms.length) parts.push(`${terms.join(", ")}${net && p.network !== IN_HOUSE ? ` via ${net}` : ""}.`)
  parts.push("How to join and similar programs.")
  let out = parts.join(" ")
  // Under ~120 characters Google tends to rewrite the snippet; add what the product is.
  if (out.length < 120 && p.shortDescription) out = `${out} ${p.shortDescription}.`
  return out.length <= 160 ? out : parts.join(" ")
}

export interface Faq {
  q: string
  a: string
}

/** Questions partners search, answered only from fields we hold. A question with no data is left out. */
export function buildFaq(p: Program): Faq[] {
  const name = p.name
  if (isDiscontinued(p)) {
    return [
      {
        q: `Does ${name} have an affiliate program?`,
        a: `No. ${name} does not run an affiliate program${p.statusNote ? `: ${p.statusNote}` : ""}. The programs listed below pay commission for promoting similar products.`,
      },
    ]
  }
  // No FAQ for terms nobody has confirmed: an FAQ answer reads as a statement of fact.
  if (isPaused(p) || isUnverified(p)) return []
  const faq: Faq[] = []
  const earn = earningPhrase(p)
  if (earn) {
    faq.push({
      q: `How much does the ${name} affiliate program pay?`,
      a: `${earn.charAt(0).toUpperCase()}${earn.slice(1)}.${p.commissionConditions ? ` ${p.commissionConditions}` : ""}`,
    })
  }
  if (p.cookieDays) {
    faq.push({
      q: `How long is the ${name} affiliate cookie?`,
      a: `${p.cookieDays} days${p.attribution ? `, ${p.attribution} attribution` : ""}.`,
    })
  }
  if (p.payout?.minimum || p.payout?.frequency) {
    const methods = p.payoutMethods?.length ? ` by ${p.payoutMethods.join(" or ")}` : ""
    const freq = p.payout?.frequency ? `${p.payout.frequency.charAt(0).toUpperCase()}${p.payout.frequency.slice(1)}` : "Paid"
    faq.push({
      q: `When do ${name} affiliates get paid?`,
      a: `${freq}${methods}${p.payout?.minimum ? `, once you reach the $${p.payout.minimum} minimum` : ""}.`,
    })
  }
  const net = networkName(p)
  const approval =
    p.approval === "auto" ? "Approval is automatic" : p.approval === "invite-only" ? "Entry is by invitation" : p.approval === "manual" ? "Applications are reviewed by hand" : ""
  faq.push({
    q: `How do I join the ${name} affiliate program?`,
    a: [
      `Apply${p.signupUrl ? ` at ${p.signupUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}` : ` on ${name}'s website`}${net && p.network !== IN_HOUSE ? ` (runs on ${net})` : ""}.`,
      approval ? `${approval}${p.approvalTime ? `, usually within ${p.approvalTime}` : ""}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
  })
  if (p.restrictions?.length) {
    faq.push({ q: `What are the rules for ${name} affiliates?`, a: p.restrictions.map((r) => r.replace(/\.+$/, "")).join(". ") + "." })
  }
  return faq
}

/** WebPage + BreadcrumbList + FAQPage. Not Product: a Product without a price gets flagged by Google. */
export function programJsonLd(p: Program, faq: Faq[]) {
  const url = `${SITE}/programs/${p.slug}`
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": url,
        url,
        name: `${p.name} Affiliate Program`,
        description: seoDescription(p),
        about: { "@type": "Organization", name: p.name, url: p.url },
        ...(p.createdAt ? { datePublished: p.createdAt } : {}),
        ...(p.lastVerifiedAt ? { dateModified: p.lastVerifiedAt } : {}),
        publisher: { "@id": `${SITE}/#organization` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Programs", item: `${SITE}/programs` },
          { "@type": "ListItem", position: 2, name: p.category, item: `${SITE}/categories/${p.category.toLowerCase().replace(/\s+/g, "-")}` },
          { "@type": "ListItem", position: 3, name: `${p.name} Affiliate Program` },
        ],
      },
      ...(faq.length
        ? [
            {
              "@type": "FAQPage",
              mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
            },
          ]
        : []),
    ],
  }
}

