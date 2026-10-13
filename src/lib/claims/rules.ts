import { parse } from "tldts"

/**
 * Claim flow v1 is a pilot: these listings only. Widening it is a code change
 * reviewed like any other, not an environment toggle.
 */
export const PILOT_SLUGS: ReadonlySet<string> = new Set(["kyma-api", "citegraph", "landerlab"])

/**
 * Every secret the flow needs. If any is missing the API answers 503
 * "claims not enabled" and no page shows a claim button, so a deploy without
 * them builds and runs exactly as before.
 */
export const CLAIM_ENV = [
  "OA_RESEND_API_KEY",
  "CLAIM_SIGNING_SECRET",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "TURNSTILE_SECRET_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const

/** HMAC keys shorter than this are treated as missing, not as weak. */
const MIN_SIGNING_SECRET_LENGTH = 32

export function claimEnvReady(env: Record<string, string | undefined> = process.env): boolean {
  if (CLAIM_ENV.some((name) => !env[name])) return false
  return (env.CLAIM_SIGNING_SECRET ?? "").length >= MIN_SIGNING_SECRET_LENGTH
}

/**
 * Anyone can open a mailbox at these, so an address there proves nothing
 * about owning the provider's own listing.
 */
export const EMAIL_PROVIDERS: ReadonlySet<string> = new Set([
  "gmail.com", "googlemail.com",
  "outlook.com", "hotmail.com", "live.com",
  "yahoo.com",
  "icloud.com", "me.com",
  "proton.me", "protonmail.com",
  "aol.com",
  "gmx.com", "gmx.net",
  "yandex.com", "yandex.ru",
  "zoho.com",
  "mail.com",
])

/**
 * Registrable domain (eTLD+1) of a URL, from the Public Suffix List including
 * its private section: www.foo.co.uk gives foo.co.uk, not co.uk, and
 * alice.github.io stays alice.github.io.
 */
export function registrableDomain(url: string): string | null {
  const parsed = parse(url, { allowPrivateDomains: true })
  if (parsed.isIp || !parsed.domain) return null
  return parsed.domain.toLowerCase()
}

export type UnclaimableReason = "invalid-url" | "shared-host" | "email-provider"

/** Why a listing cannot be claimed online, or null when it can. */
export function unclaimableReason(url: string): UnclaimableReason | null {
  const parsed = parse(url, { allowPrivateDomains: true })
  if (parsed.isIp || !parsed.domain) return "invalid-url"
  // github.io, pages.dev, vercel.app, netlify.app…: the site's owner cannot
  // set DNS for it and nobody has a mailbox there.
  if (parsed.isPrivate) return "shared-host"
  if (EMAIL_PROVIDERS.has(parsed.domain.toLowerCase())) return "email-provider"
  return null
}

/**
 * ASCII only, one @, no spaces, commas, quotes, angle brackets or "%": the
 * address goes to the mail API as a recipient, and "a@evil.com,b@brand.com",
 * "Name <a@evil.com>" or the old "a%evil.com@brand.com" relay form must never
 * reach anything but one mailbox at the domain that was checked.
 */
const EMAIL_SHAPE = /^[A-Za-z0-9._+-]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/

export function normalizeEmail(raw: string): string | null {
  const email = raw.trim()
  if (email.length > 254 || !EMAIL_SHAPE.test(email)) return null
  const at = email.indexOf("@")
  return `${email.slice(0, at)}@${email.slice(at + 1).toLowerCase()}`
}

/**
 * The address's domain must BE the listing's registrable domain. A subdomain
 * is refused: many SaaS products hand customers addresses under their own
 * domain (support@acme.freshdesk.com), and accepting subdomains would let any
 * Freshdesk customer receive the code for Freshdesk's listing.
 */
export function emailMatchesDomain(email: string, domain: string): boolean {
  const normalized = normalizeEmail(email)
  if (!normalized) return false
  return normalized.slice(normalized.indexOf("@") + 1) === domain.toLowerCase()
}

/** True when this listing shows a claim button: pilot, claimable, and every secret set. */
export function claimsEnabledFor(
  program: { slug: string; url: string },
  env: Record<string, string | undefined> = process.env,
): boolean {
  return PILOT_SLUGS.has(program.slug) && unclaimableReason(program.url) === null && claimEnvReady(env)
}
