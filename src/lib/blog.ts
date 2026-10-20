import { BEST_INDEX, BEST_LISTS, bestPath, buildBestList, type BestList } from "./best-lists"
import { postTitle, readyPost } from "./best-posts"
import { GUIDES, guidePath, guideSelection, guideTitle, type GuidePost } from "./guides"

/**
 * The /blog index: every guide (/blog/<slug>), every editorial post and every
 * ranked list, at their existing /best URLs. A list with a ready post (best-posts.ts) is a post; the
 * rest are ranked lists rebuilt from the registry. The page, its .md twin and
 * the category "Posts about" blocks all read this.
 */
export interface BlogEntry {
  kind: "post" | "list"
  href: string
  title: string
  /** YYYY-MM-DD: the post's own check date, or the latest verified date among a list's rows. */
  date: string | null
  /** The registry category a post or list is about, when it has one. */
  category: string | null
  programs: number
  verified: number
}

function entry(list: BestList): BlogEntry {
  const ready = readyPost(list.slug)
  const data = buildBestList(list)
  return ready
    ? {
        kind: "post",
        href: bestPath(list),
        title: postTitle(ready.post, ready.selection),
        date: ready.post.checked,
        category: ready.post.category ?? list.scope ?? null,
        programs: ready.selection.shown.length,
        verified: ready.selection.shown.length,
      }
    : {
        kind: "list",
        href: bestPath(list),
        title: list.h1,
        date: data.checked,
        category: list.scope ?? null,
        programs: data.total,
        verified: data.verified.length,
      }
}

function guideEntry(g: GuidePost): BlogEntry {
  const shown = guideSelection(g).shown.length
  return { kind: "post", href: guidePath(g), title: guideTitle(g), date: g.checked, category: null, programs: shown, verified: shown }
}

/** Newest first; ties keep the registry's own order (POSTS, then BEST_LISTS). */
function newestFirst(entries: BlogEntry[]): BlogEntry[] {
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (b.e.date ?? "").localeCompare(a.e.date ?? "") || a.i - b.i)
    .map(({ e }) => e)
}

export function blogEntries(): { posts: BlogEntry[]; lists: BlogEntry[] } {
  // The hub (/best) first among lists on equal dates: it is the parent of every other list.
  const all = [BEST_INDEX, ...BEST_LISTS.filter((l) => l !== BEST_INDEX)].map(entry)
  return {
    posts: newestFirst([...GUIDES.map(guideEntry), ...all.filter((e) => e.kind === "post")]),
    lists: newestFirst(all.filter((e) => e.kind === "list")),
  }
}

/** Posts first, then ranked lists, about one registry category. */
export function categoryEntries(category: string): BlogEntry[] {
  const { posts, lists } = blogEntries()
  return [...posts, ...lists].filter((e) => e.category === category)
}
