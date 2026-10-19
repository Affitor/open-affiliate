import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ProgramLogo } from "@/components/program-logo"
import { SameTeamTag } from "@/components/same-team-tag"
import { SaveButton } from "@/components/save-button"
import { ImpressionTracker } from "@/components/impression-tracker"
import { termsConfirmed, UNCONFIRMED } from "@/lib/confirmed-terms"
import { affiliateScore, commissionDisplay, commissionLabel, type Program } from "@/lib/client-programs"

export function ProgramCardGrid({ program }: { program: Program }) {
  return (
    <div
      className="group relative flex flex-col gap-3 rounded-xl border border-border/40 bg-card/30 p-5 transition-all hover:border-emerald-500/30 hover:bg-card/60 hover:shadow-[0_0_15px_rgba(34,197,94,0.06)]"
    >
      <ImpressionTracker slug={program.slug} />
      <div className="flex items-start gap-3">
        <ProgramLogo slug={program.slug} name={program.name} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold truncate">{program.name}</h3>
            <SameTeamTag slug={program.slug} inLink className="shrink-0" />
            {program.verified && (
              <Badge
                variant="outline"
                className="text-xs px-1.5 py-0 border-emerald-600/30 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 shrink-0"
              >
                verified
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {program.shortDescription}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge className="text-xs bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
          Score: {affiliateScore(program)}
        </Badge>
        <Badge variant="secondary" className="text-xs">
          {commissionDisplay(program.commission)}{" "}
          {commissionLabel(program.commission)}
        </Badge>
        <Badge variant="outline" className="text-xs">
          {!termsConfirmed(program) ? UNCONFIRMED : program.cookieDays != null ? `${program.cookieDays}d cookie` : "Cookie not published"}
        </Badge>
        <Badge variant="outline" className="text-xs">
          {program.category}
        </Badge>
      </div>
      <Link href={`/programs/${program.slug}`} className="absolute inset-0 z-10 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><span className="sr-only">View {program.name} program</span></Link>
      <div className="ml-auto"><SaveButton slug={program.slug} name={program.name} /></div>
    </div>
  );
}

export function ProgramRowList({ program }: { program: Program }) {
  return (
    <div
      className="glow-card group relative flex items-center gap-4 rounded-xl border border-border/40 bg-card/30 p-4 transition-all hover:border-border hover:bg-card/60"
    >
      <ImpressionTracker slug={program.slug} />
      <ProgramLogo
        slug={program.slug}
        name={program.name}
        size={44}
        className="shrink-0"
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold truncate">{program.name}</h3>
          <SameTeamTag slug={program.slug} inLink className="shrink-0" />
          {program.verified && (
            <Badge
              variant="outline"
              className="text-xs px-1.5 py-0 border-emerald-600/30 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 shrink-0"
            >
              verified
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {program.shortDescription}
        </p>
      </div>

      <div className="hidden sm:flex items-center gap-3 shrink-0">
        <Badge className="text-xs bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
          {affiliateScore(program)}
        </Badge>
        <Badge variant="secondary" className="text-xs">
          {commissionDisplay(program.commission)}{" "}
          {commissionLabel(program.commission)}
        </Badge>
        <Badge variant="outline" className="text-xs">
          {termsConfirmed(program) && program.cookieDays != null ? `${program.cookieDays}d` : "—"}
        </Badge>
        <span className="hidden lg:inline text-xs text-muted-foreground">
          {program.category}
        </span>
      </div>

      <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-foreground/60 transition-colors shrink-0 hidden sm:block" />
      <Link href={`/programs/${program.slug}`} className="absolute inset-0 z-10 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><span className="sr-only">View {program.name} program</span></Link>
      <SaveButton slug={program.slug} name={program.name} />
    </div>
  );
}
