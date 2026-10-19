/**
 * Hosts no script may request (schema/blocked-hosts.json): a listed host
 * blocks itself and every subdomain. Callers check every URL they are about
 * to request, every redirect hop included, before the request is made.
 */
import list from "../schema/blocked-hosts.json"

const HOSTS: Record<string, string> = list.hosts

/** The statuses fetch follows by itself; a hand-followed redirect follows exactly these. */
export const REDIRECTS = new Set([301, 302, 303, 307, 308])

/** Why `url` may not be requested, or null. A URL that does not parse is not ours to judge; fetch refuses it. */
export function blockedReason(url: string): string | null {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase().replace(/\.$/, "")
  } catch {
    return null
  }
  for (const [blocked, reason] of Object.entries(HOSTS)) {
    if (host === blocked || host.endsWith(`.${blocked}`)) return `${blocked}: ${reason}`
  }
  return null
}
