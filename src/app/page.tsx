import type { Metadata } from "next";
import Link from "next/link";
import { TrackPageView } from "@/components/track-page-view";
import { ArrowRight, Check } from "lucide-react";
import { ProgramLogo } from "@/components/program-logo";
import { programs, livePrograms, categories, categoryToSlug, affiliateScore, confirmedPitch, termsConfirmed, UNCONFIRMED, IN_HOUSE, networkName, networksByName, networkToSlug } from "@/lib/programs";
import type { Program } from "@/lib/programs";
import { directorySentence, freshnessLine } from "@/lib/best-lists";
import { commissionChip } from "@/lib/program-chips";
import { homepageSets } from "@/lib/programs-directory";
import { blogEntries } from "@/lib/blog";
import { getOasScore, oasValue } from "@/lib/oas";
import { OasGradeChip } from "@/components/oas-grade";

// Hourly, like /rankings. The OAS preview also leaves out programs within two
// days of their 90-day expiry (homepageSets), so it does not show a score its
// program page or report (daily) has already dropped, unless the homepage went
// unvisited for two days (an accepted case).
export const revalidate = 3600;

// The count sentence: computed from the registry at build time, never typed.
const DESCRIPTION = directorySentence(programs);
const TITLE = "OpenAffiliate: Open Affiliate Program Directory and Database";

export const metadata: Metadata = {
  description: DESCRIPTION,
  // A page's openGraph replaces the layout's whole object, so every field is set here.
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://openaffiliate.dev",
    siteName: "OpenAffiliate",
    type: "website",
  },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
  alternates: {
    canonical: "/",
    types: {
      "text/markdown": "https://openaffiliate.dev/index.md",
    },
  },
};

function SectionHead({ title, note, href, link }: { title: string; note?: string; href: string; link: string }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {note && <p className="text-meta text-muted-foreground mt-0.5">{note}</p>}
      </div>
      <Link href={href} prefetch={false} className="inline-flex items-center gap-1 text-meta text-muted-foreground hover:text-foreground transition-colors">
        {link} <ArrowRight className="size-3" aria-hidden />
      </Link>
    </div>
  );
}

function cookieShort(program: Program): string {
  if (!termsConfirmed(program)) return UNCONFIRMED;
  return program.cookieDays != null ? `${program.cookieDays}-day cookie` : "Cookie not published";
}

