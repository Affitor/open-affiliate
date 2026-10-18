import {
  affiliateScore,
  commissionDisplay,
  commissionLabel,
  confirmedTerms,
  isLive,
  programs,
  type Program,
} from "./programs"

/**
 * A brand with no affiliate program to join: none could be found on its own
 * site (`no_program`), or the brand closed it (`discontinued`). The page stays live because
 * people search "<brand> affiliate program", and it answers that question
 * instead of listing terms. The page, the .md twin, the REST API and MCP all
 * read these helpers, so every surface gives the same answer.
 */
export function hasNoProgram(p: { status?: string | null }): boolean {
  return p.status === "no_program" || p.status === "discontinued"
}

/** Banner heading, and the sentence after "No" in every answer. */
export function noProgramHeadline(p: Pick<Program, "name" | "status">): string {
  return p.status === "discontinued"
    ? `${p.name} does not have an affiliate program`
    : `${p.name} has no public affiliate program`
}

/**
 * The answer to "Does <brand> have an affiliate program?": "No (checked
 * 2026-10-12). OpenRouter has no public affiliate program." followed by the
 * dated source and quote from status_note.
 */
export function noProgramAnswer(p: Pick<Program, "name" | "status" | "statusNote" | "lastVerifiedAt">): string {
  const checked = p.lastVerifiedAt ? ` (checked ${p.lastVerifiedAt})` : ""
  const note = p.statusNote ? ` ${p.statusNote.trim().replace(/\.?$/, ".")}` : ""
  return `No${checked}. ${noProgramHeadline(p)}.${note}`
}

const GENERIC = new Set(["saas", "marketing", "tool", "tools", "software", "platform", "app"])

/** "keyword-research" and "ai-seo" become keyword, research, seo: matching on whole phrases missed most substitutes. */
export function keywordWords(phrases: string[]): Set<string> {
  return new Set(
    phrases.flatMap((x) => x.toLowerCase().split(/[^a-z0-9]+/)).filter((w) => w.length > 2 && !GENERIC.has(w))
  )
}

/**
 * Pays in cash, proven by structured fields only: an explicit `kind:
 * affiliate`, and a flat or percentage commission with a number. Rate text is
 * never parsed to decide what counts as money, so a reward the structure
 * cannot prove is cash (credits, gift cards, vouchers, tiers, "up to") is out.
 */
function paysCash(p: Program): boolean {
  return p.kind === "affiliate" && (p.commission.mode === "flat" || p.commission.mode === "percentage") && typeof p.commission.value === "number"
}

/**
 * "<Brand> affiliate program alternatives": verified, live programs in the same
 * category that pay cash, closest first by what the product does. Empty when
 * the category has none: a program from another category is not an
 * alternative to this one.
 */
export function noProgramAlternatives(current: Program, limit = 4): Program[] {
  const want = keywordWords([...(current.agentKeywords ?? []), ...current.tags])
  return programs
    .filter((p) => p.slug !== current.slug && p.category === current.category && isLive(p) && p.verified && paysCash(p))
    .map((p) => ({
      program: p,
      overlap: [...keywordWords([...(p.agentKeywords ?? []), ...p.tags])].filter((w) => want.has(w)).length,
      score: affiliateScore(p),
    }))
    .sort((a, b) => b.overlap - a.overlap || b.score - a.score)
    .slice(0, limit)
    .map((x) => x.program)
}

/**
 * Fields that say how a program pays or how to join it. The registry still
 * holds a commission placeholder for a brand with no program (the schema
 * requires one); none of these leave the API as stored.
 */
const TERM_FIELDS = [
  "commission",
  "cookieDays",
  "payout",
  "signupUrl",
  "approval",
  "approvalTime",
  "restrictions",
  "commissionDuration",
  "commissionConditions",
  "attribution",
  "trackingMethod",
  "payoutMethods",
  "marketingMaterials",
  "apiAvailable",
  "dedicatedManager",
  "dashboardUrl",
  "network",
  "programAge",
  "kind",
  "alsoOn",
] as const

/**
 * Clients already installed read `commission` and `payout` without a guard:
 * openaffiliate@0.0.2, npm's latest, prints the commission as rate + "% " +
 * type and the payout as "$" + payout.minimum + " min" in `info`, and `add`
 * reads commission.rate and .type. A response without either object crashes
 * them. So a brand with no program keeps both objects, holding nothing that
 * reads as a term: that CLI prints "No affiliate program% none" and
 * "$undefined min / undefined".
 */
const NO_COMMISSION = {
  type: "none",
  rate: "No affiliate program",
  mode: "unknown",
  value: null,
  currency: "USD",
  duration: null,
  conditions: null,
} as const

/**
 * What GET /api/programs/{slug} and MCP get_program return. Any other program
 * is returned through confirmedTerms(): unverified, its cookie window,
 * approval and payout methods are left out and payout is empty. A brand with
 * no program keeps the response's shape, with the neutral commission and an
 * empty payout in place of its terms, and gains the page's answer and its
 * alternatives; its check date is statusCheckedAt, never lastVerifiedAt.
 */
export function apiProgram(p: Program): Program | Record<string, unknown> {
  if (!hasNoProgram(p)) return confirmedTerms(p)
  const out: Record<string, unknown> = { ...p }
  for (const key of TERM_FIELDS) delete out[key]
  // Its date dates the status check ("No (checked <date>)"), not verified
  // terms, so it goes out under that name (#212).
  delete out.lastVerifiedAt
  return {
    ...out,
    ...(p.lastVerifiedAt ? { statusCheckedAt: p.lastVerifiedAt } : {}),
    commission: NO_COMMISSION,
    payout: {},
    answer: noProgramAnswer(p),
    alternatives: noProgramAlternatives(p).map((a) => ({
      slug: a.slug,
      name: a.name,
      commission: `${commissionDisplay(a.commission)} ${commissionLabel(a.commission)}`,
      url: `https://openaffiliate.dev/programs/${a.slug}`,
    })),
  }
}
