/**
 * The one order "by commission", shared by every surface that has one: the
 * /best lists and category pages (inside their verified-first groups), network
 * pages, the REST API's commission_desc, and the browser's /programs and
 * /rankings sorts. Two surfaces that order the same programs therefore agree
 * on every pair, ties included.
 *
 * Kept free of imports so client components can use it without pulling the
 * registry into their bundle. The rank comes from the caller: commissionRank
 * on the server, the commissionRank build-registry ships to the browser, or a
 * list's own rank.
 */
export interface CommissionOrdered {
  slug: string
  name: string
  commission: { type: string; mode: string; value: number | null; duration?: string | null }
}

/** True when there is no figure to compare on. */
export function commissionUnknown(c: { mode: string; value: number | null }): boolean {
  return c.mode === "unknown" || c.value === null
}

export function isLifetime(p: { commission: { type: string; duration?: string | null } }): boolean {
  return p.commission.type === "recurring" && /lifetime/i.test(p.commission.duration ?? "")
}

/**
 * Larger rank first (dir -1) or smaller first (dir 1). Whatever the direction,
 * programs the rank cannot place (0 or less: tiered, referral, unpublished…)
 * come last, those that publish no figure after those that do. Ties go to
 * lifetime recurring deals, then the name, then the slug, so no order depends
 * on how the input happened to be sorted.
 */
export function compareCommission<T extends CommissionOrdered>(a: T, b: T, rank: (p: T) => number, dir = -1): number {
  const [ra, rb] = [rank(a), rank(b)]
  return (
    Number(ra <= 0) - Number(rb <= 0) ||
    (ra - rb) * dir ||
    Number(commissionUnknown(a.commission)) - Number(commissionUnknown(b.commission)) ||
    Number(isLifetime(b)) - Number(isLifetime(a)) ||
    a.name.localeCompare(b.name) ||
    (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)
  )
}
