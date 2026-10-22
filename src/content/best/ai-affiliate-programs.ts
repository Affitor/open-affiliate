import type { BestPost } from "@/lib/best-posts"

/**
 * Editorial copy for /best/ai-affiliate-programs, on the standard "best X"
 * layout. No figures in here: every number on the page is read from the
 * registry at build, and scripts/best-posts.test.ts fails on a digit or a
 * spelled-out number in copy. In each `why`, the words in {braces} become the
 * link to the brand's affiliate page (the tracked Apply link).
 */
export const post: BestPost = {
  slug: "ai-affiliate-programs",
  checked: "2026-10-18",
  layout: "standard",
  title: (n, year) => `The ${n} Best AI Affiliate Programs in ${year}`,
  description:
    "The best AI affiliate programs for video, voice, slides and marketing tools, with commission, cookie and payout terms checked on each brand's own page.",
  intro:
    "AI tools are easy to recommend: people search for them by name, and most sell a monthly plan, so a good referral can keep paying. Their terms change fast, so we read each one on the brand's own page.",
  lookFor: {
    heading: "How to choose an AI affiliate program",
    intro: "AI programs look alike on their landing pages and differ in the details. Check these before you apply:",
    criteria: [
      {
        name: "How long it pays",
        text: "Most AI programs pay a share of each payment for a set period, and some pay once per subscriber. A short window can earn less than a lower rate that lasts.",
        link: { href: "/best/recurring-affiliate-programs", label: "See recurring programs" },
      },
      {
        name: "Who it accepts",
        text: "Some programs take only creators with a following who publish video, and most review every application by hand.",
      },
      {
        name: "Which plans count",
        text: "Business and enterprise plans often earn a lower rate or nothing at all, so check which plans your readers are likely to buy.",
      },
      {
        name: "Rules on ads",
        text: "Many AI brands bar search or social ads on their name, and some bar paid advertising of any kind.",
      },
      {
        name: "Getting paid",
        text: "Payouts range from monthly to months after the sale, behind a hold and a minimum. Check both before you count on the income.",
      },
    ],
  },
  guides: ["how-to-start-affiliate-marketing", "make-money-with-affiliate-marketing"],
  programs: [
    {
      slug: "runway",
      bestFor: "Best for filmmakers and video creators",
      verdict: "A fit for filmmakers and video creators, paid once per new subscriber.",
      why: "Runway is an AI creative suite for generating and editing video, used by filmmakers, content creators and creative agencies. Its {affiliate program} pays a flat amount for each new paying subscriber who uses your code, and your audience gets a discount.",
    },
    {
      slug: "heygen",
      bestFor: "Best for video creators with an audience",
      verdict: "For video creators with a following; blog-only promotion is not accepted.",
      why: "HeyGen turns text into videos with realistic AI avatars, an easy recommendation for marketers and sales teams scaling video. Its {Social Creator program} pays a share of each subscription for its first months, and it is open to creators who publish original video.",
    },
    {
      slug: "adcreative",
      bestFor: "Best for performance marketers",
      verdict: "A fit for agencies and advertisers, with a rate that climbs with the revenue you bring.",
      why: "AdCreative.ai generates ad creatives, product visuals, videos and copy, and adds creative scoring and competitor analysis. Its {affiliate program} pays a share of each customer's subscription for as long as they stay, at a higher tier as your referred revenue grows.",
    },
    {
      slug: "reclaim",
      bestFor: "Best for productivity audiences",
      verdict: "Pays best with business readers, since a work-email signup earns the higher rate.",
      why: "Reclaim AI schedules tasks, habits, meetings and breaks around an existing calendar. Its {affiliate program} on PartnerStack pays a share of each subscription for its first year, more when the person you refer signs up with a work email.",
    },
    {
      slug: "eleven-labs-inc",
      bestFor: "Best for audio and voice content",
      verdict: "A fit for creators who make voiceovers; enterprise purchases earn no commission.",
      why: "ElevenLabs covers lifelike speech, voice cloning, music and sound effects, plus voice agents and an API for developers. Its {creator affiliate program} pays a share of every payment for a referral's first year, at a lower rate on the Business plan.",
    },
    {
      slug: "kyma-api",
      bestFor: "Best for developer audiences",
      verdict: "A fit for newsletters and channels about building with AI rather than using it; it is an API, not an app.",
      why: "Kyma API gives developers one account, key and balance for chat, reasoning, image, video and audio models. Its {affiliate program} pays a share of what each referred customer spends, recurring for a fixed period.",
    },
    {
      slug: "gamma",
      bestFor: "Best for presentations",
      verdict: "A natural pick for founders and marketers who make decks and one-pagers.",
      why: "Gamma builds slides, documents and webpages from a prompt, with no design skills needed. Its {affiliate program} on PartnerStack pays a share of each referred customer's payments for their first year.",
    },
    {
      slug: "synthesia",
      bestFor: "Best for training video",
      verdict: "A fit for learning and development audiences; only the Starter and Creator plans earn commission.",
      why: "Synthesia makes training videos, product demos and internal updates with AI avatars, for learning and development teams. Its {affiliate program} pays a share of Starter and Creator plan payments from each referred customer for their first year.",
    },
    {
      slug: "opus-clip",
      bestFor: "Best for podcasters",
      verdict: "A fit for podcasters and short-form creators who promote without paid ads.",
      why: "OpusClip cuts long videos, podcasts and interviews into short clips with captions. Its {affiliate program} pays a recurring commission through the first year of each new subscriber you refer.",
    },
  ],
  picks: [
    { label: "Best for video creators", slug: "runway" },
    { label: "Best for voice and audio", slug: "eleven-labs-inc" },
    { label: "Best for marketers", slug: "adcreative" },
    { label: "Best for presentations", slug: "gamma" },
    { label: "Best for developers", slug: "kyma-api" },
  ],
  howWeChose:
    "We started from the AI programs in the OpenAffiliate registry whose terms we have verified on the brand's own page, then our editors picked and ordered them, starting with the programs readers find us for in search. Commission size is shown, not scored: a higher rate is not always a better fit for your audience. We left out Jasper: its old affiliate agreement is still online, but its application now leads to a partner program for agencies, not independent affiliates.",
  category: "AI",
  related: ["recurring-affiliate-programs", "saas-recurring-affiliate-programs", "high-paying-affiliate-programs"],
}
