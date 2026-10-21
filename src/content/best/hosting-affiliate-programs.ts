import type { BestPost } from "@/lib/best-posts"

/**
 * Editorial copy for /best/hosting-affiliate-programs, on the standard "best X"
 * layout. No figures in here: every number on the page is read from the
 * registry at build, and scripts/best-posts.test.ts fails on a digit or a
 * spelled-out number in copy. The program details, pros and cons and the FAQ
 * answers are generated from the programs' YAML. In each `why`, the words in
 * {braces} become the link to the brand's affiliate page (the tracked Apply
 * link).
 */
export const post: BestPost = {
  slug: "hosting-affiliate-programs",
  checked: "2026-10-20",
  layout: "standard",
  title: (n, year) => `${n} Best Hosting Affiliate Programs in ${year}`,
  description:
    "The best web hosting affiliate programs for managed WordPress, shared, VPS, cloud and edge hosting, with verified terms and the day we checked each.",
  intro:
    "The right hosting affiliate program depends on who reads you. We compared the terms each host publishes on its own affiliate page: how it pays, when, and the rules that come with it.",
  lookFor: {
    heading: "How to choose a hosting affiliate program",
    intro: "Hosting programs look alike on their landing pages and differ in the fine print. Check these before you apply:",
    criteria: [
      {
        name: "How it pays",
        text: "Most hosts pay a set amount once per sale. A tiered program raises it with your monthly sales, so the headline figure is the top tier, and a recurring share keeps paying while the customer stays.",
        link: { href: "/programs?category=Infrastructure&type=recurring", label: "See recurring programs" },
      },
      {
        name: "When a sale counts",
        text: "Many hosts pay only after the customer stays past the money-back period, and take back refunded sales, so the first payment comes weeks later.",
      },
      {
        name: "Rules on ads and coupons",
        text: "Many bar bidding on their brand name, some want approval before any paid ads, and some turn away coupon sites.",
      },
      {
        name: "Cookie window",
        text: "Many hosts do not publish one. A longer window credits readers who compare hosts for a while before they buy.",
        link: { href: "/programs?category=Infrastructure&cookie=90", label: "See programs with a long cookie" },
      },
      {
        name: "Getting paid",
        text: "Check the payout minimum, the currency and whether PayPal or a bank transfer works where you live. A program run on a network pays on that network's terms.",
      },
    ],
  },
  considered: (p) => p.category === "Infrastructure" && p.tags.some((t) => /hosting$/.test(t) && t !== "email-hosting"),
  guides: ["how-to-start-affiliate-marketing", "affiliate-marketing-for-bloggers", "make-money-with-affiliate-marketing"],
  programs: [
    {
      slug: "nestify",
      bestFor: "Best for WordPress site owners",
      verdict: "A simple flat bounty for WordPress publishers, with a larger one when a referral's plan crosses its billing threshold.",
      why: "Nestify provides managed WordPress hosting for website owners and businesses. Its {affiliate program} pays a flat amount per successful referral, a larger one above a monthly billing threshold and a smaller one for smaller plans, tracked in a portal.",
    },
    {
      slug: "hosting-com",
      bestFor: "Best for general hosting reviews",
      verdict: "It pays a share of the customer's first invoice up to a cap, so it suits reviews that send readers to larger plans.",
      why: "hosting.com sells shared hosting, managed WordPress and WooCommerce hosting, VPS, dedicated servers, reseller hosting and domains. The {hosting.com affiliate program} pays a share of the first invoice on hosting, and a smaller share on reseller hosting, Windows hosting and domains, once the customer stays active for a set period. You do not have to be a customer to join.",
    },
    {
      slug: "bunny-net",
      bestFor: "Best for developers and video sites",
      verdict: "Worth turning on if you already pay for Bunny.net: a small flat reward per paying customer, with no cap.",
      why: "Bunny.net is an edge platform with a global CDN, video streaming, cloud storage, DNS, image optimization and security tools. Its {affiliate program} pays a flat amount for every new paying customer you refer, and you can take the reward as Bunny credits with a bonus instead.",
    },
    {
      slug: "contabo",
      bestFor: "Best for developer and self-hosting content",
      verdict: "A set euro amount per new server customer, a fit for self-hosting and developer tutorials.",
      why: "Contabo offers cloud VPS, virtual dedicated servers, storage VPS and dedicated servers. Its {affiliate program}, run on CJ, pays a fixed amount for a new customer's first qualifying order, set by the product, and only the first product ordered earns. The order has to stay paid and uncancelled for a set period.",
    },
    {
      slug: "greengeeks",
      bestFor: "Best for small business and eco-minded sites",
      verdict: "Every sale in a month earns that month's tier, good for sites that send steady hosting sales.",
      why: "GreenGeeks sells shared, WordPress, WooCommerce, reseller and VPS hosting, and markets its hosting as powered by renewable energy. Its {affiliate program} pays a flat amount per hosting sale on a monthly volume ladder, with custom rates at the top, and gives affiliates banners, landing pages and real-time statistics.",
    },
    {
      slug: "hostpapa",
      bestFor: "Best for small business owners",
      verdict: "A flat payment that rises with monthly sales, plus a share of domain and email sales.",
      why: "HostPapa is a web hosting company for small businesses, with shared and WordPress hosting, domains, email hosting and a website builder. Its {affiliate program} pays a flat amount per new hosting customer that rises with monthly sales, up to a cap, plus a share of domain registrations and email sales. Only new accounts that stay past the money-back period count.",
    },
    {
      slug: "infomaniak",
      bestFor: "Best for European audiences",
      verdict: "A percentage that grows with your cumulative earnings, paid in Swiss francs, a fit for European and privacy-minded readers.",
      why: "Infomaniak is a Swiss hosting and cloud company with web and WordPress hosting, domains, email, kDrive cloud storage, kSuite and public cloud. Its {affiliate programme} pays a rate that grows with your cumulative earnings, on every product except domain names, Housing and Very High Availability hosting.",
    },
    {
      slug: "kinsta",
      bestFor: "Best for WordPress agencies and developers",
      verdict: "A one-time bonus plus a recurring share for the customer's lifetime, the strongest fit for agencies that place client sites.",
      why: "Kinsta is a managed WordPress host for sites from small blogs to high-traffic enterprise sites. The {Kinsta affiliate program} pays a one-time bonus by plan after a qualification period, then a recurring share of the plan's monthly fee for as long as the customer stays. Kinsta customers are approved automatically.",
    },
    {
      slug: "siteground",
      bestFor: "Best for WordPress bloggers",
      verdict: "Weekly payouts with no minimum on a monthly volume ladder, a steady fit for WordPress blogs.",
      why: "SiteGround hosts WordPress, WooCommerce and other websites on Google Cloud, with free SSL, daily backups and round-the-clock support. Its {affiliate program} pays a flat amount per hosting sale that rises with monthly volume. A referral who buys its website builder, ecommerce, Coderick AI or email marketing instead earns a share of that service's first-year revenue.",
    },
    {
      slug: "verpex",
      bestFor: "Best for budget hosting content",
      verdict: "It pays high top figures for reseller and managed servers, and small fixed amounts on entry plans.",
      why: "Verpex is a web hosting provider for small businesses and personal websites, with WordPress, Linux, Windows and cloud hosting, reseller hosting and managed servers. Its {affiliate program} pays once per new hosting customer, on the first deposit only, by plan type and by how many customers you refer each month. Domain names earn nothing.",
    },
  ],
  picks: [
    { label: "Best for WordPress agencies", slug: "kinsta" },
    { label: "Best for small businesses", slug: "hostpapa" },
    { label: "Best for developers", slug: "contabo" },
    { label: "Best for bloggers", slug: "siteground" },
    { label: "Best for European audiences", slug: "infomaniak" },
  ],
  howWeChose:
    "We started from the hosting programs in our registry whose terms we verified in the last few months, picked a mix across managed WordPress, shared, VPS, cloud and edge hosting, left out the hosts our high-paying list already covers, and ordered them by commission as the registry records it.",
  related: ["infrastructure-one-time-affiliate-programs", "high-paying-affiliate-programs", "saas-affiliate-programs"],
  category: "Infrastructure",
}
