/**
 * Programs built by the team behind OpenAffiliate. Only Kyma API is in the
 * registry; Affitor itself has no listing (programs on network: affitor are
 * other brands on its marketplace, not ours). Every surface that recommends or
 * ranks programs reads this one set: suggestions leave these programs out,
 * listings keep them with SAME_TEAM_LABEL.
 */
export const SAME_TEAM_SLUGS: ReadonlySet<string> = new Set(["kyma-api"])

export const SAME_TEAM =
  "Kyma API and Affitor are built by the team behind OpenAffiliate."

/** Beside a link that sends a brand to Affitor, so the shared team is never hidden. */
export const AFFITOR_SAME_TEAM = "Affitor is built by the team behind OpenAffiliate."

/** The mark next to a same-team program in a listing, page and twin alike. */
export const SAME_TEAM_LABEL = "Same team as OpenAffiliate"

/** Where SAME_TEAM is stated in full. */
export const SAME_TEAM_HREF = "/about#same-team"

export function isSameTeam(slug: string): boolean {
  return SAME_TEAM_SLUGS.has(slug)
}
