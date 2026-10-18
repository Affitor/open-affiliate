import type { BestPost } from "@/lib/best-posts"

/**
 * Editorial copy for /best/ai-affiliate-programs. No figures in here: every
 * number on the page (rates, cookies, payouts, dates, the count in the title)
 * is read from the registry at build, and scripts/best-posts.test.ts fails on
 * a digit in any copy field.
 */
export const post: BestPost = {
  slug: "ai-affiliate-programs",
  checked: "2026-10-18",
  title: (n, year) => `The ${n} Best AI Affiliate Programs in ${year}`,
  description:
    "The best AI affiliate programs for video, voice, slides and developer tools, with commission, cookie and payout terms checked on each brand's own page.",
  intro:
    "AI tools are easy to recommend right now: people search for them by name, and most of them sell a monthly plan, so a good referral can keep paying. The catch is that their terms change fast. Every figure below comes from the program's own terms page, and each one shows the day we last checked it.",
  programs: [
    {
      slug: "runway",
      bestFor: "Best for filmmakers and video creators",
      why: "Runway is an AI creative suite for generating and editing video, used by filmmakers, content creators and creative agencies. Its program pays a flat amount for each new paying subscriber who uses your code, and your audience gets a discount.",
      notFor: "Recurring income: the payout is once per subscriber.",
    },
    {
      slug: "heygen",
      bestFor: "Best for video creators with an audience",
      why: "HeyGen turns text into videos with realistic AI avatars, which makes it an easy recommendation for marketers and sales teams scaling video.",
      notFor: "Bloggers and SEO sites: the program is open to creators with a following who publish original video, and it does not accept blog-only promotion.",
    },
    {
      slug: "adcreative",
      bestFor: "Best for performance marketers",
      why: "AdCreative.ai generates ad creatives, product visuals, videos and copy, and adds creative scoring and competitor analysis. It fits agencies, advertisers and e-commerce teams, and its rate climbs with the revenue you bring.",
    },
    {
      slug: "reclaim",
      bestFor: "Best for productivity audiences",
      why: "Reclaim AI schedules tasks, habits, meetings and breaks around an existing calendar. Its commission depends on whether the person you refer signs up with a work email, so it pays best with business readers.",
    },
    {
      slug: "speechify",
      bestFor: "Best for students and readers",
      why: "Speechify turns any text into natural-sounding audio. Students listening to study material and professionals catching up on documents both use it, which makes it one of the few tools here for a general audience.",
      notFor: "Recurring income: its page does not say whether renewals pay.",
    },
    {
      slug: "eleven-labs-inc",
      bestFor: "Best for audio and voice content",
      why: "ElevenLabs covers lifelike speech, voice cloning, music and sound effects, plus voice agents and an API for developers. It fits creators who make voiceovers for video, podcasts or audiobooks.",
      notFor: "Enterprise deals: enterprise purchases earn no commission.",
    },
    {
      slug: "kyma-api",
      bestFor: "Best for developer audiences",
      why: "Kyma API gives developers one account, key and balance for chat, reasoning, image, video and audio models. It fits newsletters and channels about building with AI rather than using it.",
      notFor: "Non-technical readers: it is an API, not an app.",
    },
    {
      slug: "gamma",
      bestFor: "Best for presentations",
      why: "Gamma builds slides, documents and webpages from a prompt, with no design skills needed. Founders making pitch decks and marketers making one-pagers are the natural audience.",
    },
    {
      slug: "synthesia",
      bestFor: "Best for training video",
      why: "Synthesia makes training videos, product demos and internal updates with AI avatars, for learning and development teams.",
      notFor: "Large company accounts: commission is paid on the Starter and Creator plans only.",
    },
    {
      slug: "opus-clip",
      bestFor: "Best for podcasters",
      why: "OpusClip cuts long videos, podcasts and interviews into short clips with captions. Podcasters and creators growing on short-form platforms are a natural fit.",
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
    "We started from the AI programs in the OpenAffiliate registry whose terms we have verified on the brand's own page, then our editors picked and ordered them, starting with the programs readers find us for in Google search. Commission size is shown, not scored: a higher rate is not always a better fit for your audience.",
  leftOut: [
    {
      name: "Jasper",
      reason:
        "its old affiliate agreement is still online, but its application now leads to a partner program for agencies, not independent affiliates.",
    },
  ],
  affitor: {
    before: "If you write for developers, Kyma API is also on the ",
    anchor: "Affitor marketplace",
    after: ", the affiliate network for SaaS that maintains OpenAffiliate.",
  },
  category: "AI",
  related: ["recurring-affiliate-programs", "saas-recurring-affiliate-programs", "high-paying-affiliate-programs"],
}
