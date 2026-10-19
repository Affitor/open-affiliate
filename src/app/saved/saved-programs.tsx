"use client"

import Link from "next/link"
import { Bookmark } from "lucide-react"
import { allPrograms } from "@/lib/client-programs"
import removedPrograms from "@/lib/removed-programs.json"
import { ProgramRowList } from "@/components/program-card"
import { SaveButton, useSavedPrograms } from "@/components/save-button"

const bySlug = new Map(allPrograms.map((p) => [p.slug, p]))
const removed: Record<string, string> = removedPrograms
const statusLabels = { paused: "Paused · no longer taking affiliates", discontinued: "Discontinued · no longer taking affiliates", no_program: "No affiliate program" }

export function SavedPrograms() {
  const { items } = useSavedPrograms()
  return (
    <section className="mt-8" aria-label="Saved programs list">
      {items.length ? (
        <>
          <p className="mb-4 text-xs text-muted-foreground">{items.length} saved · newest saved first</p>
          <div className="space-y-3">
            {items.map(({ slug }) => {
              const program = bySlug.get(slug)
              if (program && !program.status) return <ProgramRowList key={slug} program={program} />
              const name = program?.name ?? removed[slug] ?? slug
              return (
                <div key={slug} className="flex items-center gap-4 rounded-xl border border-border bg-sunk/50 p-4 text-muted-foreground">
                  <Bookmark className="size-5 shrink-0" aria-hidden />
                  <div className="min-w-0 flex-1">
                    {program ? <Link href={`/programs/${slug}`} className="text-sm font-medium hover:underline">{name}</Link> : <p className="text-sm font-medium">{name}</p>}
                    <p className="mt-1 text-xs">{program?.status ? statusLabels[program.status] : "Removed from OpenAffiliate"}</p>
                  </div>
                  <SaveButton slug={slug} name={name} />
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-border px-6 py-14 text-center">
          <Bookmark className="mx-auto size-7 text-muted-foreground" aria-hidden />
          <h2 className="mt-4 text-lg font-semibold">Your shortlist starts here</h2>
          <p className="mt-2 text-sm text-muted-foreground">Use Save on a program to keep it here for later.</p>
          <Link href="/programs" prefetch={false} className="mt-5 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Browse programs</Link>
        </div>
      )}
    </section>
  )
}
