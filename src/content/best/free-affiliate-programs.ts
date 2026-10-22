import type { BestPost } from "@/lib/best-posts"

/**
 * Editorial copy for /best/free-affiliate-programs, on the standard "best X"
 * layout. No figures in here: every number on the page is read from the
 * registry at build, and scripts/best-posts.test.ts fails on a digit or a
 * spelled-out number in copy. In each `why`, the words in {braces} become the
 * link to the brand's affiliate page (the tracked Apply link).
 */
export const post: BestPost = {
  slug: "free-affiliate-programs",
  checked: "2026-10-18",
  layout: "standard",
  title: (n, year) => `${n} Free Affiliate Programs to Join in ${year}`,
  description:
    "Free affiliate programs to join today: the brand pays you, not the other way round, and each one approves new affiliates automatically. Terms checked.",
  intro:
    "A free affiliate program is one you can join without paying and without waiting for approval. We do not record sign-up fees, so we checked the part we can: every program below approves new affiliates automatically.",
  lookFor: {
    heading: "How to choose a free affiliate program",
    intro: "Joining costs nothing, so the differences are in the terms. Check these before you sign up:",
    criteria: [
      {
        name: "Who can join",
        text: "Some programs enroll every user automatically; others want your own content, an audience in their niche or an active account.",
      },
      {
        name: "Traffic that does not count",
        text: "Coupon sites, brand-keyword ads and incentivized traffic often earn nothing, so check before you promote.",
      },
      {
        name: "How long it pays",
        text: "A share for the first year and a share for as long as the customer stays read alike and pay very differently.",
        link: { href: "/best/lifetime-affiliate-programs", label: "See lifetime programs" },
      },
      {
        name: "What your readers get",
        text: "A discount or a free month for referred customers makes the link easier to share.",
      },
      {
        name: "Getting paid",
        text: "Check the payout minimum and whether PayPal or a bank transfer works where you live.",
        link: { href: "/best/no-minimum-payout-affiliate-programs", label: "See programs with no minimum" },
      },
    ],
  },
  guides: ["affiliate-marketing-without-a-website", "affiliate-marketing-for-bloggers"],
  programs: [
    {
      slug: "speak-ai",
      bestFor: "Best for research and sales content",
      verdict: "Instant access and no fee to join, a fit for research and sales content.",
      why: "Speak AI records, transcribes and analyzes meetings, interviews and other audio and video, for sales teams, researchers and consultants. Its {affiliate program} pays on every payment a referral makes in their first year, once the referred account has stayed active for a minimum period.",
    },
    {
      slug: "cal-com",
      bestFor: "Best for developer audiences",
      verdict: "Instant approval and a discount for your referrals, a fit for developer audiences.",
      why: "Cal.com is open-source scheduling infrastructure, an alternative to Calendly that can be self-hosted or managed, with an API for embedding scheduling in any product. Its {affiliate program} pays a share of referred paid subscriptions for their first year, and referred customers get a discount for their first year too.",
    },
    {
      slug: "metricool",
      bestFor: "Best for social media managers",
      verdict: "Every user is enrolled automatically, a fit for social media managers and agencies.",
      why: "Metricool plans and schedules posts across Instagram, TikTok, YouTube, LinkedIn and other networks, with analytics, competitor tracking and ads reporting. Its {affiliate program} says its affiliate cookies never expire, and the rate moves to a higher tier once you pass a set number of paid registrations, with a cap per referred user at each tier.",
    },
    {
      slug: "thematic",
      bestFor: "Best for YouTubers and video creators",
      verdict: "No approval and a free month of Premium for your referrals, a fit for YouTubers and video creators.",
      why: "Thematic lets video creators license copyright-free songs from real artists for YouTube, Instagram, TikTok and podcasts. Its {Affiliate Squad} pays a share of the Premium plan for the first year of each referred creator's subscription.",
    },
    {
      slug: "copyspace-ai",
      bestFor: "Best for bloggers and niche sites",
      verdict: "A share for the lifetime of each customer, a fit for bloggers and niche sites.",
      why: "CopySpace.ai researches a topic, writes SEO-optimized long-form articles and publishes them with one click, for bloggers, niche site owners and marketers. Its {affiliate program} approves you after a short form and pays a share of every payment for the lifetime of each referred customer.",
    },
    {
      slug: "revid",
      bestFor: "Best for short-form video creators",
      verdict: "Discount codes for your audience, a fit for short-form video creators, but paid-ad visits never earn.",
      why: "Revid is an AI video tool for short-form content: prompt-to-video clips, remixes of viral TikToks and Reels, UGC-style ads with AI creators, and an autopilot channel. Its {affiliate program} runs inside your Revid account and pays a share of every payment for as long as the customer stays, credit packs included.",
    },
    {
      slug: "vidyo",
      bestFor: "Best for podcasters",
      verdict: "A monthly share for as long as the referral stays, a fit for podcasters who clip their shows.",
      why: "quso.ai, formerly Vidyo.ai, pulls viral clips out of long-form videos with AI captions, reframing and templates for social media. Its {affiliate program} pays a share of everything a referral pays, every month, for as long as they stay subscribed.",
    },
    {
      slug: "voila",
      bestFor: "Best for productivity and writing content",
      verdict: "A link right away and a share of the first year, a fit for productivity and writing content.",
      why: "Voilà is an AI assistant for the browser, desktop and phone that helps with writing, translating, rewriting tone and asking AI questions while you browse. Its {affiliate program} pays on all payments in a referred customer's first year.",
    },
    {
      slug: "vsub",
      bestFor: "Best for faceless and explainer channels",
      verdict: "For creators who publish their own content; lifetime deals earn nothing.",
      why: "Vsub turns a script or a voiceover into an illustrated, narrated video, splitting the text into scenes and drawing every frame in a style cloned from a video you choose. Its {affiliate program} pays a share of every subscription payment, the first month and every renewal, for as long as the customer stays subscribed.",
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
    "We started from the programs in our registry whose verified terms say they approve new affiliates automatically, then picked and ordered a mix of tools our beginners list does not already cover. Automatic approval is what we checked, not fees.",
  related: ["affiliate-programs-for-beginners", "recurring-affiliate-programs", "high-paying-affiliate-programs"],
}
