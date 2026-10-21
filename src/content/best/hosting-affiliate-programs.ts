import type { BestPost } from "@/lib/best-posts"

/**
 * Editorial copy for /best/hosting-affiliate-programs, on the standard "best X"
 * layout. No figures in here: every number on the page is read from the
 * registry at build, and scripts/best-posts.test.ts fails on a digit or a
 * spelled-out number in copy. Good / Watch out, the facts, the quotes and the
 * FAQ answers are generated from the programs' YAML.
 */
export const post: BestPost = {
  slug: "hosting-affiliate-programs",
  checked: "2026-10-20",
  layout: "standard",
  title: (n, year) => `${n} Best Hosting Affiliate Programs in ${year}`,
  description:
    "The best web hosting affiliate programs for managed WordPress, shared, VPS, cloud and edge hosting, with verified terms and the day we checked each.",
  intro:
    "The right hosting affiliate program depends on who reads you: WordPress agencies, small business owners, developers or bloggers. Below are picks for each, every program side by side, then a section per program with its terms, its rules, the quote we read on its own affiliate page and the day we read it.",
  lookFor: {
    heading: "What to look for in hosting affiliate programs",
    intro:
      "Hosting programs look alike on their landing pages and differ in the fine print. These are the terms that decide what a referral is worth to you, in the order we would check them.",
    criteria: [
      {
        name: "How it pays",
        text: "A flat amount once per sale is the common shape. A tiered program raises that amount with your monthly sales, so its headline figure is the top tier, not what your first sale earns. A recurring share keeps paying while the customer stays, which is rare in hosting and worth more over time on managed plans.",
        link: { href: "/programs?category=Infrastructure&type=recurring", label: "Infrastructure programs that pay recurring" },
      },
      {
        name: "When a sale counts",
        text: "Most hosts pay only after the customer stays past the money-back or qualification period, and a refunded sale is usually taken back, so the first payment often comes weeks after the sale.",
      },
      {
        name: "Rules on ads and coupons",
        text: "Hosts protect their brand searches. Many bar bidding on their name or its misspellings, some ask for approval before any paid ads, and some turn away coupon and deal sites. Read these before you plan a paid campaign.",
      },
      {
        name: "Cookie window",
        text: "Many hosting programs do not publish one. When it is published, a longer window credits readers who compare hosts for a while before they buy.",
        link: { href: "/programs?category=Infrastructure&cookie=90", label: "Programs with a long cookie" },
      },
      {
        name: "Payout threshold, currency and method",
        text: "Check the minimum before your first payout, the currency it is paid in, and whether PayPal or a bank transfer is offered where you live. A program run on a network pays on that network's terms.",
        link: { href: "/programs?category=Infrastructure&payout=paypal", label: "Programs that pay by PayPal" },
      },
      {
        name: "Who can join",
        text: "Some programs approve applications automatically, some review each site by hand, and some are open only to their own paying customers.",
      },
    ],
  },
  considered: (p) => p.category === "Infrastructure" && p.tags.some((t) => /hosting$/.test(t) && t !== "email-hosting"),
  programs: [
    {
      slug: "nestify",
      bestFor: "Best for WordPress site owners",
      verdict: "A simple flat bounty for WordPress publishers, with a larger one when a referral's plan crosses its billing threshold.",
      why: "Nestify provides managed WordPress hosting for website owners and businesses, focused on hosting infrastructure and support for WordPress sites. It pays a flat amount per successful referral, a larger one for referrals above a monthly billing threshold and a smaller one for smaller plans, tracked in a portal and paid through PayPal.",
    },
    {
      slug: "hosting-com",
      bestFor: "Best for general hosting reviews",
      verdict: "Pays a share of the customer's first invoice up to a cap, so it suits reviews that send readers to larger plans.",
      why: "hosting.com sells shared hosting, managed WordPress and WooCommerce hosting, managed and unmanaged VPS, dedicated servers, reseller hosting and domains. It pays a share of the first invoice on hosting products and a smaller share on reseller hosting, Windows hosting and domains, approved once the customer stays active for a set period. It is free to join and you do not have to be a customer.",
    },
    {
      slug: "bunny-net",
      bestFor: "Best for developers and video sites",
      verdict: "Worth turning on if you already pay for Bunny.net: a small flat reward per paying customer, with no cap.",
      why: "Bunny.net is an edge platform with a global CDN, video streaming, cloud storage, edge scripting, DNS, image optimization and security tools. It pays a flat amount for every new paying customer you refer, and you can take the reward as Bunny credits with a bonus instead. Affiliates get a library of banner and video assets.",
    },
    {
      slug: "contabo",
      bestFor: "Best for developer and self-hosting content",
      verdict: "A set euro amount per new server customer through CJ, a fit for self-hosting and developer tutorials.",
      why: "Contabo offers cloud VPS, virtual dedicated servers, storage VPS and dedicated servers. Its program on CJ pays a fixed amount for a new customer's first qualifying order, set by the product, and only the first product ordered earns. The order has to stay paid and uncancelled for a set period, and the commission is credited after a waiting period.",
    },
    {
      slug: "greengeeks",
      bestFor: "Best for small business and eco-minded sites",
      verdict: "A monthly volume ladder where every sale that month earns the month's tier, good for sites that send steady hosting sales.",
      why: "GreenGeeks sells shared, WordPress, WooCommerce, reseller and VPS hosting, dedicated servers and domains, and markets its hosting as powered by renewable energy. It pays a flat amount per hosting sale on a monthly ladder, with custom rates at the top. Commissions are sent monthly by PayPal, and affiliates get banners, landing pages, real-time statistics and a dedicated team.",
    },
    {
      slug: "hostpapa",
      bestFor: "Best for small business owners",
      verdict: "Small business hosting with a flat payment that rises with monthly sales, plus a share of domain and email sales.",
      why: "HostPapa is a web hosting company for small businesses, with shared and WordPress hosting, domains, email hosting, a website builder and security add-ons. It pays a flat amount per new hosting customer that rises with monthly sales, up to a cap, plus a share of domain registrations and email sales. Only new accounts that stay past the money-back period count.",
    },
    {
      slug: "infomaniak",
      bestFor: "Best for European audiences",
      verdict: "A percentage that grows with your cumulative earnings, paid in Swiss francs, a fit for European and privacy-minded readers.",
      why: "Infomaniak is a Swiss hosting and cloud company with web and WordPress hosting, domains, email, kDrive cloud storage, kSuite collaboration tools, public cloud and VPS. Its rate grows with your cumulative earnings and covers all products except domain names, Housing and Very High Availability hosting. It pays at the end of each month via PayPal or an Infomaniak prepaid account.",
    },
    {
      slug: "kinsta",
      bestFor: "Best for WordPress agencies and developers",
      verdict: "A one-time bonus plus a recurring share for the customer's lifetime, the strongest fit for agencies that place client sites.",
      why: "Kinsta is a managed WordPress host for sites from small blogs to high-traffic enterprise sites. It pays a one-time bonus by plan, approved after a qualification period, and then a recurring share of the plan's monthly fee for as long as the customer stays, with discounts applied and add-ons excluded. Kinsta customers are approved automatically.",
    },
    {
      slug: "siteground",
      bestFor: "Best for WordPress bloggers",
      verdict: "Weekly payouts with no minimum on a monthly volume ladder, a steady fit for WordPress blogs.",
      why: "SiteGround hosts WordPress, WooCommerce and other websites on Google Cloud, with a CDN, free SSL, daily backups and round-the-clock support. It pays a flat amount per hosting sale that rises with monthly volume, with custom deals at the top. A referral who buys its website builder, ecommerce, Coderick AI or email marketing instead earns a share of that service's first-year revenue, and those sales do not count toward the hosting tiers.",
    },
    {
      slug: "verpex",
      bestFor: "Best for budget hosting content",
      verdict: "A ladder by plan type and monthly referrals, with high top figures for reseller and managed servers and small fixed amounts on entry plans.",
      why: "Verpex is a web hosting provider for small businesses and personal websites, with WordPress, Linux, Windows and cloud hosting, reseller hosting and managed servers. Its program on Post Affiliate Pro pays once per new hosting customer, on the first deposit only, by plan type and by how many customers you refer each month. Domain names earn nothing. Payouts go by PayPal, bank transfer via Wise or account credit.",
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
    "We started from the hosting programs in the Infrastructure category whose terms we verified in the last few months, picked a mix across managed WordPress, shared, VPS, cloud and edge hosting, left out the hosts our high-paying list already covers, and ordered them by commission as the registry records it.",
  related: ["infrastructure-one-time-affiliate-programs", "high-paying-affiliate-programs", "saas-affiliate-programs"],
  category: "Infrastructure",
}
