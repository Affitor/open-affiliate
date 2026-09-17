import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Changelog",
  description: "What's new in OpenAffiliate. New features, improvements, and fixes.",
};

type ChangelogEntry = {
  date: string;
  title: string;
  image?: { src: string; alt: string };
  items: {
    tag: "new" | "improved" | "fixed";
    text: string;
  }[];
};

const TAG_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  new: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", label: "New" },
  improved: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", label: "Improved" },
  fixed: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", label: "Fixed" },
};

const changelog: ChangelogEntry[] = [
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
];

function TagBadge({ tag }: { tag: string }) {
  const style = TAG_STYLES[tag] ?? TAG_STYLES.new;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
}

export default function ChangelogPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-16">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 inline-block">
          &larr; Back to OpenAffiliate
        </Link>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mt-2">Changelog</h1>
        <p className="text-lg text-muted-foreground mt-3">
          New features, improvements, and fixes shipped to OpenAffiliate.
        </p>
      </header>

      <div className="space-y-0">
        {changelog.map((entry, i) => (
          <article key={entry.date} className="relative pl-8 pb-16 last:pb-0">
            {/* Timeline line */}
            {i < changelog.length - 1 && (
              <div className="absolute left-[7px] top-[28px] bottom-0 w-px bg-border" />
            )}
            {/* Timeline dot */}
            <div className="absolute left-0 top-[6px] w-[15px] h-[15px] rounded-full border-2 border-emerald-500 bg-background" />

            <time className="text-sm font-medium text-muted-foreground">{entry.date}</time>
            <h2 className="text-xl font-semibold mt-1 mb-6">{entry.title}</h2>

            {entry.image && (
              <div className="mb-8 rounded-xl overflow-hidden border border-border/60 shadow-sm">
                <Image
                  src={entry.image.src}
                  alt={entry.image.alt}
                  width={1280}
                  height={900}
                  className="w-full h-auto"
                  priority={i === 0}
                />
              </div>
            )}

            <ul className="space-y-3">
              {entry.items.map((item, j) => (
                <li key={j} className="flex gap-3 items-start">
                  <TagBadge tag={item.tag} />
                  <span className="text-sm text-muted-foreground leading-relaxed">{item.text}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}
