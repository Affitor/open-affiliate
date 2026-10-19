/**
 * Per-file rules build-registry applies, kept pure and free of imports so
 * scripts/no-program.test.ts can run them: importing build-registry itself
 * builds the registry.
 */

/** A no_program file sets none of these: a brand with no program has no terms. */
export const NO_PROGRAM_FORBIDDEN = ["cookie_days", "payout", "signup_url", "approval", "approval_time", "restrictions"]

/**
 * The only commission a no_program file may hold. The schema requires the
 * object, so it is a fixed placeholder: these keys with exactly these values,
 * plus `duration` and `conditions` only when null. Any other key or value is
 * refused, whatever its name: an extra `bonus: {amount: 500}` or a `type` of
 * "30% recurring" would otherwise ride along into the registry.
 */
export const NO_PROGRAM_COMMISSION = { type: "one-time", rate: "none", mode: "unknown", value: null, currency: "USD" } as const
const NULL_ONLY = new Set(["duration", "conditions"])

export function noProgramProblems(data: Record<string, unknown>): string[] {
  if (data.status !== "no_program") return []
  const problems = NO_PROGRAM_FORBIDDEN.filter((field) => data[field] != null).map((field) => `sets ${field}`)
  const commission = data.commission
  if (!commission || typeof commission !== "object" || Array.isArray(commission)) {
    return [...problems, "commission is not the placeholder object"]
  }
  const placeholder: Record<string, unknown> = NO_PROGRAM_COMMISSION
  for (const [key, value] of Object.entries(commission)) {
    if (key in placeholder) {
      if (value !== placeholder[key]) problems.push(`commission.${key} is ${JSON.stringify(value)}, not ${JSON.stringify(placeholder[key])}`)
    } else if (NULL_ONLY.has(key)) {
      if (value !== null) problems.push(`commission.${key} is set`)
    } else {
      problems.push(`commission.${key} is not a placeholder key`)
    }
  }
  for (const key of Object.keys(placeholder)) {
    if (!(key in commission)) problems.push(`commission.${key} is missing`)
  }
  return problems
}

/**
 * A file whose `kind` says affiliate (the schema's default when it is missing)
 * and whose commission can rank, while its own commission text names a
 * non-cash reward. The alternatives on no-program pages read kind: affiliate
 * plus a flat or percentage figure as "pays cash", so such a file would be
 * offered as a cash program.
 *
 * This is not a money parser and decides nothing about amounts. It is kept
 * narrow on purpose, because a hit fails the build:
 * - mode unknown never ranks, so the many import placeholders that read
 *   "usage-based referral credits" are not flagged;
 * - gift cards, vouchers and store credit name the reward wherever they
 *   appear;
 * - any other "credit", account credit included, counts only in `rate`, which
 *   names the reward itself. In conditions it often describes something else:
 *   a credit the referred customer gets (Fathom, Flowith, Ticket Tailor) or
 *   credit purchases the commission is paid on (Catalister, Picturesque).
 */
const NON_CASH_ANYWHERE = /\bgift ?cards?\b|\bvouchers?\b|\bstore credits?\b/i
const CREDIT_IN_RATE = /\bcredits?\b/i

export function nonCashAffiliate(data: Record<string, unknown>): boolean {
  if (data.kind != null && data.kind !== "affiliate") return false
  const commission = (data.commission ?? {}) as Record<string, unknown>
  if (commission.mode === "unknown") return false
  const rate = String(commission.rate ?? "")
  return NON_CASH_ANYWHERE.test(`${rate} ${commission.conditions ?? ""}`) || CREDIT_IN_RATE.test(rate)
}

/**
 * Alias → slug for every alias that can be a URL, across the whole registry.
 * build-registry writes `routes` into registry.json; next.config.ts turns each
 * one into a 308 from /programs/<alias> (and its .md) to the program, and the
 * REST API and MCP get_program answer it with the program
 * (src/lib/program-aliases.ts). This is the only place the rule lives:
 *
 * - An alias is compared lowercased and trimmed. One that is not slug-shaped
 *   ("eleven labs", "appqr.io") stays a search name and gets no route.
 * - A real slug always wins. Redirects run before pages, so an alias equal to
 *   another program's slug would hide that program's page; it goes to
 *   `shadowed` instead of `routes`.
 * - The same alias on two programs has no right answer: it goes to `clashes`,
 *   and build-registry fails.
 */
