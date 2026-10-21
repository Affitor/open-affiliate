import type { BestPost } from "@/lib/best-posts"

/**
 * Editorial copy for /best/free-affiliate-programs. No figures in here: every
 * number on the page is read from the registry at build, and
 * scripts/best-posts.test.ts fails on a digit or a spelled-out number in copy.
 */
export const post: BestPost = {
  slug: "free-affiliate-programs",
  checked: "2026-10-18",
  title: (n, year) => `${n} Free Affiliate Programs to Join in ${year}`,
  description:
    "Free affiliate programs to join today: the brand pays you, not the other way round, and each one approves new affiliates automatically. Terms checked.",
  intro:
    "A free affiliate program is one you can join without paying and without waiting for someone to approve you. Joining normally costs nothing, because the brand pays you for the customers you send; check each program's full terms for who can join. We do not record sign-up fees, so this list checks the part we can: every program below approves new affiliates automatically, on terms we verified on its own page. Each block shows the commission, the cookie window and the payout minimum where the program publishes them, and the day we last checked the terms.",
  programs: [
    {
      slug: "speak-ai",
      bestFor: "Best for research and sales content",
      why: "Speak AI records, transcribes and analyzes meetings, interviews and other audio and video, for sales teams, researchers and consultants. Sign-up runs through Rewardful with instant access and no approval wait, and there is no fee to join. It pays on every payment a referral makes in their first year, once the referred account has stayed active for a minimum period.",
    },
    {
      slug: "cal-com",
      bestFor: "Best for developer audiences",
      why: "Cal.com is open-source scheduling infrastructure, an alternative to Calendly that can be self-hosted or managed, with an API for embedding scheduling in any product. Approval is instant, it pays a share of referred paid subscriptions for their first year, and referred customers get a discount for their first year too.",
      notFor: "Incentivized traffic: it is not allowed, and neither is misleading bidding on the Cal.com name.",
    },
    {
      slug: "metricool",
      bestFor: "Best for social media managers",
      why: "Metricool plans and schedules posts across Instagram, TikTok, YouTube, LinkedIn and other networks, with analytics, competitor tracking and ads reporting, for creators, brands and agencies. Every Metricool user is enrolled in the program automatically, its affiliate cookies never expire, and the rate moves to a higher tier once you pass a set number of paid registrations, with a cap per referred user at each tier.",
    },
    {
      slug: "thematic",
      bestFor: "Best for YouTubers and video creators",
      why: "Thematic lets video creators license copyright-free songs from real artists for YouTube, Instagram, TikTok and podcasts. Joining its Affiliate Squad needs no approval: it pays a share of the Premium plan for the first year of each referred creator's subscription, referred creators get a free month of Premium, and payouts go out by PayPal.",
    },
    {
      slug: "copyspace-ai",
      bestFor: "Best for bloggers and niche sites",
      why: "CopySpace.ai researches a topic, writes SEO-optimized long-form articles and publishes them with one click, for bloggers, niche site owners and marketers. Approval is instant after a short application form, it pays a share of every payment for the lifetime of each referred customer, and earnings, conversions and payouts sit in a real-time dashboard.",
    },
    {
      slug: "revid",
      bestFor: "Best for short-form video creators",
      why: "Revid is an AI video tool for short-form content: prompt-to-video clips, remixes of viral TikToks and Reels, UGC-style ads with AI creators, and an autopilot channel that posts every day. The program runs inside your Revid account and pays a share of every payment for as long as the customer stays, credit packs included, and you can create personal codes that give your audience a discount on their first month.",
      notFor: "Coupon sites and brand-keyword ads: neither is allowed, and visits from paid ads never earn a commission.",
    },
    {
      slug: "vidyo",
      bestFor: "Best for podcasters",
      why: "quso.ai, formerly Vidyo.ai, pulls viral clips out of long-form videos with AI captions, reframing and templates for social media. It pays a share of everything a referral pays, every month, for as long as they stay subscribed, paid monthly via PayPal.",
    },
    {
      slug: "voila",
      bestFor: "Best for productivity and writing content",
      why: "Voilà is an AI assistant for the browser, desktop and phone that helps with writing, translating, rewriting tone and asking AI questions while you browse. Signing up on Rewardful gives you a link right away, and it pays on all payments in a referred customer's first year, by PayPal.",
    },
    {
      slug: "vsub",
      bestFor: "Best for faceless and explainer channels",
      why: "Vsub turns a script or a voiceover into an illustrated, narrated video, splitting the text into scenes and drawing every frame in a style cloned from a video you choose, with an API and an MCP server. It pays a share of every subscription payment, the first month and every renewal, for as long as the customer stays subscribed.",
      notFor: "Promoting without your own content: referrals must come from content you publish yourself, and lifetime deals earn nothing.",
    },
  ],
  picks: [
    { label: "Best for researchers", slug: "speak-ai" },
    { label: "Best for developers", slug: "cal-com" },
    { label: "Best for social media", slug: "metricool" },
    { label: "Best for YouTubers", slug: "thematic" },
    { label: "Best for bloggers", slug: "copyspace-ai" },
  ],
  howWeChose:
    "We started from the programs in the OpenAffiliate registry whose verified terms say they approve new affiliates automatically, then our editors picked and ordered a mix of tools our beginners post does not already cover. Automatic approval is what we checked, not fees: read each block for who can join and what traffic is not allowed.",
  affitor: {
    before: "Partners can also join the ",
    anchor: "Affitor marketplace",
    after: " for free and apply to SaaS programs from one account; it is run by the team that maintains OpenAffiliate.",
  },
  related: ["affiliate-programs-for-beginners", "recurring-affiliate-programs", "high-paying-affiliate-programs"],
}
