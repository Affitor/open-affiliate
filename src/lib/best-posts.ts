import { bestListCopy, buildBestList, getBestList, listCommissionText, type BestList } from "./best-lists"
import { commissionUnknown, getProgram, isLive, type Program } from "./programs"
import { hasNoProgram } from "./no-program"
import type { Faq } from "./program-seo"
import { post as aiAffiliatePrograms } from "../content/best/ai-affiliate-programs"

/**
 * Editorial posts on /best/<slug>. A post is a BestList (its filter, page URL,
 * twin and sitemap entry) plus a copy file in src/content/best/. The copy holds
 * words only; every figure is read from the registry when the page builds.
 * A list with no post renders as the plain ranked list.
 */
export interface PostProgram {
  slug: string
  /** Short label under the program name, e.g. "Best for video creators". */
  bestFor: string
  why: string
  /** When the program is the wrong pick, said plainly. */
  notFor?: string
}

export interface BestPost {
  /** The BestList slug; the post lives at that list's /best/<slug> URL. */
  slug: string
  /** YYYY-MM-DD the writer last checked the selection; the test selects as of this day. */
  checked: string
  /** `n` is the number of program blocks shown, so the count in the title always matches. */
  title: (n: number, year: number) => string
  description: string
  intro: string
  /** Editorial order. */
  programs: PostProgram[]
  picks: { label: string; slug: string }[]
  howWeChose: string
  leftOut?: { name: string; reason: string }[]
  faq?: Faq[]
  /** The one sentence linking the Affitor marketplace (only the posts the plan marks). */
  affitor?: { before: string; anchor: string; after: string }
  /** BestList slugs. */
  related: string[]
}

export const POSTS: BestPost[] = [aiAffiliatePrograms]

/** Terms older than this at build time keep a program out of a post until it is re-checked. */
export const TERMS_MAX_AGE_DAYS = 90
/** Fewer shown programs than this and the page falls back to the plain list. */
export const MIN_POST_PROGRAMS = 5

export const DISCLOSURE =
  "How we make money: some links on this page are tracked so we can see which programs readers choose. Rankings are never paid for."
export const SAME_TEAM =
  "Kyma API and Affitor are built by the team behind OpenAffiliate."
/** Programs whose presence on a post adds the same-team line. */
const SAME_TEAM_SLUGS = new Set(["kyma-api"])

export function getPost(slug: string): BestPost | undefined {
  return POSTS.find((p) => p.slug === slug)
}

export function postList(post: BestPost): BestList | undefined {
  return getBestList(post.slug)
}

export interface PostSelection {
  shown: { program: Program; copy: PostProgram }[]
  /** Programs in the copy file the page leaves out, with why; printed as a build warning. */
  dropped: { slug: string; reason: string }[]
}

/** Which of a post's programs the page shows on `asOf`. Page, twin and tests all call this. */
export function postSelection(post: BestPost, asOf: Date = new Date()): PostSelection {
  const list = postList(post)
  const shown: PostSelection["shown"] = []
  const dropped: PostSelection["dropped"] = []
  for (const copy of post.programs) {
    const p = getProgram(copy.slug)
    const reason = !p
      ? "not in the registry"
      : !isLive(p) || hasNoProgram(p)
        ? `status ${p.status}`
        : !p.verified
          ? "not verified"
          : !list || !list.qualifies(p)
            ? "does not qualify for the list"
            : commissionUnknown(p.commission)
              ? "publishes no commission figure"
              : termsAgeDays(p, asOf) > TERMS_MAX_AGE_DAYS
                ? `terms last checked ${p.lastVerifiedAt ?? "never"}, over ${TERMS_MAX_AGE_DAYS} days`
                : null
    if (reason || !p) dropped.push({ slug: copy.slug, reason: reason ?? "not in the registry" })
    else shown.push({ program: p, copy })
  }
  return { shown, dropped }
}

function termsAgeDays(p: Program, asOf: Date): number {
  const t = Date.parse(p.lastVerifiedAt ?? "")
  return Number.isFinite(t) ? Math.floor((asOf.getTime() - t) / 86_400_000) : Infinity
}

