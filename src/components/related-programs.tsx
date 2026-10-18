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

/**
 * The program next to similar ones, as a table (Program, Commission, Lasts,
 * Terms). Each other program's name links to its page. Commission, duration
 * and the verified flag only: no cookie window, payout or approval, so an
 * unverified page shows none of another program's terms either. data-compare
 * lets the no-program page check skip other programs' figures.
 */
export function ProgramCompare({ current, title }: { current: Program; title: string }) {
  const related = getRelatedPrograms(current)
  if (related.length === 0) return null
  const own = !hasNoProgram(current)
  const ownState = pageState(current)
  const cell = "py-3 pr-3 align-middle"

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight mb-4">{title}</h2>
      <table data-compare className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th scope="col" className="pb-2 pr-3 font-normal">Program</th>
            <th scope="col" className="pb-2 pr-3 font-normal">Commission</th>
            <th scope="col" className="pb-2 pr-3 font-normal hidden sm:table-cell">Lasts</th>
            <th scope="col" className="pb-2 font-normal">Terms</th>
          </tr>
        </thead>
        <tbody>
          {own && (
            <tr className="border-b border-border bg-card">
              <th scope="row" className={`${cell} pl-3 shadow-[inset_3px_0_0_var(--foreground)] text-left font-medium`}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <ProgramLogo slug={current.slug} name={current.name} size={28} className="shrink-0 rounded-md" />
                  <span className="truncate">{current.name}</span>
                </div>
              </th>
              <td className={cell}>
                {commissionCell(current)}
                {ownState !== "verified" && commissionFigure(current) && <span className="text-xs text-muted-foreground"> (unconfirmed)</span>}
              </td>
              <td className={`${cell} hidden sm:table-cell`}>{lastsCell(current)}</td>
              <td className="py-3"><TermsChip verified={ownState === "verified"} /></td>
            </tr>
          )}
          {related.map((p) => (
            <tr key={p.slug} className="border-b border-border hover:bg-muted/40 transition-colors">
              <th scope="row" className={`${cell} text-left font-medium`}>
                <Link href={`/programs/${p.slug}`} className="flex items-center gap-2.5 min-w-0 hover:underline underline-offset-4">
                  <ProgramLogo slug={p.slug} name={p.name} size={28} className="shrink-0 rounded-md" />
                  <span className="truncate">{p.name}</span>
                </Link>
              </th>
              <td className={cell}>{commissionCell(p)}</td>
              <td className={`${cell} hidden sm:table-cell`}>{lastsCell(p)}</td>
              <td className="py-3"><TermsChip verified={pageState(p) === "verified"} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
