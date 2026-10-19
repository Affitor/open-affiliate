"use client"

import { useState, useSyncExternalStore } from "react"
import { Bookmark, BookmarkCheck } from "lucide-react"
import { allPrograms } from "@/lib/client-programs"
import removedPrograms from "@/lib/removed-programs.json"
import { createSavedStore, SAVED_KEY } from "@/lib/saved-programs"
import { posthog } from "@/lib/posthog"

const known = new Set([...allPrograms.map((p) => p.slug), ...Object.keys(removedPrograms)])
const store = createSavedStore(() => window.localStorage, (slug) => known.has(slug))
function onStorage(event: StorageEvent) {
  if (event.key === SAVED_KEY || event.key === null) store.notify()
}
let subscriptions = 0
function subscribe(listener: () => void) {
  const unsubscribe = store.subscribe(listener)
  if (subscriptions++ === 0) window.addEventListener("storage", onStorage)
  return () => { unsubscribe(); if (--subscriptions === 0) window.removeEventListener("storage", onStorage) }
}

export function useSavedPrograms() {
  return useSyncExternalStore(subscribe, store.getSnapshot, store.getServerSnapshot)
}

export function SaveButton({ slug, name }: { slug: string; name: string }) {
  const { items } = useSavedPrograms()
  const saved = items.some((item) => item.slug === slug)
  const [error, setError] = useState<string>()
  const Icon = saved ? BookmarkCheck : Bookmark
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-pressed={saved}
        aria-label={`${saved ? "Unsave" : "Save"} ${name}`}
        className={`relative z-10 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${saved ? "border-foreground/30 bg-sunk text-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-line-strong"}`}
        onClick={() => {
          const result = store.toggle(slug)
          setError(result.error)
          if (result.saved !== undefined) {
            try { posthog.capture(result.saved ? "program_saved" : "program_unsaved", { slug }) } catch { /* Analytics never blocks saving. */ }
          }
        }}
      >
        <Icon className="size-3.5" aria-hidden />{saved ? "Saved" : "Save"}
      </button>
      {error && <p role="status" className="absolute right-0 top-full z-20 mt-2 w-64 rounded-lg border border-border bg-card p-3 text-xs text-foreground shadow-lg">{error}</p>}
    </div>
  )
}
