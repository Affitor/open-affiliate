import type { BestPost } from "@/lib/best-posts"

/**
 * Editorial copy for /best/design-affiliate-programs, on the standard "best X"
 * layout. No figures in here: every number on the page is read from the
 * registry at build, and scripts/best-posts.test.ts fails on a digit or a
 * spelled-out number in copy. In each `why`, the words in {braces} become the
 * link to the brand's affiliate page (the tracked Apply link).
 */
export const post: BestPost = {
  slug: "design-affiliate-programs",
  checked: "2026-10-20",
  layout: "standard",
  title: (n, year) => `${n} Best Design Affiliate Programs in ${year}`,
  description:
    "The best design affiliate programs for stock assets, WordPress, website builders, graphics and photo tools, with terms checked on each brand's page.",
  intro:
    "Design tools suit any site that writes for creators, web designers or small businesses: readers buy templates, editors and site builders, and many of these tools bill every month. We read each program's terms on its own page or network listing.",
  lookFor: {
    heading: "How to choose a design affiliate program",
    intro: "Design programs mix one-time and recurring deals under similar headlines. Check these before you apply:",
    criteria: [
      {
        name: "Once or on every payment",
        text: "Templates and themes often pay once on the first purchase, while site builders and editors pay on each payment for a period or for life.",
        link: { href: "/best/recurring-affiliate-programs", label: "See recurring programs" },
      },
      {
        name: "Coupon and deal rules",
        text: "Many design brands bar unofficial coupons and deal sites, which matters if your traffic comes from discounts.",
      },
      {
        name: "Rules on ads",
        text: "Several bar search ads on their name without approval, and one bars paid search on any keyword.",
      },
      {
        name: "The payout minimum and method",
        text: "Most programs here pay by PayPal, with minimums that differ from program to program, so check both before you apply.",
      },
      {
        name: "Fit with your readers",
        text: "A WordPress builder suits a WordPress tutorial site and a thumbnail maker suits YouTube creators. Match the tool to the audience before the rate.",
      },
    ],
  },
  guides: ["how-to-start-affiliate-marketing", "affiliate-marketing-without-a-website"],
  programs: [
    {
      slug: "envato",
      bestFor: "Best for video and creative content",
      verdict: "A fit for video and creative content; a monthly subscriber earns for the first months only.",
      why: "Envato is a creative subscription with a large library of video templates, stock video, royalty-free music, graphics, design templates, photos, fonts and web templates, plus AI tools for images, video, music and voice. Its {affiliate program} on Impact pays a flat amount per eligible subscriber, by plan: monthly plans earn a monthly amount for the first months of the subscription only, and annual plans earn one larger payment.",
    },
    {
      slug: "themify",
      bestFor: "Best for WordPress tutorial sites",
      verdict: "A fit for WordPress tutorial sites, paid once on the first purchase.",
      why: "Themify makes WordPress themes and plugins built for speed and SEO, including the Ultra and Shoppe themes and the Themify Builder drag-and-drop page builder. Its {affiliate program} pays a share of the initial purchase of any product, memberships, plugins and addons included, after a refund wait.",
    },
    {
      slug: "brandbird",
      bestFor: "Best for SaaS founders and indie makers",
      verdict: "A fit for SaaS founders and indie makers; brand-term search ads and Facebook ads need approval first.",
      why: "BrandBird turns screenshots into polished social media graphics, mockups and marketing images, with device frames, backgrounds, annotations and brand kits, plus a Chrome extension, a Figma plugin, a Mac app and an API. Its {affiliate program} pays a recurring commission on purchases made through your link.",
    },
    {
      slug: "pineapple-builder",
      bestFor: "Best for small business website content",
      verdict: "A fit for small business website content, paid for a customer's first year.",
      why: "Pineapple Builder is an AI website builder for small businesses: it drafts a first version of a site, lets owners update pages in plain English, and brings forms, SEO, hosting, blogging, analytics and memberships into one place. Its {partner program} pays for a year from the first paid invoice on new Basic and Grow subscriptions, and referred customers get a discount with your code. Clicks and signups alone earn nothing.",
    },
    {
      slug: "strikingly",
      bestFor: "Best for no-code website content",
      verdict: "A fit for no-code website content, paid once on the first payment.",
      why: "Strikingly is a website builder for launching simple, mobile-ready websites without code, and its yearly plans include a free domain. Its {affiliate program} pays a share of a referred user's first payment, so longer plans earn more, and each commission is reviewed after the trial and a holding period before the monthly payout.",
    },
    {
      slug: "templatemonster",
      bestFor: "Best for web designers and developers",
      verdict: "A fit for web design audiences, with a smaller share on repeat purchases.",
      why: "TemplateMonster is a marketplace for website templates, WordPress themes, graphics, plugins and other digital items. Its {affiliate program} pays a larger share of a referred user's first purchase and a smaller share of their later purchases, plus a share of sales from sub-affiliates you bring in. Payments go out on request after identity verification.",
    },
    {
      slug: "beaver-builder",
      bestFor: "Best for WordPress agencies",
      verdict: "A fit for WordPress agencies and freelancers; coupon and deal sites are not allowed.",
      why: "Beaver Builder is a drag-and-drop page builder for WordPress, built for freelancers and agencies who build client sites, with saved layouts, reusable templates, white labeling and an AI layout tool. Its {affiliate program} pays on qualified new sales and on qualifying recurring purchases, annual renewals included.",
    },
    {
      slug: "visme",
      bestFor: "Best for presentation and infographic content",
      verdict: "A fit for presentation and infographic content; no paid search is allowed on any keyword.",
      why: "Visme is a visual content platform for presentations, documents, infographics, charts, reports and social media graphics, with templates, brand kits, team collaboration and AI design tools. Its {partner program} pays a share of every transaction from referred paying customers for a year.",
    },
    {
      slug: "pikzels",
      bestFor: "Best for YouTube creator audiences",
      verdict: "A lifetime share, a fit for YouTube creator audiences.",
      why: "Pikzels is an AI thumbnail maker for YouTube: it turns a prompt into a thumbnail, recreates thumbnails that already work with your own edits, scores them on viewer behavior and keeps your face and style consistent. Its {affiliate program} on FirstPromoter pays a share of all payments from your referrals for life.",
    },
    {
      slug: "fotor",
      bestFor: "Best for photo editing content",
      verdict: "A fit for photo editing content; coupon, cashback and deal sites are not permitted.",
      why: "Fotor is an online photo editor and design tool with AI enhancement, upscaling, background and object removal, AI image and video generation and design templates. Its {affiliate program} on Tolt pays a share of each referred payment that rises by tier: monthly subscriptions pay for a year and annual plans pay once.",
    },
  ],
  picks: [
    { label: "Best for creative content", slug: "envato" },
    { label: "Best for WordPress sites", slug: "beaver-builder" },
    { label: "Best for website builders", slug: "pineapple-builder" },
    { label: "Best for presentations", slug: "visme" },
    { label: "Best for YouTube creators", slug: "pikzels" },
  ],
  howWeChose:
    "We started from the programs in the Design category of the OpenAffiliate registry whose terms we verified in the last few months, then our editors picked a mix across stock assets, WordPress, website builders, graphics and photo tools and ordered them by commission as the registry records it. Some pay once on the first purchase and some on every payment, so check how each one pays.",
  related: ["design-recurring-affiliate-programs", "marketing-affiliate-programs", "recurring-affiliate-programs"],
  category: "Design",
}
