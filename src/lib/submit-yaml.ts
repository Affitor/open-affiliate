import { parseCommissionMode } from "./commission-mode"
import schema from "../../schema/program.schema.json"
import { commissionTermProblems, nonCashAffiliate } from "../../scripts/program-rules"

/**
 * The /submit form as plain strings, and the program YAML it opens on GitHub.
 * No React here, so scripts/submit-yaml.test.ts checks the output against the
 * schema and the auto-merge policy: the form must never write a file that our
 * own gate rejects (missing commission.mode or currency, a homepage signup_url,
 * a short description over 100 characters).
 *
 * A term the submitter leaves empty stays out of the file. The form never fills
 * a cookie window, minimum payout, schedule or approval the brand did not state.
 */
export interface SubmitValues {
  name: string
  slug: string
  url: string
  signupUrl: string
  category: string
  commissionType: string
  commissionRate: string
  currency: string
  cookieDays: string
  payoutMinimum: string
  payoutFrequency: string
  approval: string
  shortDescription: string
  description: string
  agentPrompt: string
  keywords: string
  tags: string
  submittedBy: string
}

export const SHORT_DESCRIPTION_MAX = 100

/** A slug from a name: lowercase letters, digits and single hyphens. */
export function slugOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

/** "Example.com/x" or "http://example.com/x" as "https://example.com/x": https, lowercase host (the schema's URL rule). */
export function httpsUrl(raw: string): string {
  const rest = raw.trim().replace(/^https?:\/\//i, "")
  if (!rest) return ""
  const cut = rest.search(/[/?#]/)
  const host = cut === -1 ? rest : rest.slice(0, cut)
  return `https://${host.toLowerCase()}${cut === -1 ? "" : rest.slice(cut)}`
}

/** The rate as typed; a bare number is read as a percentage, as the form used to label it. */
export function rateOf(raw: string): string {
  const r = raw.trim()
  return /^\d+(\.\d+)?$/.test(r) ? `${r}%` : r
}

const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean)
/** A JSON string is a valid YAML double-quoted scalar, so quotes and colons in a name cannot break the file. */
const q = (s: string) => JSON.stringify(s)
const whole = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : null)
const amount = (s: string) => (/^\d+(\.\d+)?$/.test(s.trim()) ? Number(s.trim()) : null)

/** The schema's URL rule (url and signup_url share it): https, lowercase domain, no port. */
const URL_PATTERN = new RegExp(schema.properties.url.pattern)

/**
 * Filled fields the registry gate would reject, by field, with what to change.
 * The same rules build-registry.ts applies to a new file: the schema's URL
 * pattern, a signup_url that is not the homepage or the website, a rate that
 * states only the commission (scripts/program-rules.ts), a cash commission.
 */
export function fieldErrors(v: SubmitValues): Partial<Record<keyof SubmitValues, string>> {
  const e: Partial<Record<keyof SubmitValues, string>> = {}
  const url = httpsUrl(v.url)
  const signup = httpsUrl(v.signupUrl)
  if (url && !URL_PATTERN.test(url)) e.url = "Use the plain domain, such as acme.com: no spaces, port or special characters."
  if (signup) {
    const path = (() => { try { return new URL(signup).pathname } catch { return "" } })()
    if (!URL_PATTERN.test(signup)) e.signupUrl = "Use a plain link such as acme.com/affiliates: no spaces, port or special characters."
    else if (signup.replace(/\/+$/, "") === url.replace(/\/+$/, "")) e.signupUrl = "Link the affiliate program page, not the website."
    else if (path === "" || path === "/") e.signupUrl = "Link the page that states the program terms (such as partners.acme.com/terms), not a bare domain."
  }
  const rate = rateOf(v.commissionRate)
  if (rate) {
    const commission = { type: v.commissionType, rate, mode: parseCommissionMode(rate).mode }
    if (commissionTermProblems({ verified: false, commission }).length) {
      e.commissionRate = "State only the commission here, such as 30% or $50. Put the cookie window, payout and approval in their own fields."
    } else if (nonCashAffiliate({ commission })) {
      e.commissionRate = "This form lists cash commissions. For gift card, voucher or credit rewards, suggest the program instead."
    }
  }
  if (v.currency.trim() && !/^[A-Za-z]{3}$/.test(v.currency.trim())) e.currency = "A three-letter currency code, such as USD or EUR."
  if (v.cookieDays.trim() && whole(v.cookieDays) == null) e.cookieDays = "A whole number of days, or leave it empty."
  if (v.payoutMinimum.trim() && amount(v.payoutMinimum) == null) e.payoutMinimum = "A number, such as 50, or leave it empty."
  return e
}

/** The empty required fields, by name; empty when the form can open a pull request (with no fieldErrors). */
export function missingFields(v: SubmitValues): string[] {
  const missing: string[] = []
  if (!v.name.trim()) missing.push("program name")
  if (!slugOf(v.slug)) missing.push("slug")
  if (!httpsUrl(v.url)) missing.push("website URL")
  if (!httpsUrl(v.signupUrl)) missing.push("affiliate program page")
  if (!v.commissionRate.trim()) missing.push("commission rate")
  if (!v.currency.trim()) missing.push("currency")
  if (!v.shortDescription.trim()) missing.push("short description")
  if (!v.description.trim()) missing.push("description")
  if (!v.agentPrompt.trim()) missing.push("agent prompt")
  return missing
}

export function submitYaml(v: SubmitValues, today: Date = new Date()): string {
  const rate = rateOf(v.commissionRate)
  const { mode, value } = parseCommissionMode(rate)
  const currency = v.currency.trim().toUpperCase()
  const cookie = whole(v.cookieDays)
  const minimum = amount(v.payoutMinimum)
  const keywords = list(v.keywords)
  const tags = list(v.tags)

  const out = [
    `name: ${q(v.name.trim())}`,
    `slug: ${slugOf(v.slug)}`,
    `url: ${httpsUrl(v.url)}`,
    `category: ${q(v.category)}`,
    `verified: false`,
    ``,
    `commission:`,
    `  type: ${v.commissionType}`,
    `  rate: ${q(rate)}`,
    `  mode: ${mode}`,
    `  value: ${value ?? "null"}`,
    `  currency: ${q(currency)}`,
  ]
  if (cookie != null) out.push(`cookie_days: ${cookie}`)
  if (minimum != null || v.payoutFrequency) {
    out.push(`payout:`)
    if (minimum != null) out.push(`  minimum: ${minimum}`, `  currency: ${q(currency)}`)
    if (v.payoutFrequency) out.push(`  frequency: ${v.payoutFrequency}`)
  }
  out.push(``, `signup_url: ${httpsUrl(v.signupUrl)}`)
  if (v.approval) out.push(`approval: ${v.approval}`)
  out.push(
    ``,
    `short_description: ${q(v.shortDescription.trim().slice(0, SHORT_DESCRIPTION_MAX))}`,
    `description: ${q(v.description.replace(/\r\n?/g, "\n").trim())}`,
    ``,
    `agents:`,
    `  prompt: ${q(v.agentPrompt.trim())}`,
  )
  if (keywords.length) out.push(`  keywords: [${keywords.map(q).join(", ")}]`)
  if (tags.length) out.push(``, `tags: [${tags.map(q).join(", ")}]`)
  if (v.submittedBy.trim()) out.push(`submitted_by: ${q(v.submittedBy.trim())}`)
  out.push(`created_at: "${today.toISOString().slice(0, 10)}"`)
  return out.join("\n") + "\n"
}

/**
 * GitHub's new-file page takes the file in the query string; past about 8 KB of
 * URL it answers 414 (11,718 characters did, PR #367 review). Above this limit
 * the page opens with the file name only and the form copies the YAML to paste.
 */
export const GITHUB_URL_MAX = 7000

export function githubNewFileUrl(v: SubmitValues, yaml: string): { url: string; withContent: boolean } {
  const base = `https://github.com/Affitor/open-affiliate/new/main?filename=${encodeURIComponent(`programs/${slugOf(v.slug)}.yaml`)}`
  const body = `## New program: ${v.name.trim()}\n\n- Website: ${httpsUrl(v.url)}\n- Program page (source of every term): ${httpsUrl(v.signupUrl)}\n- Commission: ${rateOf(v.commissionRate)} ${v.commissionType}\n- Category: ${v.category}\n\nEvery term in the file is stated on the program page above. Terms the page does not state are left out.`
  const full = `${base}&value=${encodeURIComponent(yaml)}&message=${encodeURIComponent(`Add ${v.name.trim()} to registry`)}&description=${encodeURIComponent(body)}`
  return full.length <= GITHUB_URL_MAX ? { url: full, withContent: true } : { url: base, withContent: false }
}
