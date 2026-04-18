"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { SearchBar } from "@/components/search-bar";

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

const NAV_LINKS = [
  { label: "Programs", href: "/programs" },
  { label: "Rankings", href: "/rankings" },
  { label: "Submit", href: "/submit" },
  { label: "Docs", href: "/docs" },
];

export function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        {/* Left: Logo + desktop nav */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/logo.svg"
              alt="OpenAffiliate"
              width={28}
              height={28}
              className="rounded-md"
            />
            <span className="text-sm font-semibold tracking-tight">
              OpenAffiliate
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            {NAV_LINKS.map(({ label, href }) => (
              <Link
                key={label}
                href={href}
                className={`text-sm transition-colors ${pathname === href || (href !== "/" && pathname.startsWith(href)) ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
                aria-current={pathname === href || (href !== "/" && pathname.startsWith(href)) ? "page" : undefined}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Right: Search + GitHub + hamburger */}
        <div className="flex items-center gap-3">
          <div className="hidden md:block w-56 lg:w-64">
            <SearchBar />
          </div>
          <a
            href="https://github.com/Affitor/open-affiliate"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <GitHubIcon className="h-4 w-4" />
            <span className="hidden sm:inline">GitHub</span>
          </a>
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen((prev) => !prev)}
            className="md:hidden flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? (
              <X className="h-4 w-4" />
            ) : (
              <Menu className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Subtle gradient bottom line */}
      <div className="h-px w-full bg-[linear-gradient(90deg,transparent,oklch(0.18_0.01_75/6%)_20%,oklch(0.45_0.15_160/20%)_50%,oklch(0.18_0.01_75/6%)_80%,transparent)] dark:bg-[linear-gradient(90deg,transparent,oklch(0.3_0.01_75/10%)_20%,oklch(0.55_0.15_160/25%)_50%,oklch(0.3_0.01_75/10%)_80%,transparent)]" />

      {/* Mobile menu drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border/40 bg-background/95 backdrop-blur-xl">
          <nav className="mx-auto max-w-6xl px-6 py-4 flex flex-col gap-1">
            {NAV_LINKS.map(({ label, href }) => (
              <Link
                key={label}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={`py-2.5 text-sm transition-colors ${pathname === href || (href !== "/" && pathname.startsWith(href)) ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
