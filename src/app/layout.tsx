import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Nav } from "@/components/nav";
import { AffitorLink } from "@/components/affitor-link";
import { affitorUrl } from "@/lib/affitor-link";
import { PostHogProvider } from "@/components/posthog-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { WebMcpTools } from "@/components/webmcp-tools";
import { serializeJsonLd } from "@/lib/json-ld";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "OpenAffiliate — The Open Registry of Affiliate Programs",
    template: "%s | OpenAffiliate",
  },
  description:
    "Discover, compare, and integrate affiliate programs. Built for developers and AI agents. Open source, community-driven.",
  metadataBase: new URL("https://openaffiliate.dev"),
  // Self-referencing canonical on every page. Without it, the same listing
  // reachable at /programs and /programs?page=1 splits its ranking and
  // citation signals across both. "./" resolves against metadataBase per
  // route, so each page canonicalises to itself; pages that need something
  // else override alternates.canonical themselves.
  alternates: {
    canonical: "./",
  },
  openGraph: {
    title: "OpenAffiliate: The Open Registry of Affiliate Programs",
    description:
      "Discover, compare, and integrate affiliate programs. Built for developers and AI agents.",
    url: "https://openaffiliate.dev",
    siteName: "OpenAffiliate",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "OpenAffiliate",
    description:
      "The open registry of affiliate programs. Built for developers and AI agents.",
  },
};


// Four columns (redesign r3, 19/10). /programs and the A–Z page carry the whole
// registry: no viewport prefetch from every page's footer.
const NO_PREFETCH = new Set(["/programs", "/programs/a-z"]);
const FOOTER_COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Registry",
    links: [
      { label: "Rankings", href: "/rankings" },
      { label: "Programs", href: "/programs" },
      { label: "All programs A–Z", href: "/programs/a-z" },
      { label: "Networks", href: "/networks" },
      { label: "Categories", href: "/categories" },
      // Not in the r3 mock, kept: the footer was the only link to a reader's saved list.
      { label: "Saved", href: "/saved" },
    ],
  },
  {
    title: "Read",
    links: [
      { label: "Blog", href: "/blog" },
      { label: "Methodology", href: "/methodology" },
      { label: "Changelog", href: "/changelog" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "API", href: "/docs/api" },
      { label: "MCP", href: "/docs/mcp" },
      { label: "CLI", href: "/docs/cli" },
      { label: "llms.txt", href: "/llms.txt" },
    ],
  },
  {
    title: "Community",
    links: [
      { label: "Submit", href: "/submit" },
      { label: "GitHub", href: "https://github.com/Affitor/open-affiliate" },
      { label: "About", href: "/about" },
    ],
  },
];

function Footer() {
  return (
    <footer className="mt-auto">
      <div className="oa-frame border-t border-border px-4 pt-10 pb-8 text-meta text-muted-foreground sm:px-12">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="oa-label mb-3">{col.title}</p>
              <ul>
                {col.links.map(({ label, href }) => (
                  <li key={label}>
                    {/* External and non-page targets (GitHub, llms.txt) are plain anchors. */}
                    {href.startsWith("/") && href !== "/llms.txt" ? (
                      <Link href={href} prefetch={NO_PREFETCH.has(href) ? false : undefined} className="block py-1 text-foreground/80 hover:text-foreground transition-colors">
                        {label}
                      </Link>
                    ) : (
                      <a href={href} className="block py-1 text-foreground/80 hover:text-foreground transition-colors">
                        {label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-border pt-4">
          <p>
            OpenAffiliate is maintained by <AffitorLink href={affitorUrl("footer")} source="footer" cta="maintainer" className="text-foreground underline underline-offset-4 decoration-line-strong hover:decoration-current">Affitor</AffitorLink>. Listings are free; rankings are never paid.
          </p>
          <div className="flex items-center gap-4">
            <span>Open source · MIT</span>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </footer>
  );
}

/**
 * Site-wide entity markup.
 *
 * AI engines resolve a brand through schema before they will cite it as a
 * source. Without an Organization node there was nothing tying openaffiliate.dev
 * to a name, a logo, or the GitHub and npm identities that prove it is real —
 * the site scored 33/100 on structured data and 50/100 on trust.
 *
 * sameAs is the part that does the work: it links this domain to identities an
 * engine can already verify independently.
 */
const SITE_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://openaffiliate.dev/#organization",
      name: "OpenAffiliate",
      url: "https://openaffiliate.dev",
      logo: "https://openaffiliate.dev/logo.svg",
      description:
        "The open registry of affiliate programs. Community-maintained, MIT licensed, built for developers and AI agents.",
      sameAs: [
        "https://github.com/Affitor/open-affiliate",
        "https://www.npmjs.com/package/openaffiliate",
        "https://www.npmjs.com/package/openaffiliate-mcp",
      ],
    },
    {
      "@type": "WebSite",
      "@id": "https://openaffiliate.dev/#website",
      url: "https://openaffiliate.dev",
      name: "OpenAffiliate",
      publisher: { "@id": "https://openaffiliate.dev/#organization" },
      inLanguage: "en",
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate:
            "https://openaffiliate.dev/programs?q={search_term_string}",
        },
        "query-input": "required name=search_term_string",
      },
    },
    // The registry itself, and the two ways to query it. Only what is served:
    // the data is MIT licensed (/about), the API and MCP are free and keyless.
    {
      "@type": "Dataset",
      "@id": "https://openaffiliate.dev/#dataset",
      name: "OpenAffiliate registry of affiliate programs",
      description:
        // Names no cookie, payout or approval term: this graph is on every unverified
        // program page too, whose JSON-LD scripts/unconfirmed-checks.ts scans for one.
        "Affiliate programs with their commission terms, verification dates and recommendation guidance for AI agents. One YAML file per program, community-maintained.",
      url: "https://openaffiliate.dev/programs",
      license: "https://opensource.org/licenses/MIT",
      isAccessibleForFree: true,
      creator: { "@id": "https://openaffiliate.dev/#organization" },
      publisher: { "@id": "https://openaffiliate.dev/#organization" },
      distribution: [
        { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: "https://openaffiliate.dev/api/programs" },
        { "@type": "DataDownload", encodingFormat: "text/plain", contentUrl: "https://openaffiliate.dev/llms-full.txt" },
      ],
    },
    {
      "@type": ["WebAPI", "Service"],
      "@id": "https://openaffiliate.dev/#api",
      name: "OpenAffiliate API",
      description:
        "Read-only REST API and MCP server for searching the registry and reading program terms. No authentication or API key.",
      url: "https://openaffiliate.dev/docs/api",
      documentation: "https://openaffiliate.dev/openapi.json",
      provider: { "@id": "https://openaffiliate.dev/#organization" },
      availableChannel: [
        { "@type": "ServiceChannel", name: "REST API", serviceUrl: "https://openaffiliate.dev/api/programs" },
        { "@type": "ServiceChannel", name: "MCP server", serviceUrl: "https://openaffiliate.dev/mcp" },
      ],
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <link rel="describedby" href="/llms.txt" type="text/plain" />
        <link rel="ard" href="/.well-known/ard.json" type="application/json" />
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(SITE_JSON_LD) }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <PostHogProvider>
          <ThemeProvider>
            <Nav />
            <main className="flex-1">{children}</main>
            <Footer />
          </ThemeProvider>
        </PostHogProvider>
        <WebMcpTools />
      </body>
    </html>
  );
}