export default function Home() {
  // Rankings top 5 (by OAS once it is published, else Affiliate Score), then 6
  // verified programs by Affiliate Score, none shown twice (homepageSets).
  const { rankings, ranks, verified, featured, by } = homepageSets(programs);
  const byOas = by === "oas";
  const networks = networksByName();
  const networkCount = networks.filter((n) => n.network !== IN_HOUSE).length;
  const checked = livePrograms.filter(termsConfirmed).length;
  // The five newest posts, topped up with ranked lists when there are fewer posts.
  const blog = blogEntries();
  const fromBlog = [...blog.posts, ...blog.lists].slice(0, 5);
  const byCategory = categories
    .map((name) => ({ name, slug: categoryToSlug(name), count: livePrograms.filter((p) => p.category === name).length }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

  return (
    <div className="oa-frame">
      <TrackPageView />

      <section className="oa-band py-14 md:py-20" data-scale="marketing">
        <div className="grid items-end gap-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-14">
          <div>
            <p className="oa-label">Open affiliate program directory and database</p>
            <h1 className="text-hero-sm md:text-hero font-semibold tracking-[-0.035em] mt-4 max-w-[760px]">
              Affiliate programs worth promoting, with terms you can check.
            </h1>
            {/* One short line under the title (redesign r3): the registry's own numbers. */}
            <p className="font-mono text-meta text-muted-foreground tabular-nums mt-4" data-freshness>
              {freshnessLine(programs)}
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              <Link
                href="/programs"
                prefetch={false}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                {/* The first link after the H1: the hub, in the words people search. */}
                Browse the affiliate program directory <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link
                href="/docs"
                className="inline-flex h-10 items-center rounded-lg border border-line-strong bg-card px-4 text-sm font-medium hover:bg-sunk transition-colors"
              >
                Docs and API
              </Link>
              <Link href="/new" className="inline-flex h-10 items-center rounded-lg border border-line-strong bg-card px-4 text-sm font-medium hover:bg-sunk transition-colors">New programs</Link>
            </div>
          </div>
          <dl className="grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-card" aria-label="Registry today">
            {[
              ["Programs", livePrograms.length.toLocaleString("en-US")],
              ["Terms checked", checked.toLocaleString("en-US")],
              ["Categories", byCategory.length.toString()],
              ["Paid placement", "None"],
            ].map(([dt, dd], i) => (
              <div key={dt} className={`px-4 py-4 ${i % 2 ? "border-l border-border" : ""} ${i > 1 ? "border-t border-border" : ""}`}>
                <dt className="oa-label">{dt}</dt>
                <dd className="font-mono text-title font-medium tracking-tight mt-1.5 tabular-nums">{dd}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section id="home-rankings" className="oa-band">
        <SectionHead title="Rankings" note={byOas ? "Top programs by OAS, the OpenAffiliate Score" : "Top programs by Affiliate Score"} href="/rankings" link="All rankings" />
        <ol className="border-t border-line-strong">
          {rankings.map((program, i) => (
            <li key={program.slug} className="border-b border-border">
              <Link href={`/programs/${program.slug}`} className="grid grid-cols-[24px_28px_minmax(0,1fr)_auto] items-center gap-3 px-1 py-2.5 hover:bg-sunk transition-colors sm:grid-cols-[24px_28px_minmax(0,1fr)_200px_120px_56px]">
                <span className="font-mono text-meta text-muted-foreground">{ranks[i]}</span>
                <ProgramLogo slug={program.slug} name={program.name} size={28} className="shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{program.name}</span>
                  {/* The date the ranking's tie-break uses (compareBoard): the score's verified date. */}
                  {verified[i] && <span className="block text-meta text-muted-foreground">Verified <time dateTime={verified[i]!}>{verified[i]}</time></span>}
                </span>
                <span className="hidden truncate font-mono text-meta sm:block">
                  {commissionChip(program.commission, true)}
                </span>
                <span className="hidden text-meta text-muted-foreground sm:block">{program.category}</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-flex h-[22px] min-w-9 items-center justify-center rounded-sm border border-line-strong font-mono text-xs font-semibold tabular-nums" title={byOas ? "OAS" : "Affiliate Score"}>
                    {byOas ? oasValue(getOasScore(program.slug)!) : affiliateScore(program)}
                  </span>
                  {byOas && <OasGradeChip score={oasValue(getOasScore(program.slug)!)!} />}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section id="home-featured" className="oa-band">
        <SectionHead title="Verified programs" note="Terms checked on the brand's own page, by Affiliate Score" href="/programs" link={`Full list of ${livePrograms.length.toLocaleString("en-US")} affiliate programs`} />
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {featured.map((program) => (
            <Link
              key={program.slug}
              href={`/programs/${program.slug}`}
              className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 hover:bg-sunk transition-colors"
            >
              <div className="flex min-w-0 items-center gap-3">
                <ProgramLogo slug={program.slug} name={program.name} size={36} className="shrink-0" />
                <div className="min-w-0">
                  <h3 className="flex items-center gap-1.5 truncate text-sm font-semibold">
                    {program.name}
                    {program.verified && <Check className="size-3.5 shrink-0 text-good" role="img" aria-label="Verified" />}
                  </h3>
                  <p className="truncate text-meta text-muted-foreground">{confirmedPitch(program, program.shortDescription)}</p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                <span className="truncate font-mono text-meta">{commissionChip(program.commission)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{cookieShort(program)}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Top verified programs: plain links, so each is in the raw HTML. */}
      {/* Plain anchors: every network is a link in the raw HTML. A to Z by name, in-house last (networksByName, the /networks grid order). */}
      <section id="home-networks" className="oa-band">
        <SectionHead title={`${networkCount} networks`} href="/networks" link="All networks" />
        <ul className="columns-2 gap-6 text-sm text-foreground/80 sm:columns-3 lg:columns-5 [&_a:hover]:text-foreground [&_a:hover]:underline [&_li]:py-1">
          {networks.map(({ network, programs: list }) => (
            <li key={network} className="flex items-baseline justify-between gap-2 break-inside-avoid">
              <a href={`/networks/${networkToSlug(network)}`} className="truncate">{networkName(network)}</a>
              <span className="font-mono text-meta text-muted-foreground">{list.length}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="oa-band">
        <SectionHead title={`${byCategory.length} categories`} href="/categories" link="All categories" />
        <nav aria-label="Categories" className="grid grid-cols-2 gap-x-6 md:grid-cols-4 md:gap-x-8">
          {byCategory.map((c) => (
            <Link
              key={c.slug}
              href={`/categories/${c.slug}`}
              className="flex justify-between gap-2 border-b border-border px-1 py-2.5 text-sm hover:bg-sunk transition-colors"
            >
              <span className="truncate">{c.name}</span>
              <span className="font-mono text-meta text-muted-foreground">{c.count}</span>
            </Link>
          ))}
        </nav>
      </section>

      <section id="home-blog" className="oa-band">
        <SectionHead title="From the blog" href="/blog" link="All posts" />
        <ul className="border-t border-line-strong">
          {fromBlog.map((e) => (
            <li key={e.href} className="border-b border-border">
              <Link href={e.href} className="flex items-baseline justify-between gap-4 px-1 py-2.5 text-sm hover:bg-sunk transition-colors">
                <span className="min-w-0 truncate">{e.title}</span>
                <time dateTime={e.date ?? undefined} className="shrink-0 font-mono text-xs text-muted-foreground">{e.date ?? ""}</time>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="oa-band">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-lg font-semibold">Run a program?</h2>
            <p className="text-sm text-muted-foreground mt-1">Add it to the registry: submit your program page for review, or open a pull request on GitHub.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/submit" className="inline-flex h-8 items-center rounded-lg border border-line-strong bg-card px-3 text-meta font-medium hover:bg-sunk transition-colors">Submit a program</Link>
              <a href="https://github.com/Affitor/open-affiliate" className="inline-flex h-8 items-center rounded-lg border border-line-strong bg-card px-3 text-meta font-medium hover:bg-sunk transition-colors">Open a pull request</a>
            </div>
          </div>
          <div>
            <h2 className="text-lg font-semibold">Building an agent?</h2>
            <p className="text-sm text-muted-foreground mt-1">The same registry over MCP, a REST API, a CLI and a Markdown page per program.</p>
            <p tabIndex={0} aria-label="MCP install command" className="mt-3 overflow-x-auto whitespace-nowrap rounded-lg border border-border bg-sunk px-3 py-2 font-mono text-meta">claude mcp add --transport http openaffiliate https://openaffiliate.dev/mcp</p>
          </div>
        </div>
      </section>
    </div>
  );
}
