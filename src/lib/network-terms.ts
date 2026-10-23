/**
 * What each affiliate network's own public pages say about joining and about
 * how partners get paid, for the /best/affiliate-networks post. Every claim
 * carries the words it rests on, the page and the day we read it; nothing is
 * written from memory. A network whose host is on schema/blocked-hosts.json
 * (PartnerStack, Dub) is never read, so it has no entry here, and the post
 * says its programs' own terms apply instead.
 */
export interface NetworkClaim {
  /** What the post says, in our words. */
  text: string
  /** The network's own words, verbatim. */
  quote: string
  source: string
  /** YYYY-MM-DD the page was read. */
  checked: string
}

export interface NetworkTerms {
  /** How a partner joins the network and its programs. */
  join: NetworkClaim
  /** How the network pays partners. */
  paid: NetworkClaim
}

export const NETWORK_TERMS: Record<string, NetworkTerms> = {
  impact: {
    join: {
      text: "Apply to partner with brands directly from their pages in the marketplace, then use their tracking links.",
      quote: "Apply to partner with brands directly from their product pages, then grab tracking links to start earning.",
      source: "https://impact.com/partners/",
      checked: "2026-10-21",
    },
    paid: {
      text: "Impact pays publishers in more than 70 currencies.",
      quote: "pays you in 70+ currencies",
      source: "https://impact.com/partners/affiliate-partners/",
      checked: "2026-10-21",
    },
  },
  "cj-affiliate": {
    join: {
      text: "Create a publisher account, then join brands' programs from CJ's network.",
      quote: "Gain instant access to our global network of brands and join programs with a single click.",
      source: "https://www.cj.com/publisher",
      checked: "2026-10-21",
    },
    paid: {
      text: "Two payouts a month, in more than 150 currencies, by direct deposit or Payoneer.",
      quote: "We offer dozens of payout currencies and two monthly payouts. … Get paid in over 150 currencies via direct deposit or our global payments partner, Payoneer",
      source: "https://www.cj.com/publisher",
      checked: "2026-10-21",
    },
  },
  awin: {
    join: {
      text: "Every publisher is verified before joining; a $1 deposit, refunded at the first payment threshold, is asked to join. Then you apply to each advertiser's program. A website is not required.",
      quote: "Awin asks for a $1 deposit to join the platform to verify your bank account details … Join our network via our simple sign up process. Once approved, you can then apply to join individual advertiser programs. … Can I do affiliate marketing without a website? Yes",
      source: "https://www.awin.com/us/faqs",
      checked: "2026-10-21",
    },
    paid: {
      text: "Payments run on the 1st and 15th of each month; how long a commission takes to pay depends on the advertiser.",
      quote: "Awin runs payments on the 1st and 15th of every month. … Payment times can vary per advertiser and per sector.",
      source: "https://www.awin.com/us/faqs",
      checked: "2026-10-21",
    },
  },
  lemonsqueezy: {
    join: {
      text: "Lemon Squeezy reviews every applicant to its Affiliate Hub; approved affiliates then apply to each store's program, and some programs approve automatically.",
      quote: "Lemon Squeezy reviews and vets every new applicant to the affiliates platform. … Note that some programs may auto-approve new applications",
      source: "https://docs.lemonsqueezy.com/help/affiliates/becoming-an-affiliate",
      checked: "2026-10-21",
    },
    paid: {
      text: "Payouts on the 14th and 28th of each month after a 30-day hold, by bank or PayPal in USD; a 2% fee is taken from each referral.",
      quote: "Referral commissions are held for 30 days before becoming available and then payouts are paid on the 14th and 28th of the month. … You can set up payouts to be made to a bank account or a PayPal account. … A small 2% fee will be taken from each referral",
      source: "https://docs.lemonsqueezy.com/help/affiliates/payouts",
      checked: "2026-10-21",
    },
  },
  affitor: {
    join: {
      text: "Create a free partner account, then apply to each program in the marketplace; some approve instantly, others review by hand.",
      quote: "Browse the Affitor Marketplace, apply to a program in one click, and get approved. … Instant approval — the program auto-accepts partners. … Manual review — the brand reviews applications.",
      source: "https://affitor.com/docs/partners/quickstart/find-and-join-programs",
      checked: "2026-10-21",
    },
    paid: {
      text: "Withdraw from $20 to Wise or a bank account, once the brand has paid the invoice that covers the commission.",
      quote: "you can withdraw it only once the brand has paid the invoice that covers it. … Affitor pays partners through Wise. … The minimum withdrawal is $20",
      source: "https://affitor.com/docs/partners/payouts",
      checked: "2026-10-21",
    },
  },
}
