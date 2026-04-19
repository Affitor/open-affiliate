import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { Nav } from "@/components/nav";
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
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider>
          <Nav />
          <main className="flex-1 dot-grid">{children}</main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
