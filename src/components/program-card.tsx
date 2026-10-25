import Link from "next/link"
import { Check } from "lucide-react"
import { ProgramLogo } from "@/components/program-logo"
import { SaveButton } from "@/components/save-button"
import { ImpressionTracker } from "@/components/impression-tracker"
import { OasScoreCell } from "@/components/oas-grade"
import { commissionChip, cookieChip, programOas, type Program } from "@/lib/client-programs"

/** Verified is the one emerald mark (OA-DESIGN §1.3): a check after the name, nothing louder. */
function VerifiedMark() {
  return <Check className="size-3.5 shrink-0 text-good" role="img" aria-label="Verified" />
}

/** Commission in mono inside a neutral outline chip, as on the mock's directory table. */
function CommissionChip({ program }: { program: Program }) {
  const text = commissionChip(program.commission)
  return (
    <span className="inline-flex h-[22px] max-w-full items-center truncate rounded-[5px] border border-line-strong px-1.5 font-mono text-xs" title={text}>
      <span className="truncate">{text}</span>
    </span>
  )
}

/** The program page's OAS and grade, or "—" (OAS in progress). */
function ScoreChip({ program }: { program: Program }) {
  return <OasScoreCell score={programOas(program)} />
}

export function ProgramCardGrid({ program }: { program: Program }) {
  return (
    <div className="group relative flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-sunk">
      <ImpressionTracker slug={program.slug} />
      <div className="flex items-start gap-3 pr-10">
        <ProgramLogo slug={program.slug} name={program.name} size={36} />
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-1.5 truncate text-sm font-semibold">
            <span className="truncate">{program.name}</span>
            {program.verified && <VerifiedMark />}
          </h3>
          <p className="mt-0.5 line-clamp-2 text-meta text-muted-foreground">{program.shortDescription}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
        <CommissionChip program={program} />
        <span>{cookieChip(program)}</span>
        <span>{program.category}</span>
        <span className="ml-auto"><ScoreChip program={program} /></span>
      </div>
      <Link href={`/programs/${program.slug}`} className="absolute inset-0 z-10 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><span className="sr-only">View {program.name} program</span></Link>
      <div className="absolute right-3 top-3 z-20"><SaveButton slug={program.slug} name={program.name} iconOnly /></div>
    </div>
  )
}

/**
 * One dense row: logo, name and one line, then category, commission, cookie and
 * score in mono columns from md up. Rows divide with a hairline; the list
 * around them draws the top line.
 */
export function ProgramRowList({ program }: { program: Program }) {
  return (
    <div className="group relative grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-3 py-2.5 transition-colors hover:bg-sunk md:grid-cols-[32px_minmax(0,1fr)_130px_minmax(0,190px)_136px_64px_auto]">
      <ImpressionTracker slug={program.slug} />
      <ProgramLogo slug={program.slug} name={program.name} size={32} className="shrink-0" />
      <div className="min-w-0">
        <h3 className="flex items-center gap-1.5 text-sm font-medium">
          <span className="truncate">{program.name}</span>
          {program.verified && <VerifiedMark />}
        </h3>
        <p className="truncate text-meta text-muted-foreground">{program.shortDescription}</p>
        {/* Phones: the commission under the line, the other columns drop. */}
        <div className="mt-1 md:hidden"><CommissionChip program={program} /></div>
      </div>
      <span className="hidden truncate text-meta text-muted-foreground md:block">{program.category}</span>
      <span className="hidden min-w-0 md:block"><CommissionChip program={program} /></span>
      <span className="hidden truncate font-mono text-xs text-muted-foreground md:block">{cookieChip(program)}</span>
      <span className="hidden md:block"><ScoreChip program={program} /></span>
      <Link href={`/programs/${program.slug}`} className="absolute inset-0 z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"><span className="sr-only">View {program.name} program</span></Link>
      <SaveButton slug={program.slug} name={program.name} iconOnly />
    </div>
  )
}
