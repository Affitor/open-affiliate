import type { BestPost } from "@/lib/best-posts"

/**
 * Editorial copy for /best/sales-affiliate-programs. No figures in here:
 * every number on the page is read from the registry at build, and
 * scripts/best-posts.test.ts fails on a digit or a spelled-out number in copy.
 */
export const post: BestPost = {
  slug: "sales-affiliate-programs",
  checked: "2026-10-20",
  title: (n, year) => `${n} Best Sales Affiliate Programs in ${year}`,
  description:
    "The best sales tool affiliate programs for lead research, cold outreach, data enrichment, CRM and AI sales agents, with terms checked on each brand's page.",
  intro:
    "Sales tools suit any site that writes for founders, sales teams or agencies: prospecting, outreach and CRM software sits at the center of how they win customers, and most of it is billed every month. Every program below is in the Sales category of the OpenAffiliate registry, picked across lead research, cold outreach, data enrichment, CRM and AI sales agents. Each block shows how the program pays, as published in its own terms or network listing, and the day we last checked it.",
  programs: [
    {
      slug: "notroa",
      bestFor: "Best for real estate investor audiences",
      why: "Notroa is a real-estate lead research platform. It pulls property and owner records from county and public sources on demand, combines them so nobody has to do it by hand, and scores and prioritizes the strongest opportunities. It pays once per sale, after a short wait following the sale, and applications are reviewed.",
      notFor: "Brand-keyword search ads: bidding on its brand keywords needs its written permission.",
    },
    {
      slug: "mailshake",
      bestFor: "Best for cold email and outreach content",
      why: "Mailshake is a sales engagement platform for cold outreach: teams build cadences with email, phone and social, write sequences with its SHAKEspeare AI, keep leads in one place with Lead Catcher, call from a built-in dialer and sync leads to their CRM. It pays a recurring commission on every sale with no minimum payout, though how long the recurring commission lasts is not published. Affiliates get banners, email templates, case studies and a dedicated Mailshake contact.",
    },
    {
      slug: "neurith-tools",
      bestFor: "Best for lead generation and growth content",
      why: "Neurith Tools is a suite of AI lead generation and marketing tools sold as one subscription: email sequences and newsletters, an email finder and verifier, contact extraction from websites and B2B social media, data enrichment, review management, a chatbot and an SEO article writer. It pays a share of the eligible purchases and renewals a referred customer makes for a year, calculated in euro, by PayPal or bank transfer once you pass its payment threshold.",
      notFor: "Brand-term search ads: bidding on Neurith Tools brand terms or domain names is not allowed.",
    },
    {
      slug: "salesblink",
      bestFor: "Best for agencies running outbound",
      why: "SalesBlink is cold email software that automates sales outreach: AI writes emails and builds multi-step sequences, and it handles warm-up, deliverability checks, list verification, a unified inbox for replies, meeting scheduling and campaign reporting. It pays a share of each new customer's subscription for as long as they stay subscribed, by wire transfer or PayPal.",
    },
    {
      slug: "close",
      bestFor: "Best for small business sales content",
      why: "Close is a CRM for small and midsize businesses with built-in calling, email, automation, coaching and reporting for customer-facing teams. It pays a share of first-year subscription revenue for every qualified customer, and higher solution-partner tiers earn lifetime commissions up to a cap per customer. Applications are reviewed, usually within a few business days.",
      notFor: "Brand-keyword bidding: it is not allowed, and paid ads follow the guidelines and negative keyword list in its partner library.",
    },
    {
      slug: "hunter",
      bestFor: "Best for B2B prospecting content",
      why: "Hunter is a B2B lead generation and cold outreach platform: Domain Search, Email Finder and Email Verifier find and check professional email addresses, Discover and Signals surface prospects, and Sequences sends cold email campaigns. Its program on Rewardful pays a share of a referred customer's payments for their first year, once they upgrade and stay on a paid plan for a minimum period, monthly via PayPal. Applications are reviewed by hand within about a week.",
      notFor: "Bulk email: unsolicited bulk email that mentions Hunter is not allowed.",
    },
    {
      slug: "pumpgtm",
      bestFor: "Best for creators on X and YouTube",
      why: "PumpGTM finds buyers who signal they are ready to purchase and runs multichannel outreach from your own LinkedIn, X, email and Instagram accounts, with LinkedIn social listening, a signals API and a people data index. Its creator program on Dub pays a share of every payment from customers your link brings in for each customer's first year, monthly with no minimum, and separately pays a flat fee per approved video on X and YouTube, with more once the X post passes a view threshold. There is no follower minimum.",
      notFor: "Roundups for the video fee: the per-post fee needs one product per post, and roundups of several tools do not count.",
    },
    {
      slug: "capsule-and-transpond",
      bestFor: "Best for small business CRM content",
      why: "Capsule is an easy-to-use CRM for small businesses, and Transpond is its marketing companion. The program pays a share of each referred customer's payments for the customer's lifetime, at a higher rate as your referred customers grow, by PayPal each month. Your account is activated once you submit proof of Capsule or Transpond content and the team approves it.",
      notFor: "Coupon sites: assigned discount codes cannot be published on coupon or discount sites.",
    },
    {
      slug: "dalilou",
      bestFor: "Best for website conversion content",
      why: "Dalilou is an AI sales agent that turns website visitors into qualified leads through automated conversations, lead qualification and scoring. It captures contact details, works out what each visitor wants and, on eligible plans, lets prospects book appointments in the Dalilou widget. Commission is paid a set time after each sale, and applications are reviewed.",
      notFor: "Coupon and cashback schemes: unauthorized discount codes, coupons and cashback using its links are not allowed.",
    },
    {
      slug: "fullenrich",
      bestFor: "Best for data and RevOps audiences",
      why: "FullEnrich is a B2B waterfall enrichment platform that finds work emails and mobile numbers by cascading through many data vendors from one account, and enriches contacts from a search, a CSV file, a CRM list or inbound emails. It pays a share that rises by tier as your referred sales grow, and payouts are monthly with no minimum. Its affiliate page and its network listing describe the commission length differently, so check the full terms.",
      notFor: "Paid ads: they cannot be used.",
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
  affitor: {
    before: "Notroa and Dalilou are listed on the ",
    anchor: "Affitor marketplace",
    after: ", an affiliate network for SaaS, along with other SaaS programs you can apply to from one account.",
  },
  related: ["sales-recurring-affiliate-programs", "saas-affiliate-programs", "recurring-affiliate-programs"],
  category: "Sales",
}