/** The post is published as a post only with enough programs; otherwise the list renders. */
export function postReady(selection: PostSelection): boolean {
  return selection.shown.length >= MIN_POST_PROGRAMS
}

export function postTitle(post: BestPost, selection: PostSelection, asOf: Date = new Date()): string {
  return post.title(selection.shown.length, asOf.getUTCFullYear())
}

/**
 * "25% recurring for 12 months", "$15 one-time", "30%-40% tiered, for life":
 * the figure from structured fields plus its type and length. A hybrid rate is
 * already a sentence ("40% recurring + $1/signup …"), so it gains only the length.
 */
export function earnText(p: Program): string {
  const c = p.commission
  const length = c.duration ? (c.duration === "lifetime" ? "for life" : `for ${c.duration}`) : null
  const figure = listCommissionText(p)
  if (c.mode === "hybrid") return [figure, length].filter(Boolean).join(", ")
  if (c.type === "recurring") return [`${figure} recurring`, length].filter(Boolean).join(" ")
  return [`${figure} ${c.type}`, length].filter(Boolean).join(", ")
}

export function cookieText(p: Program): string {
  return p.cookieDays != null ? `${p.cookieDays} days` : "Not published"
}

export function payoutText(p: Program): string {
  const f = p.payout.frequency
  const parts = [
    f ? f[0].toUpperCase() + f.slice(1) : null,
    p.payout.minimum === 0 ? "no minimum" : p.payout.minimum != null && (p.payout.currency ?? "USD") === "USD" ? `$${p.payout.minimum} minimum` : null,
  ].filter(Boolean)
  if (!parts.length) return "Not published"
  const text = parts.join(", ")
  return text[0].toUpperCase() + text.slice(1)
}

/** "2026-10-12" from the verified date. */
export function checkedText(p: Program): string {
  return (p.lastVerifiedAt ?? "").slice(0, 10)
}

/** Oldest and newest terms check among the shown programs. */
export function checkedRange(selection: PostSelection): [string, string] | null {
  const dates = selection.shown.map(({ program }) => checkedText(program)).filter(Boolean).sort()
  return dates.length ? [dates[0], dates.at(-1)!] : null
}

export function sameTeam(post: BestPost, selection: PostSelection): boolean {
  return Boolean(post.affitor) || selection.shown.some(({ program }) => SAME_TEAM_SLUGS.has(program.slug))
}

/**
 * The data-driven FAQ over the programs shown: the list FAQ's commission and
 * cookie answers (bestListCopy over a list of exactly those programs), then the
 * post's own questions. The list FAQ's first answer (how many the registry
 * lists) and last (how the list is ranked) describe the list, not the post, so
 * they are not used; "How we chose" on the page says how the post picks.
 */
export function postFaq(post: BestPost, selection: PostSelection, esc: (text: string) => string = (t) => t): Faq[] {
  const list = postList(post)
  if (!list) return post.faq ?? []
  const shown = new Set(selection.shown.map(({ program }) => program.slug))
  const subset: BestList = { ...list, slug: `post/${post.slug}`, qualifies: (p) => shown.has(p.slug), directory: true }
  const fromData = bestListCopy(buildBestList(subset), esc).faq.slice(1, -1)
  return [...fromData, ...(post.faq ?? [])]
}

/** Every copy string of a post, for the no-digit test. */
export function copyStrings(post: BestPost): string[] {
  return [
    post.description,
    post.intro,
    post.howWeChose,
    ...post.programs.flatMap((p) => [p.bestFor, p.why, p.notFor ?? ""]),
    ...post.picks.map((p) => p.label),
    ...(post.leftOut ?? []).flatMap((l) => [l.name, l.reason]),
    ...(post.faq ?? []).flatMap((f) => [f.q, f.a]),
    ...(post.affitor ? [post.affitor.before, post.affitor.anchor, post.affitor.after] : []),
  ].filter(Boolean)
}
