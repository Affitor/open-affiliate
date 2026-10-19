import type { Metadata } from "next";
import Link from "next/link";
import { TrackPageView } from "@/components/track-page-view";
import { ArrowRight } from "lucide-react";
import { ProgramLogo } from "@/components/program-logo";
import { getCategoryStats, categoryToSlug, formatCommissionDisplay, rateBasis, termsConfirmed, UNCONFIRMED } from "@/lib/programs";

export const metadata: Metadata = {
  title: "Affiliate Program Categories",
  description:
    "Browse affiliate programs by category. Compare commission rates across AI, SaaS, E-Commerce, Developer Tools, and 20+ more categories.",
  openGraph: {
    title: "Affiliate Program Categories: OpenAffiliate",
    description:
      "Browse affiliate programs by category and compare commissions, cookies, and verified terms.",
    url: "https://openaffiliate.dev/categories",
    siteName: "OpenAffiliate",
    images: ["/opengraph-image"],
  },
};

export default function CategoriesPage() {
  const stats = getCategoryStats();

  return (
    <div className="oa-frame">
      <TrackPageView />
      <header className="oa-band !py-8 md:!py-10">
        <p className="oa-label">Directory</p>
        <h1 className="mt-2 text-title md:text-display font-semibold tracking-[-0.03em]">Categories</h1>
        <p className="mt-1 font-mono text-meta text-muted-foreground tabular-nums">
          {stats.length} categories · {stats.reduce((s, c) => s + c.programCount, 0)} programs
        </p>
      </header>

      <section className="oa-band" aria-label="Categories">
        <div className="grid grid-cols-1 gap-x-10 md:grid-cols-2 lg:grid-cols-3">
          {stats.map((cat) => (
            <Link
              key={cat.category}
              href={`/categories/${categoryToSlug(cat.category)}`}
              className="group block border-b border-border py-4 hover:bg-sunk transition-colors"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold group-hover:underline">{cat.category}</h2>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">{cat.programCount} programs</span>
              </div>

              {/* Percentage rates only (commissionStats): a flat payout is not a rate.
                  Unconfirmed rates count, so the row says how many. */}
              <dl className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <dt className="oa-label">Highest rate</dt>
                  <dd className="font-mono text-lg font-medium tabular-nums">{cat.topRate ? formatCommissionDisplay(cat.topRate.value, false) : "—"}</dd>
                </div>
                <div>
                  <dt className="oa-label">Average rate</dt>
                  <dd className="font-mono text-lg font-medium tabular-nums text-muted-foreground">{cat.avgRate != null ? `${cat.avgRate.toFixed(0)}%` : "—"}</dd>
                </div>
              </dl>
              <p className="mt-1 text-xs text-muted-foreground">
                {cat.avgRate != null ? `Average across ${rateBasis(cat)}` : "No single rate published"}
              </p>

              {cat.topRate && (
                <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <ProgramLogo slug={cat.topRate.program.slug} name={cat.topRate.program.name} size={18} />
                  <span className="truncate">
                    Top rate: {cat.topRate.program.name}
                    {termsConfirmed(cat.topRate.program) ? "" : ` · ${UNCONFIRMED}`}
                  </span>
                </p>
              )}
            </Link>
          ))}
        </div>
      </section>

      {/* The best-of lists moved off this header into the blog (Sơn 19/10: "may cai nay co bien thanh blog duoc ko?"). */}
      <div className="oa-band !py-6 text-sm">
        <Link href="/blog" className="inline-flex items-center gap-1.5 underline decoration-line-strong underline-offset-4 hover:decoration-current">
          Best-of lists and guides on the blog <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
