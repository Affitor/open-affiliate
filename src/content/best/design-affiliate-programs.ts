import type { BestPost } from "@/lib/best-posts"

/**
 * Editorial copy for /best/design-affiliate-programs. No figures in here:
 * every number on the page is read from the registry at build, and
 * scripts/best-posts.test.ts fails on a digit or a spelled-out number in copy.
 */
export const post: BestPost = {
  slug: "design-affiliate-programs",
  checked: "2026-10-20",
  title: (n, year) => `${n} Best Design Affiliate Programs in ${year}`,
  description:
    "The best design affiliate programs for stock assets, WordPress, website builders, graphics and photo tools, with terms checked on each brand's page.",
  intro:
    "Design tools suit any site that writes for creators, web designers or small businesses building a brand: readers buy templates, editors and site builders, and many of these tools bill every month. Every program below is in the Design category of the OpenAffiliate registry, picked across stock assets, WordPress themes and builders, website builders, graphics, presentations, thumbnails and photo editing. Each block shows how the program pays, as published in its own terms or network listing, and the day we last checked it.",
  programs: [
    {
      slug: "envato",
      bestFor: "Best for video and creative content",
      why: "Envato is a creative subscription with a large library of video templates, stock video, royalty-free music, graphics, design templates, photos, fonts and web templates, plus AI tools for images, video, music and voice. Its program on Impact pays a flat amount per eligible subscriber, by plan: monthly plans earn a monthly amount for the first months of the subscription only, and annual plans earn one larger payment. Payouts go out monthly by EFT or PayPal.",
      notFor: "Long recurring income: a monthly subscriber earns for the first months only.",
    },
    {
      slug: "themify",
      bestFor: "Best for WordPress tutorial sites",
      why: "Themify makes WordPress themes and plugins built for speed and SEO, including the Ultra and Shoppe themes and the Themify Builder drag-and-drop page builder. It pays a share of the initial purchase of any product, memberships, plugins and addons included, after a refund wait, and payouts go by PayPal each month once you reach its minimum.",
      notFor: "Coupon and ad-driven sites: coupons, deals and ads such as Google Ads need approval first.",
    },
    {
      slug: "brandbird",
      bestFor: "Best for SaaS founders and indie makers",
      why: "BrandBird turns screenshots into polished social media graphics, mockups and marketing images, with device frames, backgrounds, shadows and annotations, brand kits, and exports sized for X, LinkedIn, Instagram and Product Hunt. It also has a Chrome extension, a Figma plugin, a Mac app and an API. It pays a recurring commission on purchases made through your link, monthly via PayPal.",
      notFor: "Brand-term search ads and Facebook ads: both need approval first, or referral commissions are invalidated.",
    },
    {
      slug: "pineapple-builder",
      bestFor: "Best for small business website content",
      why: "Pineapple Builder is an AI website builder for small businesses: it drafts a first version of a site, lets owners update pages and copy in plain English, and brings forms, SEO, hosting, blogging, newsletter signups, analytics and memberships into one place. It pays for a year from the first paid invoice on new Basic and Grow subscriptions, and referred customers get a discount on their first invoice with your code. Applications are reviewed, and payouts go by PayPal or bank transfer.",
      notFor: "Paying on signups: clicks and signups alone earn nothing, and each commission has a review period.",
    },
    {
      slug: "strikingly",
      bestFor: "Best for no-code website content",
      why: "Strikingly is a website builder for launching simple, mobile-ready websites without code, and its yearly plans include a free domain. It pays a share of a referred user's first payment, so longer plans earn more, and each commission is reviewed after the trial and a holding period before the monthly payout. Approval is automatic, and affiliates get banners and links with their referral code built in.",
      notFor: "Brand-term paid search: bidding on Strikingly brand terms or misspellings is not allowed.",
    },
    {
      slug: "templatemonster",
      bestFor: "Best for web designers and developers",
      why: "TemplateMonster is a marketplace for website templates, WordPress themes, graphics, plugins and other digital items for web design and development. It pays a larger share of a referred user's first purchase and a smaller share of their later purchases, plus a share of sales from sub-affiliates you bring in, and gives affiliates a personal manager and promotion tools. Payments go out on request after identity verification.",
      notFor: "Brand-name bidding: paid ads are allowed, but not on the TemplateMonster name, its variations or misspellings.",
    },
    {
      slug: "beaver-builder",
      bestFor: "Best for WordPress agencies",
      why: "Beaver Builder is a drag-and-drop page builder for WordPress, built for freelancers and agencies who build client sites, with saved layouts, reusable templates, white labeling and Beaver Builder AI, which turns a prompt into an editable layout. It pays on qualified new sales and on qualifying recurring purchases, annual renewals included, by PayPal each month, and applications are reviewed by the team.",
      notFor: "Coupon and deal sites: unofficial coupons, rebates and deal-site placements are not allowed.",
    },
    {
      slug: "visme",
      bestFor: "Best for presentation and infographic content",
      why: "Visme is a visual content platform for presentations, documents, infographics, charts, reports, forms, whiteboards and social media graphics, with templates, brand kits, team collaboration and AI design tools. It pays a share of every transaction from referred paying customers for a year, by PayPal each month, and applications are typically reviewed within a few business days.",
      notFor: "Search ads: no paid search or pay-per-click campaigns on any keyword, branded or not.",
    },
    {
      slug: "pikzels",
      bestFor: "Best for YouTube creator audiences",
      why: "Pikzels is an AI thumbnail maker for YouTube: it turns a prompt into a thumbnail, recreates thumbnails that already work with your own edits, fixes weak spots in one click, scores thumbnails on viewer behavior and keeps your face and style consistent. It also writes titles and offers an API. Its program on FirstPromoter pays a share of all payments from your referrals for life, by PayPal, IBAN bank transfer, Payoneer and other methods.",
    },
    {
      slug: "fotor",
      bestFor: "Best for photo editing content",
      why: "Fotor is an online photo editor and design tool with AI enhancement, upscaling, photo restoration, background and object removal, AI image and video generation and design templates, on the web and in mobile and desktop apps. Its program on Tolt pays a share of each referred payment that rises by tier: monthly subscriptions pay for a year and annual plans pay once, and existing users who upgrade or renew through your link count. Anyone can apply, with no follower minimum.",
      notFor: "Coupon, cashback and deal sites: they are not permitted.",
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
