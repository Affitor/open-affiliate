import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { TrackPageView } from "@/components/track-page-view";
import { ArrowLeft, ArrowRight, DollarSign, Clock, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProgramLogo } from "@/components/program-logo";
import {
  programs,
  networkToSlug,
  slugToNetwork,
  parseCommissionRate,
  commissionLabel,
  commissionDisplay,
  commissionUnknown,
  networkKind,
  networkHowToJoin,
  networkName,
} from "@/lib/programs";

export function generateStaticParams() {
  const networks = [...new Set(programs.map((p) => p.network ?? "in-house"))];
  return networks.map((n) => ({ slug: networkToSlug(n) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const network = slugToNetwork(slug);
  if (!network) return { title: "Network Not Found" };

  const netPrograms = programs.filter((p) => (p.network ?? "in-house") === network);
  // No brand suffix: the root layout's title template appends
  // " | OpenAffiliate". openGraph.title is not templated, so it adds its own.
  const title = `${network} Affiliate Programs — ${netPrograms.length} Programs`;
  const description = `Browse ${netPrograms.length} affiliate programs on the ${network} network. Compare commissions, cookie duration, and payout terms.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/networks/${slug}`,
      types: { "text/markdown": `https://openaffiliate.dev/networks/${slug}.md` },
    },
    // images: nested metadata is replaced, not merged, so declaring openGraph
    // here drops the root opengraph-image and these pages shared with no preview.
    openGraph: { title: `${title} | OpenAffiliate`, description, url: `https://openaffiliate.dev/networks/${slug}`, siteName: "OpenAffiliate", images: ["/opengraph-image"] },
  };
}

export default async function NetworkPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const network = slugToNetwork(slug);
  if (!network) notFound();

  const netPrograms = [...programs.filter((p) => (p.network ?? "in-house") === network)].sort(
    (a, b) => parseCommissionRate(b.commission) - parseCommissionRate(a.commission)
  );

  // Only programs with a published figure feed the averages. Averaging an
  // unknown as zero is how a network of mostly-unpublished programs ends up
  // advertising a 4% average it never earned.
  const priced = netPrograms.filter((p) => !commissionUnknown(p.commission));
  const rates = priced.map((p) => parseCommissionRate(p.commission));
  const avgRate = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
  const highestRate = rates.length > 0 ? Math.max(...rates) : 0;
  const avgCookie = netPrograms.length > 0 ? netPrograms.reduce((s, p) => s + p.cookieDays, 0) / netPrograms.length : 0;
  const categoryCount = new Set(netPrograms.map((p) => p.category)).size;
  const verifiedCount = netPrograms.filter((p) => p.verified).length;
  const kind = networkKind(network);
  const topProgram = netPrograms[0];

  const answer =
    kind === "direct"
      ? `${netPrograms.length} programs run directly by the brand, with no network in between. ${verifiedCount} are verified.`
      : `${netPrograms.length} affiliate ${netPrograms.length === 1 ? "program" : "programs"} on ${networkName(network)}, across ${categoryCount} ${categoryCount === 1 ? "category" : "categories"}. ${verifiedCount} ${verifiedCount === 1 ? "is" : "are"} verified.`;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <TrackPageView type="network_view" slug={slug} metadata={{ network }} />

      {/* Slot 7 — the machine block. Program pages have carried this since
          launch; category and network pages never did, so an assistant had
          nothing structured to cite them from. */}
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: `${network} affiliate programs`,
            description: answer,
            url: `https://openaffiliate.dev/networks/${slug}`,
            isPartOf: { "@id": "https://openaffiliate.dev/#website" },
            publisher: { "@id": "https://openaffiliate.dev/#organization" },
            mainEntity: {
              "@type": "ItemList",
              numberOfItems: netPrograms.length,
              itemListElement: netPrograms.slice(0, 20).map((p, i) => ({
                "@type": "ListItem",
                position: i + 1,
                url: `https://openaffiliate.dev/programs/${p.slug}`,
                name: p.name,
              })),
            },
          }),
        }}
      />
      <Link
        href="/networks"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All Networks
      </Link>

      <div className="mb-8">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-2xl font-bold tracking-tight capitalize">{network}</h1>
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            {kind === "direct" ? "in-house" : kind}
          </Badge>
        </div>
        {/* Slot 2 — the one sentence a reader or an engine would quote. */}
        <p className="mt-3 max-w-2xl border-l-2 border-emerald-500/40 pl-3 text-sm">
          {answer}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="rounded-xl border border-border/40 bg-card/30 p-4">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Users className="h-3 w-3" />
            <span className="text-[10px] uppercase tracking-wide">Programs</span>
          </div>
          <p className="text-2xl font-bold">{netPrograms.length}</p>
        </div>
        <div className="rounded-xl border border-border/40 bg-card/30 p-4">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <DollarSign className="h-3 w-3" />
            <span className="text-[10px] uppercase tracking-wide">Highest</span>
          </div>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{priced.length ? (priced[0].commission.mode === "flat" ? `$${priced[0].commission.value}` : `${priced[0].commission.value}%`) : "—"}</p>
        </div>
        <div className="rounded-xl border border-border/40 bg-card/30 p-4">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <DollarSign className="h-3 w-3" />
            <span className="text-[10px] uppercase tracking-wide">Verified</span>
          </div>
          <p className="text-2xl font-bold">{verifiedCount}</p>
        </div>
        <div className="rounded-xl border border-border/40 bg-card/30 p-4">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Clock className="h-3 w-3" />
            <span className="text-[10px] uppercase tracking-wide">Avg Cookie</span>
          </div>
          <p className="text-2xl font-bold">{avgCookie.toFixed(0)}d</p>
        </div>
      </div>

      <div className="rounded-xl border border-border/40 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className="w-12 py-3 px-3 text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wide">#</th>
                <th className="py-3 px-3 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wide min-w-[180px]">Program</th>
                <th className="w-28 py-3 px-3 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Commission</th>
                <th className="w-24 py-3 px-3 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Type</th>
                <th className="w-20 py-3 px-3 text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Cookie</th>
                <th className="w-24 py-3 px-3 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wide hidden md:table-cell">Payout</th>
                <th className="w-32 py-3 px-3 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Category</th>
              </tr>
            </thead>
            <tbody>
              {netPrograms.map((program, i) => (
                <tr key={program.slug} className="border-t border-border/20 hover:bg-muted/20 transition-colors group">
                  <td className="py-3 px-3 text-center">
                    <span className={`text-xs font-medium ${i < 3 ? (i === 0 ? "text-amber-500" : i === 1 ? "text-zinc-400" : "text-orange-500") : "text-muted-foreground"}`}>
                      {i + 1}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <Link href={`/programs/${program.slug}`} className="flex items-center gap-3">
                      <ProgramLogo slug={program.slug} name={program.name} size={32} className="shrink-0" />
                      <div className="min-w-0">
                        <span className="text-sm font-medium truncate block group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                          {program.name}
                        </span>
                        {program.verified && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 border-emerald-600/30 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 mt-0.5">verified</Badge>
                        )}
                      </div>
                    </Link>
                  </td>
                  <td className="py-3 px-3">
                    <span className={`text-sm font-semibold ${commissionUnknown(program.commission) ? "text-muted-foreground font-normal italic" : "text-emerald-600 dark:text-emerald-400"}`}>{commissionDisplay(program.commission)}</span>
                  </td>
                  <td className="py-3 px-3 hidden sm:table-cell">
                    <Badge variant="secondary" className="text-[10px]">{commissionLabel(program.commission)}</Badge>
                  </td>
                  <td className="py-3 px-3 text-center hidden sm:table-cell">
                    <span className="text-xs text-muted-foreground">{program.cookieDays}d</span>
                  </td>
                  <td className="py-3 px-3 hidden md:table-cell">
                    <span className="text-xs text-muted-foreground">${program.payout.minimum}</span>
                  </td>
                  <td className="py-3 px-3 hidden lg:table-cell">
                    <span className="text-xs text-muted-foreground">{program.category}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slot 4 — the questions a reader actually arrives with, answered in
          the first sentence. Generated from the registry so they cannot go
          stale, which is the trade against hand-written copy. */}
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="text-base font-semibold">How do you join a program here?</h2>
          <p className="mt-1.5 text-sm text-muted-foreground max-w-prose">
            {networkHowToJoin(network)}
          </p>
        </div>
        {topProgram && (
          <div>
            <h2 className="text-base font-semibold">Which pays the most?</h2>
            <p className="mt-1.5 text-sm text-muted-foreground max-w-prose">
              {topProgram.name}, at {commissionDisplay(topProgram.commission)}{" "}
              {commissionLabel(topProgram.commission)}
              {topProgram.verified
                ? " — verified by OpenAffiliate."
                : " — community-submitted and unconfirmed."}
            </p>
          </div>
        )}
        {netPrograms.length > priced.length && (
          <div>
            <h2 className="text-base font-semibold">Why do some rows say “Not published”?</h2>
            <p className="mt-1.5 text-sm text-muted-foreground max-w-prose">
              {netPrograms.length - priced.length} of {netPrograms.length}{" "}
              {netPrograms.length === 1 ? "program" : "programs"} here
              never published a commission figure. Rather than print a guess, the
              registry records that no figure exists — and the averages above are
              taken from the {priced.length} that did publish one.
            </p>
          </div>
        )}
      </div>

      {/* Slot 6 — what is actually confirmed. A page that does not say this is
          claiming more than it knows. */}
      <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={`h-1.5 w-1.5 rounded-full ${verifiedCount > 0 ? "bg-emerald-500" : "bg-amber-500"}`}
        />
        {verifiedCount} of {netPrograms.length} verified by OpenAffiliate
        {verifiedCount < netPrograms.length &&
          " — the rest are community-submitted and unconfirmed"}
      </div>

      <div className="mt-8 flex flex-col sm:flex-row gap-3">
        <Link href="/rankings" className="inline-flex items-center justify-center gap-2 rounded-lg border border-border/60 px-5 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
          View All Rankings <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <Link href="/categories" className="inline-flex items-center justify-center gap-2 rounded-lg border border-border/60 px-5 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
          Browse Categories
        </Link>
      </div>
    </div>
  );
}
