import Link from "next/link";
import {
  ArrowRight,
  Terminal,
  GitFork,
  Search,
  Code,
  GitPullRequest,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProgramLogo } from "@/components/program-logo";
import { programs, categories } from "@/lib/programs";

function ProgramCard({ program }: { program: (typeof programs)[0] }) {
  return (
    <Link
      href={`/programs/${program.slug}`}
      className="group flex flex-col gap-3 rounded-xl border border-border/50 bg-card/50 p-5 transition-all hover:border-emerald-500/30 hover:bg-card hover:shadow-[0_0_15px_rgba(34,197,94,0.06)]"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <ProgramLogo slug={program.slug} name={program.name} size={40} />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">{program.name}</h3>
              {program.verified && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 border-emerald-600/30 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                >
                  verified
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {program.shortDescription}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary" className="text-[11px]">
          {program.commission.rate}%{" "}
          {program.commission.type === "recurring" ? "recurring" : "one-time"}
        </Badge>
        <Badge variant="outline" className="text-[11px]">
          {program.cookieDays}d cookie
        </Badge>
        <Badge variant="outline" className="text-[11px]">
          {program.category}
        </Badge>
      </div>
    </Link>
  );
}

export default function Home() {
  const featured = programs.slice(0, 6);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(34,197,94,0.06),transparent_60%)]" />
        <div className="mx-auto max-w-6xl px-6 py-14 md:py-20 relative">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left */}
            <div>
              <div className="flex items-center gap-2 mb-6">
                <Badge
                  variant="outline"
                  className="text-xs px-2.5 py-1 border-border/60"
                >
                  <GitFork className="h-3 w-3 mr-1" />
                  Open Source
                </Badge>
                <Badge
                  variant="outline"
                  className="text-xs px-2.5 py-1 border-border/60"
                >
                  {programs.length} programs
                </Badge>
              </div>

              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.05]">
                The open registry
                <br />
                of{" "}
                <span className="text-emerald-600 dark:text-emerald-400">affiliate</span>
                <br />
                programs.
              </h1>
              <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-md">
                Discover, compare, and integrate affiliate programs. Built for
                developers and AI agents. Community-contributed.
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link
                  href="/programs"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-foreground text-background px-5 py-2.5 text-sm font-medium hover:bg-foreground/90 transition-colors"
                >
                  Browse Programs
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/docs"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border/60 px-5 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
                >
                  <Terminal className="h-4 w-4" />
                  View Docs
                </Link>
              </div>
            </div>

            {/* Right — Terminal mockup */}
            <div className="hidden lg:block">
              <div className="rounded-xl border border-border/50 bg-zinc-950 overflow-hidden shadow-2xl">
                {/* Title bar */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-zinc-900/80">
                  <span className="h-3 w-3 rounded-full bg-zinc-600" />
                  <span className="h-3 w-3 rounded-full bg-zinc-600" />
                  <span className="h-3 w-3 rounded-full bg-zinc-600" />
                  <span className="ml-3 text-xs text-muted-foreground font-mono">
                    openaffiliate
                  </span>
                </div>
                {/* Terminal body */}
                <div className="p-5 font-mono text-sm leading-relaxed">
                  <p className="text-muted-foreground">
                    <span className="text-emerald-400">$</span>{" "}
                    <span className="text-foreground">
                      npx openaffiliate search &quot;email&quot;
                    </span>
                  </p>
                  <div className="mt-4 text-muted-foreground/60 text-xs">
                    <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 mb-2 pb-2 border-b border-border/30 text-muted-foreground">
                      <span>Name</span>
                      <span>Commission</span>
                      <span>Cookie</span>
                    </div>
                    <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 py-1.5">
                      <span className="text-foreground/80">ConvertKit</span>
                      <span className="text-emerald-400/80">50% rec</span>
                      <span>90d</span>
                    </div>
                    <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 py-1.5">
                      <span className="text-foreground/80">Postmark</span>
                      <span className="text-emerald-400/80">$100/ref</span>
                      <span>30d</span>
                    </div>
                  </div>
                  <p className="mt-4 text-muted-foreground/50 text-xs">
                    Found 2 programs.{" "}
                    <span className="text-muted-foreground">
                      Run with --json for API output.
                    </span>
                  </p>
                  <p className="mt-3 text-muted-foreground">
                    <span className="text-emerald-400">$</span>{" "}
                    <span className="animate-pulse">_</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof + Stats */}
      <section className="relative border-y border-border/25">
        <div className="absolute inset-0 bg-gradient-to-b from-muted/5 to-transparent pointer-events-none" />
        <div className="relative mx-auto max-w-6xl px-6 py-0">
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border/25">
            {[
              { value: programs.length.toString(), label: "Programs", sub: "and growing" },
              { value: categories.length.toString(), label: "Categories", sub: "fully indexed" },
              { value: "100%", label: "Open Source", sub: "MIT licensed" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col items-center justify-center gap-1 py-8 sm:py-10 px-6 text-center"
              >
                <span className="text-4xl sm:text-[2.75rem] font-bold leading-none tracking-tight tabular-nums text-foreground">
                  {stat.value}
                </span>
                <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70 mt-1">
                  {stat.label}
                </span>
                <span className="text-[11px] text-muted-foreground/35 tracking-wide">
                  {stat.sub}
                </span>
              </div>
            ))}
          </div>

          {/* Tools */}
          <div className="border-t border-border/25" />
          <div className="flex items-center justify-between py-4">
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/35 font-medium whitespace-nowrap">
              Works with
            </span>
            <div className="hidden sm:flex items-center gap-5">
              {[
                { name: "Claude", icon: "◆" },
                { name: "Cursor", icon: "◈" },
                { name: "Windsurf", icon: "◇" },
                { name: "Copilot", icon: "○" },
                { name: "CLI", icon: "›_" },
                { name: "MCP", icon: "⬡" },
              ].map((tool, i, arr) => (
                <span key={tool.name} className="flex items-center gap-5">
                  <span className="group flex items-center gap-1.5 cursor-default">
                    <span className="text-[10px] text-muted-foreground/25 group-hover:text-emerald-600/70 dark:group-hover:text-emerald-500/60 transition-colors duration-300 font-mono">
                      {tool.icon}
                    </span>
                    <span className="text-[11px] text-muted-foreground/40 group-hover:text-muted-foreground/80 transition-colors duration-300 tracking-wide">
                      {tool.name}
                    </span>
                  </span>
                  {i < arr.length - 1 && (
                    <span className="text-border/40 text-[10px]">/</span>
                  )}
                </span>
              ))}
            </div>
            <span className="sm:hidden text-[11px] text-muted-foreground/40 tracking-wide">
              Claude · Cursor · Windsurf + 3 more
            </span>
          </div>
        </div>
      </section>

      {/* Featured Programs */}
      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              Featured Programs
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Top programs sorted by community stars
            </p>
          </div>
          <Link
            href="/programs"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {featured.map((program) => (
            <ProgramCard key={program.slug} program={program} />
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border/40 bg-muted/10">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <h2 className="text-xl font-semibold tracking-tight mb-6">
            How it works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                step: "01",
                icon: Search,
                title: "Browse or search",
                desc: "Find affiliate programs by category, commission rate, or keyword. Use the web UI, CLI, or MCP connector.",
              },
              {
                step: "02",
                icon: Code,
                title: "Integrate",
                desc: "Each program includes AGENTS.md with integration instructions for AI agents, plus standard affiliate links for humans.",
              },
              {
                step: "03",
                icon: GitPullRequest,
                title: "Contribute",
                desc: "Submit new programs via GitHub PR. Add a YAML file to the registry, community reviews and merges.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="flex flex-col gap-4 rounded-xl border border-border/40 bg-card/30 p-6"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                    <item.icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="text-xs font-mono text-muted-foreground/60">
                    {item.step}
                  </span>
                </div>
                <h3 className="text-base font-semibold">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="relative rounded-xl p-px bg-gradient-to-br from-border/60 via-emerald-500/20 to-border/60">
          <div className="rounded-[11px] bg-card/40 p-8 md:p-12 text-center">
            <h2 className="text-2xl font-bold tracking-tight">
              Add your program
            </h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
              Submit your affiliate program to the registry. Open a PR on GitHub
              or use the submission form.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/submit"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-foreground text-background px-5 py-2.5 text-sm font-medium hover:bg-foreground/90 transition-colors"
              >
                Submit Program
              </Link>
              <a
                href="https://github.com/openaffiliate/registry"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border/60 px-5 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
              >
                <GitFork className="h-4 w-4" />
                Open a PR
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
