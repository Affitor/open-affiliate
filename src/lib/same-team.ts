/**
 * Programs built by the team behind OpenAffiliate. Only Kyma API is in the
 * registry; Affitor itself has no listing (programs on network: affitor are
 * other brands on its marketplace, not ours). Every surface that recommends or
 * ranks programs reads this one set.
 */
export const SAME_TEAM_SLUGS: ReadonlySet<string> = new Set(["kyma-api"])

export const SAME_TEAM =
  "Kyma API and Affitor are built by the team behind OpenAffiliate."

export function isSameTeam(slug: string): boolean {
  return SAME_TEAM_SLUGS.has(slug)
}
