import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { Nav } from "@/components/nav";
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
  title: "OpenAffiliate — The Open Registry of Affiliate Programs",
  description:
    "Discover, compare, and integrate affiliate programs. Built for developers and AI agents. Open source, community-driven.",
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
                { label: "Categories", href: "/programs" },
                { label: "Submit", href: "/submit" },
                { label: "Docs", href: "/docs" },
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
                { label: "CLI", href: "/docs" },
                { label: "MCP", href: "/docs" },
                { label: "API", href: "/docs" },
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
          <a
            href="https://github.com/Affitor/open-affiliate"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            GitHub
          </a>
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
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Nav />
        <main className="flex-1 dot-grid">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
