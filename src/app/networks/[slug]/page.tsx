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
} from "@/lib/programs";

export function generateStaticParams() {
  const networks = [...new Set(programs.map((p) => p.network ?? "In-house"))];
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

  const netPrograms = programs.filter((p) => (p.network ?? "In-house") === network);
  const title = `${network} Affiliate Programs — ${netPrograms.length} Programs | OpenAffiliate`;
  const description = `Browse ${netPrograms.length} affiliate programs on the ${network} network. Compare commissions, cookie duration, and payout terms.`;

  return {
    title,
    description,
    openGraph: { title, description, url: `https://openaffiliate.dev/networks/${slug}`, siteName: "OpenAffiliate" },
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

  const netPrograms = [...programs.filter((p) => (p.network ?? "In-house") === network)].sort(
    (a, b) => parseCommissionRate(b.commission.rate) - parseCommissionRate(a.commission.rate)
  );

  const rates = netPrograms.map((p) => parseCommissionRate(p.commission.rate));
  const avgRate = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
  const highestRate = rates.length > 0 ? Math.max(...rates) : 0;
  const avgCookie = netPrograms.length > 0 ? netPrograms.reduce((s, p) => s + p.cookieDays, 0) / netPrograms.length : 0;
  const categoryCount = new Set(netPrograms.map((p) => p.category)).size;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <TrackPageView type="network_view" slug={slug} metadata={{ network }} />
      <Link
        href="/networks"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All Networks
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight capitalize">{network}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {netPrograms.length} affiliate programs across {categoryCount} categories
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
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{highestRate}%</p>
        </div>
        <div className="rounded-xl border border-border/40 bg-card/30 p-4">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <DollarSign className="h-3 w-3" />
            <span className="text-[10px] uppercase tracking-wide">Average</span>
          </div>
          <p className="text-2xl font-bold">{avgRate.toFixed(0)}%</p>
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
                    <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{program.commission.rate}</span>
                  </td>
                  <td className="py-3 px-3 hidden sm:table-cell">
                    <Badge variant="secondary" className="text-[10px]">{program.commission.type}</Badge>
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
