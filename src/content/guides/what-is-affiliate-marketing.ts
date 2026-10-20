import type { GuidePost } from "@/lib/guides"

/**
 * Editorial copy for /blog/what-is-affiliate-marketing. No figures in here:
 * the registry facts and each program's terms render from the registry, and
 * scripts/best-posts.test.ts fails on a digit or a spelled-out number in copy.
 */
export const guide: GuidePost = {
  slug: "what-is-affiliate-marketing",
  checked: "2026-10-20",
  title: (year) => `What Is Affiliate Marketing? (${year} Guide)`,
  description:
    "What affiliate marketing is, how tracking links and cookies work, and the ways programs pay, with real examples and terms verified in the registry.",
  answer:
    "Affiliate marketing is a way to earn a commission by recommending a brand's product: the brand gives you a tracking link, and when someone buys through it, you get paid the share or flat amount its program sets. This guide explains who is involved, how a sale is tracked, and the different ways programs pay, with a real, verified example of each.",
  sections: [
    {
      heading: "Who is involved",
      paragraphs: [
        "Every sale involves the brand that sells the product, the affiliate who recommends it, and the customer who buys. Many programs add an affiliate network or tracking platform that records clicks and sales and pays affiliates on the brand's behalf; others run the program themselves.",
        "A tracking link carries your ID. When a reader clicks it, the brand records the visit, often with a cookie, and a purchase within the cookie window is credited to you. A longer window gives a reader more time to decide while the sale still counts as yours.",
      ],
    },
    {
      heading: "The ways programs pay",
      paragraphs: [
        "Commission is set by each program's terms, not by a market rate. These are the main shapes you will meet, each with an example from the programs below:",
      ],
      steps: [
        {
          title: "A flat amount per sale",
          text: "A fixed sum for each referred customer, sometimes larger for bigger plans. Nestify pays a flat amount per successful referral, more when the referral's monthly billing passes a threshold.",
        },
        {
          title: "A share of the first payment",
          text: "A percentage of the customer's first invoice, paid once. hosting.com pays a share of a new customer's first invoice on hosting products, up to a cap per sale.",
        },
        {
          title: "A share of every payment for a set period",
          text: "A recurring commission that stops after a fixed time. Visme pays a share of every transaction from a referred paying customer for a year.",
          link: { label: "Recurring programs", href: "/best/recurring-affiliate-programs" },
        },
        {
          title: "A share for the customer's lifetime",
          text: "A recurring commission with no end date while the customer keeps paying. Pikzels pays a share of all payments from your referrals, for life.",
          link: { label: "Lifetime commission programs", href: "/best/lifetime-affiliate-programs" },
        },
        {
          title: "Tiers that rise with volume",
          text: "The rate or amount steps up as you send more sales. GreenGeeks pays a flat amount per hosting sale that rises with the number of sales you make in a calendar month.",
        },
      ],
    },
    {
      heading: "In-house programs and networks",
      paragraphs: [
        "Some brands run their affiliate program themselves, so you sign up on their site and they pay you directly. Others list their program on a network or run it on affiliate software, which handles approval, tracking and payouts. Each program page on OpenAffiliate says which one a brand uses.",
      ],
    },
  ],
  programsIntro:
    "One program for each way of paying described above, with the terms we verified and the day we last checked them.",
  programs: [
    {
      slug: "nestify",
      bestFor: "Example of a flat amount per sale",
      why: "Nestify provides managed WordPress hosting for website owners and businesses. It pays a flat amount per successful referral, a larger one when the referral's monthly billing passes a threshold and a smaller one for smaller plans, tracked in a portal and paid through PayPal.",
      notFor: "Recurring income: each referral pays once.",
    },
    {
      slug: "hosting-com",
      bestFor: "Example of a share of the first payment",
      why: "hosting.com is a web hosting company with shared, managed WordPress and WooCommerce, managed and unmanaged VPS, dedicated and reseller hosting, domains and SSL certificates. It pays a share of the customer's first invoice on hosting products, up to a cap per sale, and a smaller share on reseller hosting, Windows hosting and domains, approved once the customer stays active for a set period.",
      notFor: "Brand-name PPC: bidding on the hosting.com name, its variations or misspellings is not allowed.",
    },
    {
      slug: "visme",
      bestFor: "Example of a year of payments",
      why: "Visme is a visual content platform for presentations, documents, infographics, charts, reports, forms and social media graphics. It pays a share of every transaction from referred paying customers for a year, by PayPal each month, and applications are typically reviewed within a few business days.",
      notFor: "Search ads: no paid search or pay-per-click campaigns on any keyword, branded or not.",
    },
    {
      slug: "pikzels",
      bestFor: "Example of a lifetime commission",
      why: "Pikzels is an AI thumbnail maker for YouTube that turns a prompt into a thumbnail, recreates thumbnails that already work, scores them on viewer behavior and keeps your style consistent. Its program on FirstPromoter pays a share of all payments from your referrals, for life.",
      notFor: "Self-referrals: they are canceled.",
    },
    {
      slug: "greengeeks",
      bestFor: "Example of tiers that rise with volume",
      why: "GreenGeeks is a web hosting company with shared, WordPress, WooCommerce, reseller and VPS hosting, dedicated servers, a website builder and domains. It pays a flat amount per hosting sale on a monthly ladder, where each new tier applies to every sale that month, and a reversed sale drops the month to the tier below.",
      notFor: "Short-lived signups: a referral who does not keep an active account for the required period, or is refunded early, is deducted.",
    },
  ],
  rulesIntro:
    "How a program pays is only part of its terms; the rules decide whether a sale counts. These come from the programs above:",
  rules: [
    { slug: "visme", text: "Visme: no cash backs, rewards or other incentives to obtain the sale without prior approval." },
    { slug: "greengeeks", text: "GreenGeeks: a referral must keep an active hosting account for a set period, or the commission is reversed." },
    { slug: "hosting-com", text: "hosting.com: no self-referrals." },
  ],
  disclosure:
    "In the US, the FTC's Endorsement Guides say that a connection your audience would not expect, such as being paid for a sale, must be disclosed clearly and conspicuously. Their own example is a blogger whose reviews include affiliate links: the reviews should clearly and conspicuously disclose the compensation.",
  faq: [
    {
      q: "What is a cookie window?",
      a: "It is how long after a click a purchase still counts as yours. If a reader clicks your link and buys within the window, the sale is credited to you; after it, it is not. Each program sets its own window, and the program blocks on this page show it where the program publishes one.",
    },
    {
      q: "What is the difference between an affiliate program and an affiliate network?",
      a: "A program is one brand's offer: its commission, cookie and rules. A network or affiliate platform hosts many brands' programs and handles tracking and payouts for them. Some brands run their program themselves instead.",
    },
    {
      q: "Is a recurring commission better than a one-time one?",
      a: "Neither is better by itself. A recurring commission keeps paying while the customer stays, which suits products people keep for a long time; a one-time commission pays once per sale. Compare the full terms, including how long recurring payments last.",
    },
    {
      q: "How do affiliates get paid?",
      a: "Each program sets its payout method, schedule and minimum, such as PayPal or bank transfer once a month after you pass a threshold. The program blocks on this page show the payout terms each brand publishes.",
    },
  ],
  related: ["recurring-affiliate-programs", "lifetime-affiliate-programs", "affiliate-programs-for-beginners"],
}
