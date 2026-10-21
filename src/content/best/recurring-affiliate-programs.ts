import type { BestPost } from "@/lib/best-posts"

/**
 * Editorial copy for /best/recurring-affiliate-programs, on the standard
 * "best X" layout. No figures in here: every number on the page is read from
 * the registry at build, and scripts/best-posts.test.ts fails on a digit or a
 * spelled-out number in copy. In each `why`, the words in {braces} become the
 * link to the brand's affiliate page (the tracked Apply link).
 */
export const post: BestPost = {
  slug: "recurring-affiliate-programs",
  checked: "2026-10-18",
  layout: "standard",
  title: (n, year) => `${n} Best Recurring Affiliate Programs in ${year}`,
  description:
    "Recurring affiliate programs that keep paying while referrals stay subscribed: email, web, sales and dev tools, with terms checked on each brand's page.",
  intro:
    "A recurring commission pays you again each time your referral pays, so how long it lasts matters as much as the rate. We read each program's own terms for the rate, the length and the rules.",
  lookFor: {
    heading: "How to choose a recurring affiliate program",
    intro: "Programs with the same rate can pay very different totals. Check these before you apply:",
    criteria: [
      {
        name: "How long it recurs",
        text: "Some programs pay for the first year, some for a set number of months, and some for as long as the customer stays. The length is often worth more than a few points of rate.",
        link: { href: "/best/lifetime-affiliate-programs", label: "See lifetime programs" },
      },
      {
        name: "What the share is taken from",
        text: "A share of the plan price, of net revenue after fees, or of fees the customer pays all read the same in a headline and pay differently.",
      },
      {
        name: "Whether your readers stay",
        text: "Recurring pay depends on retention. A tool your readers keep using beats a higher rate on one they cancel after a month.",
      },
      {
        name: "Who can join",
        text: "Some programs approve anyone, some review each site, and a few are open only to their own paying customers.",
      },
      {
        name: "Getting paid",
        text: "Check the payout minimum, the schedule and the method. A program run on a network pays on that network's terms.",
        link: { href: "/programs?type=recurring&payout=paypal", label: "See recurring programs that pay by PayPal" },
      },
    ],
  },
  guides: ["how-to-start-affiliate-marketing", "make-money-with-affiliate-marketing"],
  programs: [
    {
      slug: "convertkit",
      bestFor: "Best for creators and newsletter writers",
      verdict: "One of the most natural recommendations for any audience that builds an email list, with a status bonus for partners who keep referring.",
      why: "Kit is the email platform built for creators: bloggers, YouTubers, podcasters and course creators use it for newsletters, automations and landing pages. Its {affiliate program} pays a share of each referral's payments for their first year, and partners who keep referring move up to a status level with an ongoing bonus after that.",
    },
    {
      slug: "webflow",
      bestFor: "Best for designers and no-code builders",
      verdict: "A strong fit for web design, agency and no-code content, where readers are choosing a platform for a client or a portfolio.",
      why: "Webflow lets designers and developers build production websites visually, with a CMS and hosting included. The {Webflow affiliate program} pays a share of a referred customer's subscription for their first year on a paid plan, and applications are reviewed by hand.",
    },
    {
      slug: "waalaxy",
      bestFor: "Best for sales and LinkedIn outreach audiences",
      verdict: "Pays for as long as your referral pays, and approves applications automatically.",
      why: "Waalaxy automates LinkedIn and email outreach for lead generation. Its {affiliate program} pays a share of your referrals' payments for as long as they keep paying.",
    },
    {
      slug: "ticket-tailor",
      bestFor: "Best for event organizers",
      verdict: "A share of the fees your referral pays for as long as they use it, a fit for content for people who run events.",
      why: "Ticket Tailor makes selling tickets easy and affordable for event creators. Its {partner program} pays a share of the ticketing fees your referral is charged, monthly, for as long as they remain a user.",
    },
    {
      slug: "better-stack",
      bestFor: "Best for developer and DevOps audiences",
      verdict: "A good fit for technical newsletters and channels whose readers run services in production.",
      why: "Better Stack combines uptime monitoring, logs and incident response for engineering teams. Its {affiliate program} pays a share of the net revenue from each referred customer for their first year, after the money-back period.",
    },
    {
      slug: "fathom-analytics",
      bestFor: "Best for privacy-minded site owners",
      verdict: "Only for Fathom's own paying customers, and your readers get a discount on their first invoice.",
      why: "Fathom is a privacy-first, cookie-free alternative to Google Analytics, for site owners who want fast dashboards and simple pricing. Its {affiliate program} is open to paying Fathom customers and pays a recurring share, claimed by Wise bank transfer or taken as account credit.",
    },
    {
      slug: "landbot",
      bestFor: "Best for chatbot and lead capture content",
      verdict: "A recurring share on every plan for up to a set period, a fit for marketing and lead generation content.",
      why: "Landbot builds chatbots for websites and WhatsApp to capture leads, answer support questions and run surveys. Its {affiliate program} pays a recurring commission on all plans for up to a set period, monthly through PartnerStack.",
    },
    {
      slug: "krispcall-communications-inc",
      bestFor: "Best for business phone audiences",
      verdict: "Pays on subscriptions and renewals for the life of the account, a fit for business communications content.",
      why: "KrispCall is a cloud phone system that brings calls, SMS, voicemail and virtual numbers into one app. Its {affiliate program} pays a share of workspace subscriptions and renewals made through your referral.",
    },
    {
      slug: "surveysparrow",
      bestFor: "Best for survey and feedback tools",
      verdict: "A share of every sale for the lifetime of the customer, a fit for research and customer experience content.",
      why: "SurveySparrow makes mobile-friendly surveys with a chat-like experience. Its {partner program} pays a share of every sale, recurring over the lifetime of the customer.",
    },
    {
      slug: "raycast",
      bestFor: "Best for Mac power users",
      verdict: "A Mac-only tool with a discount for your referrals, so it suits developer and productivity audiences on macOS.",
      why: "Raycast is a productivity launcher for macOS built for developers. Its {affiliate program} pays a recurring share of Pro subscriptions, paid in pounds sterling through Wise, and your referrals get a discount when they sign up.",
    },
    {
      slug: "kyma-api",
      bestFor: "Best for developers building with AI",
      verdict: "An API, not an app, so it fits technical readers who build with AI models.",
      why: "Kyma API gives developers one account, key and balance for chat, reasoning, image, video and audio models. Its {affiliate program} pays a recurring share of what your referrals spend for a fixed period.",
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
    "We started from the programs in our registry whose commission is recurring and whose terms we verified on the brand's own page, then picked a mix across email, web, sales, developer and business tools, starting with the programs readers find us for in search. A commission that recurs for a year and one that recurs for life sit side by side here, so check the length in each section.",
  related: ["ai-affiliate-programs", "saas-recurring-affiliate-programs", "high-paying-affiliate-programs"],
}
