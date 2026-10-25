/**
 * The one public score, as every surface shows and orders it: OAS, or null
 * ("OAS in progress"). Free of JSON imports so client components (the
 * /programs list and cards) use the same rule as the program page without
 * loading the scores: build-registry ships each program's OasCell, and the
 * freshness check runs when the value is read, as oasValue does on the server.
 */
import { compareCommission, type CommissionOrdered } from "./commission-order"

/** A score expires this many days after its terms were verified. */
export const STALE_DAYS = 90

/** Terms verified STALE_DAYS or more before today, or never: from the start of lapseDate(), exactly. */
export function isStale(checkedAt: string | null | undefined, today: Date): boolean {
  return !checkedAt || today.getTime() - Date.parse(checkedAt) >= STALE_DAYS * 864e5
}

/** A score with every check read, before the read-time freshness check. */
export interface OasCell {
  score: number
  checkedAt: string
}

/** The OAS a surface shows, or null while scoring is in progress or the score is stale. */
export function shownOas(cell: OasCell | null | undefined, today: Date = new Date()): number | null {
  return cell && !isStale(cell.checkedAt, today) ? cell.score : null
}

/** What a score cell reads: "80 B-", or "—" with the "OAS in progress" title. */
export const OAS_NONE = "—"
export const OAS_NONE_TITLE = "OAS in progress"

/**
 * The order every list shares now that OAS is the one score: OAS high to low,
 * programs with no OAS after, then the commission order (commission-order.ts).
 */
export function compareByOas<T extends CommissionOrdered>(
  a: T,
  b: T,
  oas: (p: T) => number | null,
  rank: (p: T) => number,
): number {
  const [x, y] = [oas(a), oas(b)]
  return Number(x == null) - Number(y == null) || (y ?? 0) - (x ?? 0) || compareCommission(a, b, rank)
}
