import type { BestPost } from "@/lib/best-posts"

/**
 * Editorial copy for /best/sales-affiliate-programs, on the standard "best X"
 * layout. No figures in here: every number on the page is read from the
 * registry at build, and scripts/best-posts.test.ts fails on a digit or a
 * spelled-out number in copy. In each `why`, the words in {braces} become the
 * link to the brand's affiliate page (the tracked Apply link).
 */
export const post: BestPost = {
  slug: "sales-affiliate-programs",
  checked: "2026-10-20",
  layout: "standard",
  title: (n, year) => `${n} Best Sales Affiliate Programs in ${year}`,
  description:
    "The best sales tool affiliate programs for lead research, cold outreach, data enrichment, CRM and AI sales agents, with terms checked on each brand's page.",
  intro:
    "Sales tools suit any site that writes for founders, sales teams or agencies: prospecting, outreach and CRM software sits at the center of how they win customers, and most of it bills every month.",
  lookFor: {
    heading: "How to choose a sales affiliate program",
    intro: "Sales programs pay in very different ways under similar headlines. Check these before you apply:",
    criteria: [
      {
        name: "How long it pays",
        text: "A share of the first sale, a year of payments and a lifetime share are different deals. On a CRM customers keep for years, the length matters more than the rate.",
        link: { href: "/best/recurring-affiliate-programs", label: "See recurring programs" },
      },
      {
        name: "Tiers and caps",
        text: "Several sales programs raise the rate as your referred revenue grows, and some cap what one customer can earn you.",
      },
      {
        name: "Rules on outreach",
        text: "Cold email tools are strict about spam: unsolicited bulk email that mentions the brand is usually banned, as is bidding on the brand name.",
      },
      {
        name: "Fit with your readers",
        text: "A prospecting tool suits growth and sales content, a CRM suits small business readers, and an AI sales agent suits website owners.",
      },
      {
        name: "Getting paid",
        text: "Minimums range from none to high thresholds, and some are set in euro. Check the minimum and the method before you count on the income.",
      },
    ],
  },
  guides: ["how-to-start-affiliate-marketing", "affiliate-marketing-for-bloggers"],
  programs: [
    {
      slug: "notroa",
      bestFor: "Best for real estate investor audiences",
      verdict: "A one-time payout for real estate investor audiences.",
      why: "Notroa is a real-estate lead research platform. It pulls property and owner records from county and public sources on demand, combines them so nobody has to do it by hand, and scores the strongest opportunities. Its {affiliate program} pays once per sale, after a short hold, and applications are reviewed.",
    },
    {
      slug: "mailshake",
      bestFor: "Best for cold email and outreach content",
      verdict: "A recurring share with no payout minimum, a fit for cold email and outreach content.",
      why: "Mailshake is a sales engagement platform for cold outreach, with email, phone and social cadences, AI-written sequences, Lead Catcher and a built-in dialer. Its {affiliate program} pays a recurring commission on every sale, though how long it lasts is not published, and affiliates get banners, email templates and a dedicated contact.",
    },
    {
      slug: "neurith-tools",
      bestFor: "Best for lead generation and growth content",
      verdict: "A year of payments on each customer, calculated in euro, with a high payment threshold.",
      why: "Neurith Tools is a suite of AI lead generation and marketing tools sold as one subscription: email sequences, an email finder and verifier, contact extraction, data enrichment, review management, a chatbot and an SEO writer. Its {affiliate terms} pay a share of the eligible purchases and renewals a referred customer makes for a year.",
    },
    {
      slug: "salesblink",
      bestFor: "Best for agencies running outbound",
      verdict: "A lifetime share for agencies and founders who run outbound.",
      why: "SalesBlink is cold email software that automates sales outreach: AI writes emails and builds sequences, and it handles warm-up, deliverability checks, list verification, a unified inbox and meeting scheduling. Its {affiliate program} pays a share of each new customer's subscription for as long as they stay subscribed.",
    },
    {
      slug: "close",
      bestFor: "Best for small business sales content",
      verdict: "A fit for small business sales content, paid on a customer's first year.",
      why: "Close is a CRM for small and midsize businesses with built-in calling, email, automation, coaching and reporting. Its {partner program} pays a share of first-year subscription revenue for every qualified customer, and higher solution-partner tiers earn lifetime commissions up to a cap per customer.",
    },
    {
      slug: "hunter",
      bestFor: "Best for B2B prospecting content",
      verdict: "A fit for B2B prospecting content; bulk email that mentions Hunter is not allowed.",
      why: "Hunter is a B2B lead generation and cold outreach platform: Domain Search, Email Finder and Email Verifier find and check professional addresses, and Sequences sends cold email campaigns. Its {affiliate program} pays a share of a referred customer's payments for their first year, once they upgrade and stay on a paid plan for a minimum period.",
    },
    {
      slug: "pumpgtm",
      bestFor: "Best for creators on X and YouTube",
      verdict: "A fit for creators on X and YouTube, with no follower minimum.",
      why: "PumpGTM finds buyers who signal they are ready to purchase and runs outreach from your own LinkedIn, X, email and Instagram accounts. Its {creator program} pays a share of every payment from customers your link brings in for their first year, and separately pays a flat fee per approved video on X and YouTube, one product per post.",
    },
    {
      slug: "capsule-and-transpond",
      bestFor: "Best for small business CRM content",
      verdict: "A lifetime share for small business CRM content, at a higher rate as your referrals grow.",
      why: "Capsule is an easy-to-use CRM for small businesses, and Transpond is its marketing companion. Its {affiliate program} pays a share of each referred customer's payments for the customer's lifetime, at a higher rate as your referred customers grow, once the team approves proof of your Capsule or Transpond content.",
    },
    {
      slug: "dalilou",
      bestFor: "Best for website conversion content",
      verdict: "A fit for website conversion content, paid for a customer's first year.",
      why: "Dalilou is an AI sales agent that turns website visitors into qualified leads through automated conversations, lead qualification and scoring, and on eligible plans lets prospects book appointments in its widget. Its {affiliate program} pays a share of each referred customer's payments for a set period, and applications are reviewed.",
    },
    {
      slug: "fullenrich",
      bestFor: "Best for data and RevOps audiences",
      verdict: "A tiered rate with no payout minimum; paid ads cannot be used.",
      why: "FullEnrich is a B2B waterfall enrichment platform that finds work emails and mobile numbers by cascading through many data vendors from one account. Its {affiliate program} pays a share that rises by tier as your referred sales grow. Its affiliate page and its PartnerStack listing describe the commission length differently.",
    },
  ],
  picks: [
    { label: "Best for cold email", slug: "mailshake" },
    { label: "Best for B2B prospecting", slug: "hunter" },
    { label: "Best for small business CRM", slug: "capsule-and-transpond" },
    { label: "Best for creators", slug: "pumpgtm" },
    { label: "Best for lead research", slug: "notroa" },
  ],
  howWeChose:
    "We started from the programs in the Sales category of the OpenAffiliate registry whose terms we verified in the last few months, then our editors picked a mix across lead research, cold outreach, data enrichment, CRM and AI sales agents and ordered them by commission as the registry records it. A share of the first sale, a year of payments and a lifetime share are different deals, so check how long each one pays.",
  related: ["sales-recurring-affiliate-programs", "saas-affiliate-programs", "recurring-affiliate-programs"],
  category: "Sales",
}
