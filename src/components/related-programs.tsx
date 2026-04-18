import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { ProgramLogo } from "@/components/program-logo"
import { programs, affiliateScore, commissionLabel, type Program } from "@/lib/programs"

function getRelatedPrograms(current: Program, limit = 4): Program[] {
  const candidates = programs.filter((p) => p.slug !== current.slug)

  const scored = candidates.map((p) => {
    let relevance = 0
    if (p.category === current.category) relevance += 3
    if (p.network && p.network === current.network) relevance += 2
    if (p.commission.type === current.commission.type) relevance += 1
    const tagOverlap = p.tags.filter((t) => current.tags.includes(t)).length
    relevance += Math.min(tagOverlap, 2)
    return { program: p, relevance, score: affiliateScore(p) }
  })

  scored.sort((a, b) => b.relevance - a.relevance || b.score - a.score)
  return scored.slice(0, limit).map((s) => s.program)
}

export function RelatedPrograms({ current }: { current: Program }) {
  const related = getRelatedPrograms(current)
  if (related.length === 0) return null

  return (
    <div>
      <h2 className="text-base font-semibold mb-4">Related Programs</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {related.map((p) => {
          const score = affiliateScore(p)
          return (
            <Link
              key={p.slug}
              href={`/programs/${p.slug}`}
              className="group flex items-center gap-3 rounded-lg border border-border/40 bg-card/30 p-3 transition-all hover:border-border hover:bg-card/60"
            >
              <ProgramLogo slug={p.slug} name={p.name} size={36} className="shrink-0 rounded-lg" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate group-hover:text-foreground">
                  {p.name}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">
                    {p.commission.rate} {commissionLabel(p.commission, true)}
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[10px] border-emerald-600/30 text-emerald-600 dark:text-emerald-400"
                  >
                    {score}
                  </Badge>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
