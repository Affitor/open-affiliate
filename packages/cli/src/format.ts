/**
 * How the CLI words a term the API may leave out.
 *
 * The API leaves out a term the program does not publish, and for a program
 * that is not verified it leaves out the cookie window, payout and approval
 * until they are checked. Printing the missing value as-is gave "undefined
 * days" and "$undefined min".
 */
export interface Terms {
  verified?: boolean;
  cookieDays?: number | null;
  payout?: { minimum?: number | null; currency?: string | null; frequency?: string | null } | null;
  approval?: string | null;
  approvalTime?: string | null;
}

function missing(p: Terms): string {
  return p.verified ? "not published" : "not confirmed";
}

export function cookieText(p: Terms): string {
  return p.cookieDays != null ? `${p.cookieDays} days` : missing(p);
}

/** The search table's narrow column. */
export function cookieCell(p: Terms): string {
  return p.cookieDays != null ? `${p.cookieDays}d` : "—";
}

/** The minimum in the program's own currency: "$50" for USD or no currency, "50 EUR" otherwise (as on the site). */
function minimumAmount(minimum: number, currency: string | null | undefined): string {
  return !currency || currency === "USD" ? `$${minimum.toLocaleString("en-US")}` : `${minimum.toLocaleString("en-US")} ${currency}`;
}

export function payoutText(p: Terms): string {
  const parts = [p.payout?.minimum != null ? `${minimumAmount(p.payout.minimum, p.payout.currency)} min` : null, p.payout?.frequency];
  return parts.filter(Boolean).join(" / ") || missing(p);
}

export function approvalText(p: Terms): string {
  return p.approval ? `${p.approval}${p.approvalTime ? ` (${p.approvalTime})` : ""}` : missing(p);
}
