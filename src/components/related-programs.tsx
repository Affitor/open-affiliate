import Link from "next/link"
import { Check } from "lucide-react"
import { ProgramLogo } from "@/components/program-logo"
import { programs, affiliateScore, isLive, type Program } from "@/lib/programs"
import { hasNoProgram, keywordWords as words, noProgramAlternatives } from "@/lib/no-program"
import { commissionFigure, pageState } from "@/lib/program-page"

export function getRelatedPrograms(current: Program, limit = 4): Program[] {
  // A page that answers "no program" points only at verified programs that pay.
  if (hasNoProgram(current)) return noProgramAlternatives(current, limit)
  const candidates = programs.filter((p) => p.slug !== current.slug && isLive(p))
  const currentWords = words(current.agentKeywords ?? [])

  const scored = candidates.map((p) => {
    let relevance = 0
    if (p.category === current.category) relevance += 3
    if (p.network && p.network === current.network) relevance += 2
    if (p.commission.type === current.commission.type) relevance += 1
    const tagOverlap = p.tags.filter((t) => current.tags.includes(t)).length
    relevance += Math.min(tagOverlap, 2)
    // Agent keywords say what the product does ("keyword-research", "ai-seo"); tags are often generic.
    const kwOverlap = [...words([...(p.agentKeywords ?? []), ...p.tags])].filter((w) => currentWords.has(w)).length
    relevance += Math.min(kwOverlap, 3)
    return { program: p, relevance, score: affiliateScore(p) }
  })

  scored.sort((a, b) => b.relevance - a.relevance || b.score - a.score)
  return scored.slice(0, limit).map((s) => s.program)
}

/** "20% recurring", "$100 per sale", "Rate varies", or "Not published". */
function commissionCell(p: Program): string {
  const f = commissionFigure(p)
  if (!f) return "Not published"
  if (f.kind !== "number") return f.big
  return p.commission.type === "recurring" ? `${f.big} recurring` : `${f.big} ${f.rest}`
}

function lastsCell(p: Program): string {
  const d = p.commission.type === "recurring" ? p.commission.duration : null
  if (!d) return "—"
  return d.trim().toLowerCase() === "lifetime" ? "Lifetime" : d
}

function TermsChip({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-600/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-800 dark:text-emerald-400">
      <Check className="h-3 w-3" /> Verified
    </span>
  ) : (
    <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">Not verified</span>
  )
}

const GRID = "grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.7fr)_auto] items-center gap-3"

/**
 * The program next to similar ones. Each other program is one link to its
 * page: its terms stay inside that anchor, which is how the page checks tell
 * them from this program's own (scripts/unconfirmed-checks.ts).
 */
export function ProgramCompare({ current, title }: { current: Program; title: string }) {
  const related = getRelatedPrograms(current)
  if (related.length === 0) return null
  const own = !hasNoProgram(current)
  const ownState = pageState(current)

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight mb-4">{title}</h2>
      <div className="text-sm">
        <div className={`${GRID} pb-2 border-b border-border text-xs text-muted-foreground`}>
          <span>Program</span>
          <span>Commission</span>
          <span className="hidden sm:block">Lasts</span>
          <span>Terms</span>
        </div>
        {own && (
          <div className={`${GRID} py-3 border-b border-border bg-card shadow-[inset_3px_0_0_var(--foreground)] pl-3`}>
            <span className="flex items-center gap-2.5 font-medium min-w-0">
              <ProgramLogo slug={current.slug} name={current.name} size={28} className="shrink-0 rounded-md" />
              <span className="truncate">{current.name}</span>
            </span>
            <span>
              {commissionCell(current)}
              {ownState !== "verified" && commissionFigure(current) && <span className="text-xs text-muted-foreground"> (unconfirmed)</span>}
            </span>
            <span className="hidden sm:block">{lastsCell(current)}</span>
            <TermsChip verified={ownState === "verified"} />
          </div>
        )}
        {related.map((p) => (
          <Link key={p.slug} href={`/programs/${p.slug}`} className={`${GRID} py-3 border-b border-border hover:bg-muted/40 transition-colors`}>
            <span className="flex items-center gap-2.5 font-medium min-w-0">
              <ProgramLogo slug={p.slug} name={p.name} size={28} className="shrink-0 rounded-md" />
              <span className="truncate">{p.name}</span>
            </span>
            <span>{commissionCell(p)}</span>
            <span className="hidden sm:block">{lastsCell(p)}</span>
            <TermsChip verified={pageState(p) === "verified"} />
          </Link>
        ))}
      </div>
    </div>
  )
}
