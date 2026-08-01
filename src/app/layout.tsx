import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { Nav } from "@/components/nav";
import { PostHogProvider } from "@/components/posthog-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
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
    title: "OpenAffiliate — The Open Registry of Affiliate Programs",
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


function Footer() {
  return (
    <footer className="mt-auto border-t border-border/40">
      <div className="mx-auto max-w-6xl px-6 py-12">
        {/* Mega footer columns */}
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 mb-12">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60 mb-4">
              Registry
            </p>
            <ul className="space-y-2.5">
              {[
                { label: "Programs", href: "/programs" },
                { label: "Categories", href: "/categories" },
                // The page is /content-lab. /lab has been a 404 in the footer
                // of every page on the site.
                { label: "Content Lab", href: "/content-lab" },
                { label: "Submit", href: "/submit" },
                { label: "Docs", href: "/docs" },
                { label: "Changelog", href: "/changelog" },
              ].map(({ label, href }) => (
                <li key={label}>
                  <Link
                    href={href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60 mb-4">
              Developers
            </p>
            <ul className="space-y-2.5">
              {[
                { label: "CLI", href: "/docs/cli" },
                { label: "MCP", href: "/docs/mcp" },
                { label: "API", href: "/docs/api" },
                { label: "GitHub", href: "https://github.com/Affitor/open-affiliate", external: true },
              ].map(({ label, href, external }) => (
                <li key={label}>
                  {external ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {label}
                    </a>
                  ) : (
                    <Link
                      href={href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60 mb-4">
              Community
            </p>
            <ul className="space-y-2.5">
              <li>
                <a
                  href="https://github.com/Affitor/open-affiliate"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  GitHub
                </a>
              </li>
              <li>
                <Link
                  href="/feedback"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Feedback
                </Link>
              </li>
              {/* An About page reachable from every page is what turns an
                  anonymous domain into an identifiable publisher. */}
              <li>
                <Link
                  href="/about"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  About &amp; Contact
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-border/40 pt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.svg"
              alt="OpenAffiliate"
              width={20}
              height={20}
              className="rounded"
            />
            <span className="text-xs text-muted-foreground">
              OpenAffiliate. Open source, community-driven.
            </span>
          </div>
          <ThemeToggle />
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
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: JSON.stringify(SITE_JSON_LD) }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <PostHogProvider>
          <ThemeProvider>
            <Nav />
            <main className="flex-1 dot-grid">{children}</main>
            <Footer />
          </ThemeProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
