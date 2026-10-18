// Public changelog. Each entry is something live on openaffiliate.dev on its date (Pacific time).
// The April 2026 entries are the launch history, rewritten without internal detail (API costs,
// vendors, build issues); the original wording is kept outside the repo.
export type ChangelogEntry = {
  date: string // YYYY-MM-DD
  title: string
  kind: "feature" | "improvements"
  summary?: string
  link?: { href: string; label: string }
  image?: { src: string; alt: string }
  items: {
    tag: "new" | "improved" | "fixed"
    text: string
  }[]
}

export const changelog: ChangelogEntry[] = [
  {
    date: "2026-10-18",
    title: "Hand-written best-of posts",
    kind: "feature",
    summary: "Read a short, hand-written guide for a category before you pick a program.",
    link: { href: "/best/ai-affiliate-programs", label: "Read the AI post" },
    items: [
      { tag: "new", text: "The best AI affiliate programs in 2026, at /best/ai-affiliate-programs." },
      { tag: "new", text: "The best recurring affiliate programs, at /best/recurring-affiliate-programs." },
    ],
  },
  {
    date: "2026-10-18",
    title: "Program pages that answer what an affiliate asks first",
    kind: "feature",
    summary: "Open any program and see what you earn, how you get paid and how to join before anything else.",
    link: { href: "/programs/runway", label: "See a program page" },
    items: [
      { tag: "new", text: "A You earn card comes first, with the payout, cookie, approval, how to join and one Apply button." },
      { tag: "new", text: "The page then covers what the product does, what people use it for, the steps from click to payout, the rules, and how the program compares with similar ones." },
      { tag: "improved", text: "Programs whose terms are not checked yet show the commission as unconfirmed and hide the cookie, payout and approval." },
      { tag: "improved", text: "Prompts and config for AI agents moved to each program's Markdown page, the REST API and MCP, linked in one line at the bottom." },
    ],
  },
  {
    date: "2026-10-18",
    title: "Improvements, Oct 12 to 18",
    kind: "improvements",
    items: [
      { tag: "new", text: "Since Oct 17, new SaaS and AI programs are added every day, each money field quoted from the brand's own terms or its program platform." },
      { tag: "improved", text: "Links to a brand's own site now carry utm_source=openaffiliate, so the brand can see the visits we send in its own analytics." },
      { tag: "fixed", text: "Terms corrected after re-checking the brands' own pages, including Jasper (now marked as not open to independent affiliates), AdCreative.ai, Runway, Speechify, Photoroom, Scalenut and Grammarly." },
      { tag: "fixed", text: "71 logos that were saved in the wrong format now load as standard PNG files." },
      { tag: "improved", text: "A shorter top bar: Programs, Networks and Categories. Submit, Docs and Rankings sit in the footer, and the GitHub button shows the star count." },
      { tag: "improved", text: "The web framework is updated to its latest patch release." },
      { tag: "improved", text: "Rankings now list verified programs only, sorted by commission, how long it recurs, cookie length, payout minimum or the date the terms were checked. The social posts section on program pages is retired." },
    ],
  },
  {
    date: "2026-04-18",
    title: "190 more programs and an embeddable score badge",
    kind: "feature",
    items: [
      { tag: "new", text: "190 programs added, including 96 from PartnerStack and 70 AI companies." },
      { tag: "new", text: "An embeddable Affiliate Score badge for a program's own site, in several sizes." },
      { tag: "improved", text: "The Affiliate Score was redesigned on a 0 to 100 scale, with better reading of commission rates and tiers." },
      { tag: "fixed", text: "98 programs that had no logo now show one." },
    ],
  },
  {
    date: "2026-04-17",
    title: "OpenAffiliate launches",
    kind: "feature",
    summary: "OpenAffiliate went live on April 17, 2026: an open registry of affiliate programs, for people and for AI agents.",
    items: [
      { tag: "new", text: "446 affiliate programs as structured data: commission, cookie length, payout details and notes for AI agents." },
      { tag: "new", text: "A CLI to search programs from the terminal with npx openaffiliate." },
      { tag: "new", text: "An MCP server so AI agents can query the registry, over HTTP or stdio." },
      { tag: "new", text: "A TypeScript SDK and a REST API that needs no key." },
      { tag: "new", text: "The Affiliate Score, from 0 to 100, based on commission, cookie length and payment terms." },
      { tag: "new", text: "Rankings with a sortable table, category filters and search." },
      { tag: "new", text: "A page for every program, category and network, and a docs site." },
      { tag: "new", text: "Social Listen: posts about each program from YouTube, TikTok, X, Reddit and blogs. Retired in October 2026." },
      { tag: "new", text: "Community votes on programs, and Cmd+K search from any page." },
      { tag: "fixed", text: "Before launch every program was checked: 14 entries that could not be verified were removed, 6 were corrected, and 299 signup links now go to the program's real affiliate page." },
    ],
  },
]
