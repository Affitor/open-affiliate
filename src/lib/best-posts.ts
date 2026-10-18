import { getBestList, listCommissionText, type BestList } from "./best-lists"
import { commissionUnknown, getProgram, isLive, type Program } from "./programs"
import { hasNoProgram } from "./no-program"
import { isSameTeam } from "./same-team"
import type { Faq } from "./program-seo"
import { post as aiAffiliatePrograms } from "../content/best/ai-affiliate-programs"
import { post as recurringAffiliatePrograms } from "../content/best/recurring-affiliate-programs"
import { post as saasAffiliatePrograms } from "../content/best/saas-affiliate-programs"
import { post as beginnerAffiliatePrograms } from "../content/best/affiliate-programs-for-beginners"

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
  /** The registry category whose /categories page links to this post as "Our picks". */
  category?: string
}

export const POSTS: BestPost[] = [aiAffiliatePrograms, recurringAffiliatePrograms, saasAffiliatePrograms, beginnerAffiliatePrograms]

/** Terms older than this at build time keep a program out of a post until it is re-checked. */
export const TERMS_MAX_AGE_DAYS = 90
/** Fewer shown programs than this and the page falls back to the plain list. */
export const MIN_POST_PROGRAMS = 5

export const DISCLOSURE =
  "How we make money: some links on this page are tracked so we can see which programs readers choose. Rankings are never paid for."
export { SAME_TEAM } from "./same-team"

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

/** Days since the terms check; a missing or future date counts as never checked. */
function termsAgeDays(p: Program, asOf: Date): number {
  const t = Date.parse(p.lastVerifiedAt ?? "")
  if (!Number.isFinite(t) || t > asOf.getTime()) return Infinity
  return Math.floor((asOf.getTime() - t) / 86_400_000)
}

const ready = new Map<string, { post: BestPost; selection: PostSelection } | null>()

/**
 * The post for a list slug when it has enough fresh verified programs as of
 * this build, else null (the list renders). Computed once per build, so the
 * dropped-program warnings print once.
 */
export function readyPost(slug: string): { post: BestPost; selection: PostSelection } | null {
  if (ready.has(slug)) return ready.get(slug)!
  const post = getPost(slug)
  const selection = post ? postSelection(post) : null
  for (const d of selection?.dropped ?? []) console.warn(`[best-post] ${slug}: ${d.slug} left out (${d.reason})`)
  const value = post && selection && postReady(selection) ? { post, selection } : null
  ready.set(slug, value)
  return value
}

/** The ready post a category page links to as "Our picks", if any. */
export function categoryPost(category: string): { post: BestPost; selection: PostSelection } | null {
  const post = POSTS.find((p) => p.category === category)
  return post ? readyPost(post.slug) : null
}

/** The post is published as a post only with enough programs; otherwise the list renders. */
export function postReady(selection: PostSelection): boolean {
  return selection.shown.length >= MIN_POST_PROGRAMS
}

export function postTitle(post: BestPost, selection: PostSelection, asOf: Date = new Date()): string {
  return post.title(selection.shown.length, asOf.getUTCFullYear())
}

/**
 * "25% recurring for 12 months", "$15 per new subscriber", "30%-40% tiered, for life":
 * the published figure plus its type and length, from structured fields.
 * - A rate that says more than its figure ("up to 30%", "25% then 15%") is shown
 *   as published and the type follows a comma.
 * - A rate that already says how it pays ("per", "recurring", "+", renewals, or a
 *   hybrid deal) gains no type word; one that already says "for …" gains no length.
 * - A recurring commission with no length on record points to the full terms
 *   ("length: see full terms"): a null duration means our record has none, not
 *   that the brand publishes none.
 */
export function earnText(p: Program): string {
  const c = p.commission
  const stored = String(c.rate ?? "").trim()
  const shown = listCommissionText(p)
  const norm = (x: string) => x.replace(/[\s,]/g, "").toLowerCase()
  const figure = stored && /[a-z]/i.test(stored) && norm(stored) !== norm(shown) ? stored : shown
  const wordy = /[a-z]/i.test(figure)
  // A "+" between two parts ("$30 + 30%") says how it pays; a trailing "$100+" does not.
  const saysHow = /\bper\b|one-time|recurring|renewal|\s\+\s/i.test(figure) || c.mode === "hybrid" || String(c.type) === "hybrid"
  const saysLength = /\bfor\b|lifetime|forever/i.test(figure)
  const length = saysLength
    ? null
    : c.duration
      ? c.duration === "lifetime" ? "for life" : `for ${c.duration}`
      : c.type === "recurring" && !saysHow
        ? "length: see full terms"
        : null
  const typed = saysHow ? figure : wordy ? `${figure}, ${c.type}` : `${figure} ${c.type}`
  if (!length) return typed
  // "20% recurring for life", but "25% recurring, length: see full terms" and "30%-40% tiered, for life".
  return c.type === "recurring" && !saysHow && length.startsWith("for ") ? `${typed} ${length}` : `${typed}, ${length}`
}

export function cookieText(p: Program): string {
  return p.cookieDays != null ? `${p.cookieDays} days` : "Not published"
}

export function payoutText(p: Program): string {
  const f = p.payout.frequency
  const parts = [
    f ? f[0].toUpperCase() + f.slice(1) : null,
    p.payout.minimum === 0 ? "no minimum" : p.payout.minimum != null && p.payout.currency === "USD" ? `$${p.payout.minimum} minimum` : null,
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
  return Boolean(post.affitor) || selection.shown.some(({ program }) => isSameTeam(program.slug))
}

/** The sentence under "How we chose" that states the freshness rule, from the constant. */
export const FRESHNESS_RULE = `Programs whose terms we have not re-checked in the last ${TERMS_MAX_AGE_DAYS} days are left out until we do.`

function andList(items: string[]): string {
  return items.length < 3 ? items.join(" and ") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`
}

/**
 * The data-driven FAQ: facts about the programs on this page only, from
 * structured fields, no ranking (a "pays the most" answer cannot compare a
 * single rate with a tiered or hybrid one). Then the post's own questions.
 * `esc` wraps contributor text (names, rates) for the markdown twin.
 */
export function postFaq(post: BestPost, selection: PostSelection, esc: (text: string) => string = (t) => t): Faq[] {
  const shown = selection.shown.map(({ program }) => program)
  const faq: Faq[] = []
  const recurring = shown.filter((p) => p.commission.type === "recurring")
  const others = shown.filter((p) => p.commission.type !== "recurring")
  if (recurring.length) {
    faq.push({
      q: "Which of these programs list a recurring commission?",
      a:
        `${andList(recurring.map((p) => `${esc(p.name)} (${esc(earnText(p))})`))} list their commission as recurring.` +
        (others.length ? ` The others list theirs as ${andList([...new Set(others.map((p) => String(p.commission.type)))])}; each block gives the details.` : ""),
    })
  }
  const withCookie = shown.filter((p) => p.cookieDays != null)
  if (withCookie.length) {
    faq.push({
      q: "How long do cookies last on these programs?",
      a: `${withCookie.length} of the ${shown.length} programs on this page publish a cookie window: ${andList(withCookie.map((p) => `${esc(p.name)} (${p.cookieDays} days)`))}. The others do not publish one.`,
    })
  }
  const range = checkedRange(selection)
  if (range) {
    faq.push({
      q: "When were these terms checked?",
      a: `Each program's terms were checked on its own affiliate page between ${range[0]} and ${range[1]}; every block shows its own date. ${FRESHNESS_RULE}`,
    })
  }
  return [...faq, ...(post.faq ?? [])]
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
