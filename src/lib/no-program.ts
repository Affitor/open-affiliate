import {
  affiliateScore,
  commissionDisplay,
  commissionLabel,
  commissionUnknown,
  isCreditReward,
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
 * "<Brand> affiliate program alternatives": verified, live programs that pay
 * in cash and publish a figure. Same category first, closest by what the
 * product does; programs from other categories only top the list up, and only
 * when they share a keyword. Credit-only referral rewards are not alternatives
 * to a program that pays nothing either.
 */
export function noProgramAlternatives(current: Program, limit = 4): Program[] {
  const want = keywordWords([...(current.agentKeywords ?? []), ...current.tags])
  return programs
    .filter(
      (p) =>
        p.slug !== current.slug &&
        isLive(p) &&
        p.verified &&
        !commissionUnknown(p.commission) &&
        !isCreditReward(p.commission)
    )
    .map((p) => ({
      program: p,
      sameCategory: p.category === current.category ? 1 : 0,
      overlap: [...keywordWords([...(p.agentKeywords ?? []), ...p.tags])].filter((w) => want.has(w)).length,
      score: affiliateScore(p),
    }))
    .filter((x) => x.sameCategory || x.overlap > 0)
    .sort((a, b) => b.sameCategory - a.sameCategory || b.overlap - a.overlap || b.score - a.score)
    .slice(0, limit)
    .map((x) => x.program)
}

/**
 * Fields that say how a program pays or how to join it. The schema requires a
 * commission object even for a brand with no program, so the registry still
 * holds one; an agent reading it from the API would cite it as a program.
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
] as const

/**
 * What GET /api/programs/{slug} and MCP get_program return. A live program is
 * returned as it is. A brand with no program loses every term field and gains
 * the page's answer and its alternatives.
 */
export function apiProgram(p: Program): Program | Record<string, unknown> {
  if (!hasNoProgram(p)) return p
  const out: Record<string, unknown> = { ...p }
  for (const key of TERM_FIELDS) delete out[key]
  return {
    ...out,
    answer: noProgramAnswer(p),
    alternatives: noProgramAlternatives(p).map((a) => ({
      slug: a.slug,
      name: a.name,
      commission: `${commissionDisplay(a.commission)} ${commissionLabel(a.commission)}`,
      url: `https://openaffiliate.dev/programs/${a.slug}`,
    })),
  }
}
