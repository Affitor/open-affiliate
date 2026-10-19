export const SAVED_KEY = "oa-saved"
export const SAVED_LIMIT = 500
export const SAVED_LIMIT_MESSAGE = "You can save up to 500 programs"

export interface SavedItem { slug: string; savedAt: number }
export interface SavedSnapshot { items: readonly SavedItem[] }
export const EMPTY_SAVED: SavedSnapshot = { items: [] }
interface StorageAccess { getItem(key: string): string | null; setItem(key: string, value: string): void }

/** Unknown input is rejected; known historical slugs remain removable tombstones. */
export function parseSaved(raw: string | null, known: (slug: string) => boolean): SavedSnapshot {
  try {
    const data: unknown = JSON.parse(raw ?? "null")
    if (!data || typeof data !== "object" || !("v" in data) || data.v !== 1 || !("items" in data) || !Array.isArray(data.items)) return EMPTY_SAVED
    const seen = new Set<string>()
    const items: SavedItem[] = []
    for (const item of data.items) {
      if (!item || typeof item !== "object" || typeof item.slug !== "string" || !known(item.slug) || typeof item.savedAt !== "number" || !Number.isFinite(item.savedAt) || item.savedAt < 0 || seen.has(item.slug)) continue
      seen.add(item.slug)
      items.push({ slug: item.slug, savedAt: item.savedAt })
    }
    items.sort((a, b) => b.savedAt - a.savedAt || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    return { items: items.slice(0, SAVED_LIMIT) }
  } catch { return EMPTY_SAVED }
}

export function createSavedStore(storage: () => StorageAccess, known: (slug: string) => boolean) {
  let cached: SavedSnapshot = EMPTY_SAVED
  let previousRaw: string | null | undefined
  const listeners = new Set<() => void>()
  function getSnapshot(): SavedSnapshot {
    try {
      const raw = storage().getItem(SAVED_KEY)
      if (raw !== previousRaw) {
        previousRaw = raw
        const next = parseSaved(raw, known)
        if (JSON.stringify(next) !== JSON.stringify(cached)) cached = next
      }
    } catch { /* Unavailable storage must not prevent rendering. */ }
    return cached
  }
  function notify() { for (const listener of listeners) listener() }
  return {
    getSnapshot,
    getServerSnapshot: () => EMPTY_SAVED,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    notify,
    toggle(slug: string): { saved?: boolean; error?: string } {
      if (!known(slug)) return { error: "This program is no longer available to save" }
      const current = getSnapshot()
      const saved = !current.items.some((item) => item.slug === slug)
      if (saved && current.items.length >= SAVED_LIMIT) return { error: SAVED_LIMIT_MESSAGE }
      const items = saved ? [{ slug, savedAt: Date.now() }, ...current.items] : current.items.filter((item) => item.slug !== slug)
      try {
        // Read access is checked as well: never overwrite a list we could not read.
        storage().getItem(SAVED_KEY)
        storage().setItem(SAVED_KEY, JSON.stringify({ v: 1, items }))
      } catch { return { error: "Saving is unavailable in this browser. Please allow browser storage and try again." } }
      previousRaw = undefined
      getSnapshot()
      notify()
      return { saved }
    },
  }
}
