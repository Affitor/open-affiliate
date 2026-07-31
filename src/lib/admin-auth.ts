import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * The admin cookie carries an HMAC of ADMIN_SECRET, never the secret itself,
 * so a leaked cookie store does not hand over the secret.
 */
export function adminCookieValue(secret: string): string {
  return createHmac("sha256", secret).update("oa_admin_v1").digest("hex")
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  // timingSafeEqual throws on a length mismatch, and lengths are not secret.
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}
