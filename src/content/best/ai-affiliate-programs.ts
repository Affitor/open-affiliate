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
    "The best AI affiliate programs for video, voice, writing and developer tools, with commission, cookie and payout terms checked on each brand's own page.",
  intro:
    "AI tools are some of the easiest products to recommend right now: people already search for them by name, and most of them charge a monthly plan, so a good referral can keep paying. The catch is that their terms change fast. Every figure below comes from the program's own terms page, and each one shows the day we last checked it.",
  programs: [
    {
      slug: "runway",
      bestFor: "Biggest name in AI video",
      why: "Runway is one of the most searched AI video tools, used by filmmakers, creators and agencies. Its program pays a flat amount for each new paying subscriber instead of a share of revenue, so it suits audiences that sign up once and stay.",
      notFor: "Audiences that want a long tail of recurring income: the payout does not repeat.",
    },
    {
      slug: "heygen",
      bestFor: "Best for video creators",
      why: "HeyGen turns a script into a talking-avatar video, which makes it an easy recommendation for marketers, course creators and anyone who sells with video.",
      notFor: "Long-term passive income: the commission runs for a limited number of months.",
    },
    {
      slug: "adcreative",
      bestFor: "Best for performance marketers",
      why: "AdCreative.ai generates ad creatives, product visuals and copy, and scores them before you spend. It fits ad buyers, agencies and e-commerce teams, and its rate climbs with the revenue you bring.",
    },
    {
      slug: "reclaim",
      bestFor: "Best for productivity audiences",
      why: "Reclaim AI plans tasks, habits and meetings around an existing calendar. Its commission depends on whether the person you refer signs up with a work email, so it pays best with business readers.",
    },
    {
      slug: "speechify",
      bestFor: "Best for consumer audiences",
      why: "Speechify reads text aloud on phone and desktop. It sells to students and busy readers as much as to professionals, which makes it one of the few AI tools here that fits a general audience.",
      notFor: "Recurring income: its page does not say whether renewals pay.",
    },
    {
      slug: "eleven-labs-inc",
      bestFor: "Best for audio and voice content",
      why: "ElevenLabs is the name most creators already know for AI voiceovers, dubbing and voice cloning, so your audience is often searching for it before you mention it.",
    },
    {
      slug: "kyma-api",
      bestFor: "Best for developer audiences",
      why: "Kyma API gives developers one account, key and balance for chat, reasoning, image, video and audio models. It fits newsletters and channels about building with AI rather than using it.",
      notFor: "Non-technical readers: it is an API, not an app.",
    },
    {
      slug: "gamma",
      bestFor: "Best for a broad audience",
      why: "Gamma builds slide decks, documents and simple sites from a prompt. Students, founders and consultants all use it, so it fits general productivity content.",
    },
    {
      slug: "synthesia",
      bestFor: "Best for business video",
      why: "Synthesia makes training videos, product demos and internal updates with AI avatars. It is a corporate purchase, so it suits B2B content about learning, HR and internal communication.",
    },
    {
      slug: "opus-clip",
      bestFor: "Best for podcasters and video editors",
      why: "OpusClip cuts long videos, podcasts and interviews into short captioned clips. Anyone who makes long-form content and wants to grow on short-form platforms is a natural fit.",
    },
  ],
  picks: [
    { label: "Most searched", slug: "runway" },
    { label: "Best for video", slug: "heygen" },
    { label: "Best for voice and audio", slug: "eleven-labs-inc" },
    { label: "Best for marketers", slug: "adcreative" },
    { label: "Best for developers", slug: "kyma-api" },
  ],
  howWeChose:
    "We started from the AI programs in the OpenAffiliate registry whose terms we have verified on the brand's own page, then kept the ones people actually look for: programs whose OpenAffiliate page appears in Google results. For now the list is ordered by that search interest. Commission size is shown, not scored: a higher rate is not always a better fit for your audience. Programs whose terms we have not re-checked in the last ninety days are left out until we do.",
  leftOut: [
    {
      name: "Jasper",
      reason:
        "its old affiliate agreement is still online, but its application now leads to a partner program for agencies, not independent affiliates.",
    },
  ],
  affitor: {
    before: "If you build with AI yourself, Kyma API is also listed on the ",
    anchor: "Affitor marketplace",
    after: ", where one partner account covers every program you join.",
  },
  related: ["recurring-affiliate-programs", "saas-recurring-affiliate-programs", "high-paying-affiliate-programs"],
}
