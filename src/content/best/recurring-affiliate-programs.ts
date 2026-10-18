import type { BestPost } from "@/lib/best-posts"

/**
 * Editorial copy for /best/recurring-affiliate-programs. No figures in here:
 * every number on the page is read from the registry at build, and
 * scripts/best-posts.test.ts fails on a digit or a spelled-out number in copy.
 */
export const post: BestPost = {
  slug: "recurring-affiliate-programs",
  checked: "2026-10-18",
  title: (n, year) => `${n} Best Recurring Affiliate Programs in ${year}`,
  description:
    "Recurring affiliate programs that keep paying while referrals stay subscribed: email, web, sales and dev tools, with terms checked on each brand's page.",
  intro:
    "A recurring commission pays you again every time the customer you referred pays their bill, so one good referral can earn for months or for as long as they stay. That makes the length of the commission as important as the rate. Every program below lists its commission as recurring on its own terms page, and each block shows how long it lasts and the day we last checked it.",
  programs: [
    {
      slug: "convertkit",
      bestFor: "Best for creators and newsletter writers",
      why: "Kit is the email platform built for creators: bloggers, YouTubers, podcasters and course creators use it for newsletters, automations and landing pages. If your audience builds an email list, it is one of the most natural recommendations there is, and partners who keep referring move up to a status level with an ongoing bonus after the first year.",
      notFor: "Paid ads: referrals from pay-per-click traffic do not count toward the status levels.",
    },
    {
      slug: "webflow",
      bestFor: "Best for designers and no-code builders",
      why: "Webflow lets designers and developers build production websites visually, with a CMS and hosting included. It fits content about web design, agencies and no-code, where readers are often choosing a platform for a client or a portfolio.",
      notFor: "Coupon and cashback sites: the program requires an audience in web design, development or no-code.",
    },
    {
      slug: "waalaxy",
      bestFor: "Best for sales and LinkedIn outreach audiences",
      why: "Waalaxy automates LinkedIn and email outreach for lead generation. Its commission keeps paying for as long as your referral pays, which is rare among sales tools.",
    },
    {
      slug: "ticket-tailor",
      bestFor: "Best for event organizers",
      why: "Ticket Tailor sells tickets for events of every size with simple, low pricing. Its commission is a share of the fees your referral pays for as long as they remain a user, so it suits content for event creators and venues.",
    },
    {
      slug: "better-stack",
      bestFor: "Best for developer and DevOps audiences",
      why: "Better Stack combines uptime monitoring, logs and incident response for engineering teams. It fits technical newsletters and channels where readers run services in production.",
    },
    {
      slug: "fathom-analytics",
      bestFor: "Best for privacy-minded site owners",
      why: "Fathom is a privacy-first, cookie-free alternative to Google Analytics, popular with site owners who want simple dashboards. Your audience also gets a discount on their first invoice.",
      notFor: "Anyone who is not a Fathom customer: the program is open to paying customers only.",
    },
    {
      slug: "landbot",
      bestFor: "Best for chatbot and lead capture content",
      why: "Landbot builds chatbots for websites and WhatsApp to capture leads, answer support questions and run surveys. Its commission recurs on all plans for a fixed period.",
    },
    {
      slug: "krispcall-communications-inc",
      bestFor: "Best for business phone audiences",
      why: "KrispCall is a cloud phone system that brings calls, SMS, voicemail and virtual numbers into one app. Its commission covers subscriptions and renewals, which suits small business and remote team content.",
    },
    {
      slug: "surveysparrow",
      bestFor: "Best for survey and feedback tools",
      why: "SurveySparrow makes mobile-friendly surveys with a chat-like experience. Its commission recurs over the lifetime of the customer.",
    },
    {
      slug: "raycast",
      bestFor: "Best for Mac power users",
      why: "Raycast is a productivity launcher for macOS built for developers. Its commission recurs on every Pro subscription payment, and your referrals get a discount when they sign up.",
      notFor: "Readers on Windows: Raycast is a Mac app, and its payouts are in pounds sterling.",
    },
    {
      slug: "kyma-api",
      bestFor: "Best for developers building with AI",
      why: "Kyma API gives developers one account, key and balance for chat, reasoning, image, video and audio models. Its commission recurs for a fixed period on what your referrals spend.",
      notFor: "Non-technical readers: it is an API, not an app.",
    },
  ],
  picks: [
    { label: "Best for creators", slug: "convertkit" },
    { label: "Best for designers", slug: "webflow" },
    { label: "Best for sales teams", slug: "waalaxy" },
    { label: "Best for developers", slug: "better-stack" },
    { label: "Best for event organizers", slug: "ticket-tailor" },
  ],
  howWeChose:
    "We started from the programs in the OpenAffiliate registry whose commission is listed as recurring and whose terms we have verified on the brand's own page, then our editors picked a mix across email, web, sales, developer and business tools, starting with the programs readers find us for in Google search. Recurring alone is not the whole story: a commission that recurs for a year and one that recurs for life are listed side by side, so check the length in each block.",
  affitor: {
    before: "Several recurring SaaS programs, Kyma API among them, are on the ",
    anchor: "Affitor marketplace",
    after: ", the affiliate network for SaaS that maintains OpenAffiliate.",
  },
  related: ["ai-affiliate-programs", "saas-recurring-affiliate-programs", "high-paying-affiliate-programs"],
}
