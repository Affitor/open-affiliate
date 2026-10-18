import Link from "next/link"
import { SAME_TEAM, SAME_TEAM_HREF, SAME_TEAM_LABEL, isSameTeam } from "@/lib/same-team"

/**
 * The small mark a listing puts after a program our own team builds; nothing
 * for any other program. Inside a row that is already a link a second anchor
 * is invalid HTML, so there it is text carrying the full sentence as its
 * title; on its own it links to the sentence on /about.
 */
export function SameTeamTag({ slug, inLink = false, className = "" }: { slug: string; inLink?: boolean; className?: string }) {
  if (!isSameTeam(slug)) return null
  const cls = `text-xs font-normal text-muted-foreground whitespace-nowrap ${className}`
  return inLink ? (
    <span className={cls} title={SAME_TEAM}>
      {SAME_TEAM_LABEL}
    </span>
  ) : (
    <Link href={SAME_TEAM_HREF} className={`${cls} underline underline-offset-2 hover:text-foreground`}>
      {SAME_TEAM_LABEL}
    </Link>
  )
}
