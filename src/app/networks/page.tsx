import type { Metadata } from "next";
import Link from "next/link";
import { TrackPageView } from "@/components/track-page-view";
import { Network } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProgramLogo } from "@/components/program-logo";
import { getNetworkStats, networkToSlug } from "@/lib/programs";

export const metadata: Metadata = {
  title: "Affiliate Networks — OpenAffiliate",
  description:
    "Compare affiliate networks by program count, average commission, and top programs. PartnerStack, Impact, ShareASale, and more.",
};

export default function NetworksPage() {
  const stats = getNetworkStats();

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <TrackPageView />
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Network className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          <h1 className="text-2xl font-bold tracking-tight">
            Affiliate Networks
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {stats.length} networks powering{" "}
          {stats.reduce((s, n) => s + n.programCount, 0)} affiliate programs
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((net) => (
          <Link
            key={net.network}
            href={`/networks/${networkToSlug(net.network)}`}
            className="group rounded-xl border border-border/40 bg-card/30 p-5 transition-all hover:border-emerald-500/30 hover:bg-card/60 hover:shadow-[0_0_15px_rgba(34,197,94,0.06)]"
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold capitalize group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                {net.network}
              </h2>
              <Badge variant="outline" className="text-[10px]">
                {net.programCount} programs
              </Badge>
            </div>

            <div className="flex items-center gap-4 mb-3">
              <div>
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">
                  Best
                </p>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                  {net.bestCommission}%
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">
                  Average
                </p>
                <p className="text-lg font-bold text-muted-foreground">
                  {net.avgCommission.toFixed(0)}%
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-3 border-t border-border/30">
              <ProgramLogo
                slug={net.topProgram.slug}
                name={net.topProgram.name}
                size={20}
              />
              <span className="text-xs text-muted-foreground truncate">
                Top: {net.topProgram.name} ({net.topProgram.commission.rate})
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
