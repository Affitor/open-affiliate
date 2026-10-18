// Public changelog. Each entry is something live on openaffiliate.dev on its date (Pacific time).
// Entries before October 2026 are archived and no longer published.
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
]
