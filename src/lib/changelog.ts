export type ChangelogEntry = {
  date: string
  title: string
  image?: { src: string; alt: string }
  items: {
    tag: "new" | "improved" | "fixed"
    text: string
  }[]
}

export const changelog: ChangelogEntry[] = [
  {
    date: "April 18, 2026",
    title: "Social Listen Data Pipeline + Registry Expansion",
    image: { src: "/changelog/launch-program-detail.png", alt: "Program detail page with Social Listen showing YouTube, TikTok, Reddit, and Blog content" },
    items: [
      { tag: "new", text: "Social data persistence \u2014 all raw social items (YouTube, TikTok, X, Reddit, Blog) are now stored in Supabase for future content discovery and insights." },
      { tag: "new", text: "Weekly query rotation \u2014 3 query variants per platform, rotated weekly to discover different content over time instead of re-fetching the same results." },
      { tag: "new", text: "Added 190 new programs across 6 batches: schema hardening, PartnerStack delta (+96), AI-native wave 1 (+25), AI wave 2 (+25), YC AI companies (+20), marketplace scans (+24)." },
      { tag: "new", text: "SVG badge embed \u2014 embeddable Affiliate Score badge with size variants and web component support." },
      { tag: "improved", text: "Maximized data collection per API call \u2014 YouTube RapidAPI 6\u219250 results, Apify 20\u219230, removed slice limits on TikTok and X. Zero cost increase (per-request pricing)." },
      { tag: "improved", text: "Social Listen now uses PPR (Partial Prerendering) with dynamic holes \u2014 no more API calls during build, fixing the 10-minute build time regression." },
      { tag: "improved", text: "YouTube fetch priority swapped: RapidAPI (free) first, Apify ($0.03/call) as fallback. Saves ~$22/day on Apify costs." },
      { tag: "improved", text: "Affiliate Score algorithm redesigned (0\u2013100) with better commission parsing and tier-aware scoring." },
      { tag: "fixed", text: "Build time regression (10+ minutes) caused by API calls during static generation for all 446 programs." },
      { tag: "fixed", text: "98 missing logos from Batch 2 PartnerStack delta import." },
      { tag: "fixed", text: "Vercel deploy failures \u2014 inline index build, tolerate missing workspace packages, disable lint during build." },
    ],
  },
  {
    date: "April 17, 2026",
    title: "Launch Day",
    image: { src: "/changelog/launch-homepage.png", alt: "OpenAffiliate homepage with CLI demo, rankings preview, and featured programs" },
    items: [
      { tag: "new", text: "OpenAffiliate launched at openaffiliate.dev \u2014 the open registry of affiliate programs for developers and AI agents." },
      { tag: "new", text: "446 affiliate programs with structured YAML data: commission rates, cookie duration, payout details, agent instructions." },
      { tag: "new", text: "CLI tool \u2014 search and manage programs from your terminal with npx openaffiliate." },
      { tag: "new", text: "MCP server \u2014 connect AI agents to the registry via Model Context Protocol (HTTP + stdio)." },
      { tag: "new", text: "TypeScript SDK \u2014 typed client for searching and querying programs." },
      { tag: "new", text: "REST API \u2014 no auth required. Query programs, categories, and social data." },
      { tag: "new", text: "Social Listen \u2014 aggregated social content (YouTube, TikTok, X, Reddit, Blog) for each program with quality scoring and 7-day cache." },
      { tag: "new", text: "Affiliate Score \u2014 algorithmic scoring (0\u2013100) based on commission, cookie duration, payment terms, and brand strength." },
      { tag: "new", text: "Community voting on programs with Supabase-backed vote counts." },
      { tag: "new", text: "Multi-page docs site with sidebar navigation, table of contents, and code blocks." },
      { tag: "new", text: "Rankings page with sortable table, category filters, and search." },
      { tag: "new", text: "Category and network landing pages with SEO." },
      { tag: "new", text: "Program detail pages with ConnectTabs, CapabilityCards, and related programs." },
      { tag: "new", text: "HD logos via Clearbit with graceful fallback chain." },
      { tag: "new", text: "Cmd+K search bar for instant program discovery." },
      { tag: "improved", text: "Premium dark theme UI \u2014 enterprise-style design with neutral colors and tight spacing." },
      { tag: "fixed", text: "Deep-verified all programs \u2014 removed 14 fake/unverifiable entries, corrected 6 others." },
      { tag: "fixed", text: "Updated signup URLs to actual affiliate program pages for 299 programs." },
    ],
  },
]
