import { confirmedTerms, livePrograms } from "./programs"
import { paysBy } from "./payout-filters"
import { isLifetime } from "./commission-order"
import { selectPrograms, type PostProgram, type PostSelection } from "./best-posts"
import type { Faq } from "./program-seo"
import { guide as howToStart } from "../content/guides/how-to-start-affiliate-marketing"
import { guide as whatIs } from "../content/guides/what-is-affiliate-marketing"
import { guide as withoutAWebsite } from "../content/guides/affiliate-marketing-without-a-website"
import { guide as forBloggers } from "../content/guides/affiliate-marketing-for-bloggers"
import { guide as makeMoney } from "../content/guides/make-money-with-affiliate-marketing"

/**
 * Guide posts on /blog/<slug>: how-to articles about affiliate marketing. The
 * copy in src/content/guides/ holds words only; every figure on the page (the
 * registry facts, each program's terms) is read from the registry at build,
 * and scripts/best-posts.test.ts fails on a digit or a spelled-out number in
 * copy. Guides carry no Affitor link.
 */
export interface GuideStep {
  title: string
  text: string
  /** A /programs filter or a /best list that does this step for the reader. */
  link?: { label: string; href: string }
}

export interface GuideSection {
  heading: string
  paragraphs: string[]
  steps?: GuideStep[]
}

/** A program's own rule, quoted from its YAML restrictions or conditions. */
export interface GuideRule {
  slug: string
  text: string
}

export interface GuidePost {
  slug: string
  /** YYYY-MM-DD the writer last checked the guide; programs are selected as of this day in tests. */
  checked: string
  title: (year: number) => string
  description: string
  /** The first lines: the answer to the query, before anything else. */
  answer: string
  sections: GuideSection[]
  /** Shown above the program blocks. */
  programsIntro: string
  programs: PostProgram[]
  rulesIntro: string
  rules: GuideRule[]
  /** What the law says about disclosure; the page cites DISCLOSURE_SOURCE after it. */
  disclosure: string
  faq: Faq[]
  /** BestList slugs. */
  related: string[]
}

export const GUIDES: GuidePost[] = [howToStart, whatIs, withoutAWebsite, forBloggers, makeMoney]

/**
 * The primary source for every guide's disclosure paragraph: the FTC's
 * Endorsement Guides as published in the CFR. Read 2026-10-20 (ftc.gov and
 * ecfr.gov were not readable from our checker that day); § 255.5(b)(11) is
 * the affiliate-link example. A constant, so the citation's numbers stay out
 * of copy.
 */
export const DISCLOSURE_SOURCE = {
  label: "FTC Endorsement Guides, 16 CFR § 255.5",
  href: "https://www.govinfo.gov/content/pkg/CFR-2025-title16-vol1/pdf/CFR-2025-title16-vol1-part255.pdf",
}

export function getGuide(slug: string): GuidePost | undefined {
  return GUIDES.find((g) => g.slug === slug)
}

export function guidePath(guide: GuidePost): string {
  return `/blog/${guide.slug}`
}

/** Which of a guide's programs the page shows on `asOf`, by the same rules as a post. */
export function guideSelection(guide: GuidePost, asOf: Date = new Date()): PostSelection {
  return selectPrograms(guide.programs, asOf)
}

export function guideTitle(guide: GuidePost, asOf: Date = new Date()): string {
  return guide.title(asOf.getUTCFullYear())
}

/** Every copy string on a guide, for the no-figures test. */
export function guideCopyStrings(g: GuidePost): string[] {
  return [
    g.description,
    g.answer,
    ...g.sections.flatMap((s) => [s.heading, ...s.paragraphs, ...(s.steps ?? []).flatMap((st) => [st.title, st.text, st.link?.label ?? ""])]),
    g.programsIntro,
    ...g.programs.flatMap((p) => [p.bestFor, p.why, p.notFor ?? ""]),
    g.rulesIntro,
    ...g.rules.map((r) => r.text),
    g.disclosure,
    ...g.faq.flatMap((f) => [f.q, f.a]),
  ].filter(Boolean)
}

export interface RegistryFacts {
  /** The newest terms check among verified programs (YYYY-MM-DD). */
  asOf: string
  verified: number
  byType: { type: string; count: number }[]
  lifetime: number
  cookie: { published: number; p25: number; median: number; p75: number } | null
  approval: { auto: number; manual: number; unknown: number }
  payout: { paypal: number; bank: number }
}

const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]

/**
 * How verified programs pay, from structured fields only (confirmed terms).
 * The guides' "What the registry shows" block and its .md twin read this.
 */
export function registryFacts(): RegistryFacts {
  const v = livePrograms.filter((p) => p.verified).map(confirmedTerms)
  const types = new Map<string, number>()
  for (const p of v) types.set(String(p.commission.type), (types.get(String(p.commission.type)) ?? 0) + 1)
  const cookies = v.flatMap((p) => (p.cookieDays != null ? [p.cookieDays] : [])).sort((a, b) => a - b)
  return {
    asOf: v.map((p) => (p.lastVerifiedAt ?? "").slice(0, 10)).sort().at(-1) ?? "",
    verified: v.length,
    byType: [...types].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    lifetime: v.filter(isLifetime).length,
    cookie: cookies.length ? { published: cookies.length, p25: quantile(cookies, 0.25), median: quantile(cookies, 0.5), p75: quantile(cookies, 0.75) } : null,
    approval: {
      auto: v.filter((p) => p.approval === "auto").length,
      manual: v.filter((p) => p.approval === "manual").length,
      unknown: v.filter((p) => p.approval !== "auto" && p.approval !== "manual").length,
    },
    payout: { paypal: v.filter((p) => paysBy(p.payoutMethods, "paypal")).length, bank: v.filter((p) => paysBy(p.payoutMethods, "bank")).length },
  }
}
