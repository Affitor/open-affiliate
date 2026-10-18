/**
 * The one Affiliate Score order: score descending, a non-finite score (no
 * cookie_days, see affiliateScore) last, then slug, so ties rank the same on
 * the homepage, /rankings and its OG image. No imports: the client rankings
 * page uses it with its own score function.
 */
export function byScore<T extends { slug: string }>(score: (p: T) => number): (a: T, b: T) => number {
  return (a, b) => {
    const sa = score(a)
    const sb = score(b)
    const fa = Number.isFinite(sa) ? sa : -Infinity
    const fb = Number.isFinite(sb) ? sb : -Infinity
    if (fa !== fb) return fb - fa
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0
  }
}