export function aliasRoutes(programs: readonly { slug: string; aliases?: unknown[] }[]): {
  routes: Record<string, string>
  shadowed: string[]
  clashes: string[]
} {
  const slugs = new Set(programs.map((p) => p.slug))
  const routes = new Map<string, string>()
  const shadowed: string[] = []
  const clashes: string[] = []
  for (const p of programs) {
    for (const raw of p.aliases ?? []) {
      const alias = String(raw).trim().toLowerCase()
      if (alias === p.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(alias)) continue
      if (slugs.has(alias)) {
        shadowed.push(`${p.slug}: alias "${alias}" is another program's slug, so that program keeps the URL`)
        continue
      }
      const owner = routes.get(alias)
      if (owner && owner !== p.slug) clashes.push(`alias "${alias}" is claimed by both ${owner} and ${p.slug}`)
      else routes.set(alias, p.slug)
    }
  }
  return {
    routes: Object.fromEntries([...routes].sort(([a], [b]) => a.localeCompare(b))),
    shadowed,
    clashes,
  }
}

/** The terms a `not_published` marker may name (schema: not_published.properties). */
export const NOT_PUBLISHED_FIELDS = ["commission.duration", "cookie_days", "payout.minimum", "payout.methods", "payout.frequency", "approval", "restrictions"]

/**
 * A `not_published` marker makes OAS score the term Not published, so a typo
 * must fail the build rather than leave the term unassessed: a map of known
 * term names to real YYYY-MM-DD dates, nothing else.
 */
export function notPublishedProblems(data: Record<string, unknown>): string[] {
  const marker = data.not_published
  if (marker === undefined) return []
  if (marker === null || typeof marker !== "object" || Array.isArray(marker)) return ["not_published must be a map of term to date"]
  const problems: string[] = []
  for (const [field, date] of Object.entries(marker)) {
    if (!NOT_PUBLISHED_FIELDS.includes(field)) problems.push(`not_published names an unknown term "${field}" (one of ${NOT_PUBLISHED_FIELDS.join(", ")})`)
    const ok = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date
    if (!ok) problems.push(`not_published.${field} must be a real date written YYYY-MM-DD, got ${JSON.stringify(date)}`)
  }
  return problems
}

/**
 * Words commission.rate and commission.duration have no business carrying: a
 * cookie, payout, payment method, approval or payout-schedule term. Those
 * have their own fields, which confirmedTerms withholds until a program is
 * verified; the rate and duration are shown verbatim on every surface (page,
 * API, MCP, .md, list chips), verified or not, so a term written there would
 * reach readers unchecked. Schedule words count only after "paid": "Team
 * monthly" is a plan name.
 */
const COMMISSION_TERM = /\b(cookies?|payouts?|paid out|pays? out|paid (?:within|after|every|on|via|daily|weekly|bi-?weekly|twice-monthly|monthly|quarterly)|payments? (?:via|by|through|method)|deposit\w*|withdraw\w*|approv\w*|minimum|threshold|net[- ]?\d+|paypal|wise|bank|wire|stripe|attribution|referral window)\b/i

/** commission.rate and commission.duration state the commission only (COMMISSION_TERM). */
export function commissionTermProblems(data: Record<string, unknown>): string[] {
  const commission = data.commission as Record<string, unknown> | null | undefined
  const problems: string[] = []
  for (const field of ["rate", "duration"]) {
    const value = commission?.[field]
    const hit = value == null ? null : COMMISSION_TERM.exec(String(value))
    if (hit) problems.push(`commission.${field} names "${hit[0]}", a term with its own field (cookie_days, payout, approval): ${JSON.stringify(value)}`)
  }
  return problems
}
