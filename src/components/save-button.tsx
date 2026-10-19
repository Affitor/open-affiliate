"use client"

import { useState, useSyncExternalStore } from "react"
import { Bookmark, X } from "lucide-react"
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

export function SaveButton({ slug, name, iconOnly = false }: { slug: string; name: string; iconOnly?: boolean }) {
  const { items } = useSavedPrograms()
  const saved = items.some((item) => item.slug === slug)
  const [error, setError] = useState<string>()
  return (
    // Escape, or the note's close button, dismisses the 500-cap note.
    <div className="relative z-20 shrink-0" onKeyDown={(event) => { if (event.key === "Escape") setError(undefined) }}>
      <button
        type="button"
        aria-pressed={saved}
        // One name in both states; aria-pressed says which (a toggle's name does not change).
        aria-label={`Save ${name}`}
        className={`relative z-10 inline-flex items-center justify-center gap-1.5 rounded-lg border text-xs font-medium transition-colors ${iconOnly ? "size-9" : "min-h-11 px-3"} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${saved ? "border-foreground/30 bg-sunk text-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-line-strong"}`}
        onClick={() => {
          const result = store.toggle(slug)
          setError(result.error)
          if (result.saved !== undefined) {
            try { posthog.capture(result.saved ? "program_saved" : "program_unsaved", { slug }) } catch { /* Analytics never blocks saving. */ }
          }
        }}
      >
        <Bookmark className="size-3.5" fill={saved ? "currentColor" : "none"} aria-hidden />{!iconOnly && "Save"}
      </button>
      {error && (
        <div role="status" className="absolute right-0 top-full z-20 mt-2 flex w-64 items-start gap-2 rounded-lg border border-border bg-card p-3 text-xs text-foreground shadow-lg">
          <p className="flex-1">{error}</p>
          <button type="button" aria-label="Dismiss" onClick={() => setError(undefined)} className="-m-1 inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      )}
    </div>
  )
}
