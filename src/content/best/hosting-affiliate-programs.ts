import type { BestPost } from "@/lib/best-posts"

/**
 * Editorial copy for /best/hosting-affiliate-programs. No figures in here:
 * every number on the page is read from the registry at build, and
 * scripts/best-posts.test.ts fails on a digit or a spelled-out number in copy.
 */
export const post: BestPost = {
  slug: "hosting-affiliate-programs",
  checked: "2026-10-20",
  title: (n, year) => `${n} Best Hosting Affiliate Programs in ${year}`,
  description:
    "The best web hosting affiliate programs for managed WordPress, shared, VPS, cloud and edge hosting, with verified terms and the day we checked each.",
  intro:
    "Hosting is a classic affiliate niche: anyone who starts a website needs a host, and many hosting programs pay a flat amount per sale. Every program below is in the Infrastructure category of the OpenAffiliate registry, picked across managed WordPress, shared, VPS, cloud and edge hosting. Each block shows how the program pays, as published in its own terms or network listing, and the day we last checked it.",
  programs: [
    {
      slug: "nestify",
      bestFor: "Best for WordPress site owners",
      why: "Nestify provides managed WordPress hosting for website owners and businesses, focused on hosting infrastructure and support for WordPress sites. It pays a flat amount per successful referral, a larger one for referrals above a monthly billing threshold and a smaller one for smaller plans, tracked in a portal and paid through PayPal.",
      notFor: "Recurring income: each referral pays once.",
    },
    {
      slug: "hosting-com",
      bestFor: "Best for general hosting reviews",
      why: "hosting.com is a web hosting company with shared hosting, managed WordPress and WooCommerce hosting, VPS, dedicated servers, reseller hosting, AI application hosting, domains and SSL certificates. It pays a share of the customer's first invoice on hosting products, up to a cap per sale, and a smaller share on reseller hosting, Windows hosting and domains, approved once the customer stays active for a set period. It is free to join, you do not have to be a customer, and payouts go by PayPal once you reach its minimum.",
      notFor: "Brand-name PPC: bidding on the hosting.com name, its variations or misspellings is not allowed.",
    },
    {
      slug: "bunny-net",
      bestFor: "Best for developers and video sites",
      why: "Bunny.net is an edge platform with a global CDN, video streaming, cloud storage, edge scripting, a SQLite-compatible database, Magic Containers, DNS, image optimization and security tools. It pays a flat amount for every new paying customer you refer, with no cap, and you can take the reward as Bunny credits with a bonus instead. Affiliates get a library of banner and video assets.",
      notFor: "Non-customers: only paying bunny.net customers can join.",
    },
    {
      slug: "contabo",
      bestFor: "Best for developer and self-hosting content",
      why: "Contabo offers cloud VPS, virtual dedicated servers, storage VPS and dedicated servers for developers, businesses and hosting customers. Its program on CJ pays a fixed euro amount for a new customer's first qualifying order, set by the product, and only the first product ordered earns. The order has to stay paid and uncancelled for a set period, the commission is credited after a waiting period, and applications are reviewed within a week.",
      notFor: "Paid ads without approval: planned ads need written approval first, and bidding on Contabo brand keywords is not allowed.",
    },
    {
      slug: "greengeeks",
      bestFor: "Best for small business and eco-minded sites",
      why: "GreenGeeks is a web hosting company with shared, WordPress, WooCommerce, reseller and VPS hosting, dedicated servers, a website builder and domains, and it markets its hosting as powered by renewable energy. It pays a flat amount per hosting sale on a monthly volume ladder, where each new tier applies to every sale that month, with custom rates at higher volume. Commissions are sent monthly by PayPal, and affiliates get banners, landing pages, real-time statistics and a dedicated team.",
      notFor: "Short-lived signups: a referral who does not keep an active account for the required period, or is refunded early, is deducted.",
    },
    {
      slug: "hostpapa",
      bestFor: "Best for small business owners",
      why: "HostPapa is a web hosting company for small businesses, with shared and WordPress hosting, domains, email hosting, a website builder, SSL certificates, backups and SiteLock security, and round-the-clock support. It pays a flat amount per new hosting customer that rises with monthly sales, up to a cap, plus a share of domain registrations and email sales. Only new accounts that stay past the money-back period count, and applications are reviewed within a business week.",
      notFor: "Brand-term search ads: bidding on HostPapa brand terms, domains or misspellings is not allowed.",
    },
    {
      slug: "infomaniak",
      bestFor: "Best for European audiences",
      why: "Infomaniak is a Swiss hosting and cloud company with web and WordPress hosting, domains, email, kDrive cloud storage, kSuite collaboration tools, public cloud, VPS and Kubernetes, AI services, newsletters, ticketing and streaming. Its rate grows with your cumulative earnings, on all products except domain names, Housing and Very High Availability hosting, and it is paid in Swiss francs at the end of each month via PayPal or an Infomaniak prepaid account.",
      notFor: "Domain-name referrals: domains are excluded, along with Housing and Very High Availability hosting.",
    },
    {
      slug: "kinsta",
      bestFor: "Best for WordPress agencies and developers",
      why: "Kinsta is a managed WordPress host for sites from small blogs to high-traffic enterprise sites. It pays a one-time bonus by plan, approved after a qualification period, and then a recurring share of the plan's monthly fee for the lifetime of the customer, with discounts applied and add-ons excluded. Kinsta customers are approved automatically, and other applications are reviewed within a few business days.",
      notFor: "Coupon and deal sites: they are not accepted, and your site needs an affiliate disclosure.",
    },
    {
      slug: "siteground",
      bestFor: "Best for WordPress bloggers",
      why: "SiteGround is a web hosting company for WordPress, WooCommerce and other websites, running on Google Cloud with a global CDN, free SSL, daily backups, an AI-powered firewall and round-the-clock support. It pays a flat amount per hosting sale that rises with monthly volume, with custom deals at the top, and a referral who buys its website builder, ecommerce, Coderick AI or email marketing instead earns a share of that service's first-year revenue. Payouts are weekly with no minimum.",
    },
    {
      slug: "verpex",
      bestFor: "Best for budget hosting content",
      why: "Verpex is a web hosting provider for small businesses and personal websites, with WordPress, Linux, Windows and cloud hosting, reseller hosting and managed servers, LiteSpeed, free migration, free SSL and an AI website builder. Its program on Post Affiliate Pro pays once per new hosting customer, on the first deposit only, by plan type and by how many customers you refer each month, while its entry plans pay a small flat amount. Payouts go by PayPal, bank transfer via Wise or account credit.",
      notFor: "Domain referrals: domain names earn nothing.",
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
    "We started from the programs in the Infrastructure category of the OpenAffiliate registry whose terms we verified in the last few months, then our editors picked a mix across managed WordPress, shared, VPS, cloud and edge hosting, left out the hosts our highest-paying post already covers, and ordered them by commission as the registry records it. Many hosting programs pay a flat amount once and some rise with monthly volume, so check how each one pays.",
  related: ["infrastructure-one-time-affiliate-programs", "high-paying-affiliate-programs", "saas-affiliate-programs"],
  category: "Infrastructure",
}
