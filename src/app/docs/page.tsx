import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "What is OpenAffiliate?",
  description:
    "The open registry of affiliate programs. Built for developers and AI agents.",
};

export default function DocsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">
        What is OpenAffiliate?
      </h1>
      <p className="text-sm text-muted-foreground mt-2 mb-10">
        The open registry of affiliate programs. Built for developers and AI
        agents.
      </p>

      <div className="space-y-10">
        {/* What is a registry? */}
        <section>
          <h2 className="text-lg font-semibold mb-3">What is a registry?</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            A registry is a central directory — a single place where information
            is collected, organized, and made available to anyone who needs it.
            OpenAffiliate is a registry of affiliate programs: every program has
            a structured entry with its commission rate, cookie duration, payout
            details, approval process, and agent instructions. Instead of
            hunting through dozens of individual affiliate pages, you query one
            place and get consistent, machine-readable data back.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mt-3">
            The data lives in plain YAML files on GitHub. Anyone can read it,
            improve it, or build on top of it. There is no API key required to
            browse programs, and the registry itself is open source.
          </p>
        </section>

        {/* Who is this for? */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Who is this for?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                title: "Creators & Bloggers",
                desc: "Find the best affiliate programs for your audience. Compare commissions, cookie windows, and payout terms side by side — no sign-up required.",
              },
              {
                title: "Developers & Agents",
                desc: "Query the registry via REST API, CLI, MCP, or TypeScript SDK. Build tools that recommend the right program for the right context, automatically.",
              },
              {
                title: "SaaS Companies",
                desc: "List your affiliate program in a structured, discoverable format. Reach developers, AI agents, and content creators who are actively looking for programs to promote.",
              },
            ].map((card) => (
              <div
                key={card.title}
                className="rounded-lg border border-border/50 bg-muted/20 p-4"
              >
                <h3 className="text-sm font-semibold mb-1">{card.title}</h3>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {card.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section>
          <h2 className="text-lg font-semibold mb-3">How it works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                step: "1",
                title: "Browse",
                desc: "Search 349+ programs by keyword, category, commission type, or payout rate. Use the web UI, CLI, API, or MCP.",
              },
              {
                step: "2",
                title: "Connect",
                desc: "Integrate via the CLI, REST API, MCP server, or TypeScript SDK. Each program page has copy-ready snippets for every integration path.",
              },
              {
                step: "3",
                title: "Earn",
                desc: "Follow the signup URL to join the program directly. No middleman, no platform fee — the registry is a discovery layer, not a network.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="rounded-lg border border-border/50 bg-muted/20 p-4"
              >
                <span className="text-[10px] font-mono text-muted-foreground/50">
                  {item.step}
                </span>
                <h3 className="text-sm font-semibold mt-1 mb-1">
                  {item.title}
                </h3>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Quick links */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Quick links</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              {
                title: "Quick Start",
                desc: "Up in 30 seconds",
                href: "/docs/quickstart",
              },
              {
                title: "CLI",
                desc: "npx openaffiliate",
                href: "/docs/cli",
              },
              {
                title: "MCP",
                desc: "For AI agents",
                href: "/docs/mcp",
              },
              {
                title: "Submit",
                desc: "Add a program",
                href: "/docs/submit",
              },
            ].map((link) => (
              <Link
                key={link.title}
                href={link.href}
                className="rounded-lg border border-border/50 bg-muted/20 p-3 text-center hover:bg-muted/40 transition-colors"
              >
                <p className="text-xs font-semibold">{link.title}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {link.desc}
                </p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
