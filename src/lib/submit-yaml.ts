import { parseCommissionMode } from "./commission-mode"

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

/** What the form still needs before it can open a pull request; empty when it is ready. */
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
    `  currency: ${currency}`,
  ]
  if (cookie != null) out.push(`cookie_days: ${cookie}`)
  if (minimum != null || v.payoutFrequency) {
    out.push(`payout:`)
    if (minimum != null) out.push(`  minimum: ${minimum}`, `  currency: ${currency}`)
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
