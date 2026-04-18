import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Features",
};

export default function FeaturesPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Features</h1>
      <p className="text-sm text-muted-foreground mt-2 mb-10">
        Everything OpenAffiliate offers for partners, developers, and AI agents.
      </p>

      <div className="space-y-10">
        <section>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                title: "Search & Filter",
                desc: "Full-text search across 349+ programs. Filter by category, commission type, min rate, verified status.",
                href: "/programs",
              },
              {
                title: "Rankings",
                desc: "Affiliate Score algorithm ranks by commission, cookie duration, recurring potential, and verification. Sort by programs, networks, or categories.",
                href: "/rankings",
              },
              {
                title: "Community Voting",
                desc: "Upvote programs you have success with. Votes stored in Supabase, displayed alongside scores.",
                href: "/rankings",
              },
              {
                title: "Compare",
                desc: "Side-by-side comparison of up to 4 programs. Compare commission, cookie, payout, approval, and more.",
                href: "/compare",
              },
              {
                title: "Program Detail",
                desc: "Full breakdown: commission card, program info, restrictions, AGENTS.md instructions, integration snippets.",
                href: "/programs/vercel",
              },
              {
                title: "Connect Tabs",
                desc: "Each program page has ready-to-copy code for CLI, AI SDK, and MCP Config integration.",
                href: "/programs/stripe",
              },
              {
                title: "Badge Embed",
                desc: "SVG badges for your README. Copy the Markdown snippet from any program page.",
                href: "/programs/supabase",
              },
              {
                title: "Submit",
                desc: "Web form to submit new programs without touching YAML files directly.",
                href: "/submit",
              },
            ].map((f) => (
              <Link
                key={f.title}
                href={f.href}
                className="rounded-lg border border-border/50 bg-muted/20 p-4 hover:bg-muted/40 transition-colors group"
              >
                <h3 className="text-sm font-semibold group-hover:text-foreground">
                  {f.title}
                </h3>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                  {f.desc}
                </p>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Integration options</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              {
                label: "CLI",
                desc: "npx openaffiliate",
                href: "/docs/cli",
              },
              {
                label: "REST API",
                desc: "Public, no auth",
                href: "/docs/api",
              },
              {
                label: "MCP Server",
                desc: "HTTP + stdio",
                href: "/docs/mcp",
              },
              {
                label: "SDK",
                desc: "TypeScript",
                href: "/docs/sdk",
              },
            ].map((i) => (
              <Link
                key={i.label}
                href={i.href}
                className="rounded-lg border border-border/50 bg-muted/20 p-3 text-center hover:bg-muted/40 transition-colors"
              >
                <p className="text-xs font-semibold">{i.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {i.desc}
                </p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
