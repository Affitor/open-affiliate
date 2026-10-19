import type { Metadata } from "next"
import Link from "next/link"
import { Rss } from "lucide-react"
import { programs } from "@/lib/programs"
import { newPrograms, newProgramFeed } from "@/lib/new-programs"
import { ProgramRowList } from "@/components/program-card"
import { allPrograms } from "@/lib/client-programs"

export const dynamic = "force-static"
export const metadata: Metadata = {
  title: "New affiliate programs",
  description: "Affiliate programs added to OpenAffiliate in the last 30 days.",
  alternates: { canonical: "/new", types: { "application/rss+xml": "/new.xml" } },
}

export default function NewPage() {
  const now = new Date()
  const recent = newProgramFeed(programs, now)
  const total = newPrograms(programs, now).length
  const clientBySlug = new Map(allPrograms.map((p) => [p.slug, p]))
  // Only programs the client registry carries; a row never renders without its data.
  const rows = recent.flatMap((p) => {
    const program = clientBySlug.get(p.slug)
    return program ? [{ day: p.createdAt, program }] : []
  })
  const days = [...new Set(rows.map((r) => r.day))]
  return (
    <div className="oa-frame px-4 sm:px-12 py-10 sm:py-14">
      <p className="oa-label">Fresh in the registry</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-title sm:text-display font-semibold tracking-tight">New on OpenAffiliate</h1>
        <Link href="/new.xml" prefetch={false} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-sunk"><Rss className="size-4" aria-hidden />RSS feed</Link>
      </div>
      <p className="mt-3 max-w-xl text-sm text-muted-foreground">Programs added in the last 30 days, newest first. These dates mark when a listing joined OpenAffiliate.</p>
      <p className="mt-2 text-xs text-muted-foreground">{total} programs added in the last 30 days · Showing the newest {rows.length}</p>
      {days.length ? days.map((day) => (
        <section key={day} className="mt-9" aria-label={`Added ${day}`}>
          <h2 className="mb-3 border-b border-border pb-3 text-sm font-semibold"><time dateTime={day}>{new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}</time></h2>
          <div className="space-y-3">
            {rows.filter((r) => r.day === day).map(({ program }) => <ProgramRowList key={program.slug} program={program} />)}
          </div>
        </section>
      )) : <p className="mt-10 text-sm text-muted-foreground">No programs added in the last 30 days. Check back soon.</p>}
    </div>
  )
}
