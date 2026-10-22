import { BEST_LISTS, bestPath, getBestList, updatedText } from "./best-lists"
import { GUIDES, guidePath, guideTitle, type GuidePost } from "./guides"
import { FRESHNESS_RULE, NOT_STATED, checkedRange, earnText, payoutText, type BestPost, type PostSelection } from "./best-posts"

import { IN_HOUSE, isLive, livePrograms, networkName, programs, type Program } from "./programs"
import { networkKind } from "./network-meta"
import { hasNoProgram } from "./no-program"
import type { Faq } from "./program-seo"
import { termNotes } from "./term-notes"
import { minimumAmount } from "./rankings-terms"

/**
 * The data behind the standard "best X" layout (components/best-post-standard.tsx).
 * Every figure and every list here comes from structured registry fields; the
 * post's copy file holds words only.
 */

/** One date format on a standard post: "Oct 13, 2026". */
export const dateText = (iso: string) => updatedText(iso)

const TYPE_LABEL: Record<string, string> = {
  "one-time": "One-time",
  recurring: "Recurring",
  tiered: "Tiered",
  hybrid: "Hybrid",
}

/**
 * How the FAQ names a term the program has no value for, so a blank never
 * claims more than the data:
 * - "Stated two ways": the field is in the YAML's `conflicts`;
 * - "Not stated by the brand": the verifier recorded it as unpublished
 *   (`not_published`, or a "not published" comment);
 * - "Not recorded": the registry simply has no value.
 * The program details omit such a term instead, except one stated two ways.
 */
export const STATED_TWO_WAYS = "Stated two ways"
export const NOT_RECORDED = "Not recorded"
export { NOT_STATED }

/** The empty label for schema fields ("cookie_days", "approval", "payout.methods"). */
export function emptyLabel(p: Program, ...fields: string[]): string {
  const notes = termNotes(p.slug)
  if (fields.some((f) => notes.conflicts.has(f))) return STATED_TWO_WAYS
  if (fields.every((f) => notes.notPublished.has(f))) return NOT_STATED
  return NOT_RECORDED
}

/** "up to one week" from "Up to one week": the review time as it reads mid-sentence. */
export function approvalTime(p: Program): string | null {
  const t = p.approvalTime?.trim()
  return t ? t[0].toLowerCase() + t.slice(1) : null
}

/** How a payout method reads in a sentence: "PayPal or bank transfer". */
const METHOD_TEXT: Record<string, string> = {
  paypal: "PayPal",
  bank: "bank transfer",
  wise: "Wise",
  stripe: "Stripe",
  crypto: "crypto",
  check: "check",
}

/** "PayPal or bank transfer" from payout methods; null when none is recorded. */
export function methodsText(p: Program): string | null {
  const m = (p.payoutMethods ?? p.payout.methods ?? []).map((x) => METHOD_TEXT[x.toLowerCase()] ?? x)
  if (!m.length) return null
  const text = m.length < 3 ? m.join(" or ") : `${m.slice(0, -1).join(", ")} or ${m.at(-1)}`
  return text[0].toUpperCase() + text.slice(1)
}

/**
 * A network that pays partners itself (kind "marketplace": PartnerStack, CJ,
 * Impact…), so its payout terms apply. Tracking software (Rewardful,
 * FirstPromoter: kind "software") leaves payouts to the brand, so it never
 * stands in for the brand's own terms.
 */
function thirdPartyNetwork(p: Program): string | null {
  return p.network && p.network !== IN_HOUSE && networkKind(p.network) === "marketplace" ? networkName(p.network) : null
}

/**
 * The commission as the standard layout shows it: earnText, with its pointer
 * to full terms (which this layout does not link) said as what the data
 * holds: "length not published" when the brand does not publish one,
 * "length not recorded" otherwise.
 */
export function earnShown(p: Program): string {
  const length = termNotes(p.slug).notPublished.has("commission.duration") ? "length not published" : "length not recorded"
  return earnText(p).replace("length: see full terms", length)
}

/** A restriction that forbids something: "No …", "Do not …", "Never …". */
const forbids = (r: string) => /^(no|do not|don't|never|not)\b/i.test(r.trim())
/**
 * A restriction that asks something of the partner (conservative: only these openings): "Use …",
 * "Affiliates must …", and disclosure rules ("Always disclose …", "Affiliate program, not a paid
 * sponsorship"), which are conditions of taking part, not drawbacks.
 */
export const requires = (r: string) =>
  /^(use|have|must|be|apply|promote|share|always|disclose|you must|you should|affiliates must|affiliates should|applicants must|applicants need|website must|your (site|website) must|affiliate program, not)\b/i.test(r.trim())
/** Restrictions read as fragments in lists, without a final period. */
const fragment = (t: string) => t.trim().replace(/\.$/, "")

/** The brand's requirements of partners, as one detail ("Use at least one website …; Promote transparently …"), or null. */
export function requirementsText(p: Program): string | null {
  const reqs = (p.restrictions ?? []).filter((r) => !forbids(r) && requires(r)).map(fragment)
  return reqs.length ? reqs.join("; ") : null
}

const twoWays = (p: Program, ...fields: string[]) => fields.some((f) => termNotes(p.slug).conflicts.has(f))

/**
 * The values the brand states for a conflicting field, as the verifier
 * recorded them in `conflicts[].values` (never read from the quote text):
 * minimums are numbers in the program's payout currency ("$40 or $80",
 * "40 or 80 CHF"), other fields short phrases ("30 days or 60 days").
 * Null when the field has no recorded values.
 */
export function twoValueText(values: (string | number)[] | undefined, field: string, currency: string | null | undefined): string | null {
  if (!values || values.length < 2) return null
  const shown = values.map((v) => (typeof v === "number" && field === "payout.minimum" ? minimumAmount(v, currency) : String(v)))
  return shown.length < 3 ? shown.join(" or ") : `${shown.slice(0, -1).join(", ")} or ${shown.at(-1)}`
}

const bothValues = (p: Program, field: string) => twoValueText(termNotes(p.slug).conflictValues.get(field), field, p.payout.currency)

/**
 * The payout terms the brand states two ways, from the fields actually in
 * conflict: "two minimums ($40 or $80) and two schedules"; null when none.
 */
function payoutTwoWays(p: Program): string | null {
  const parts = [
    twoWays(p, "payout.minimum") ? `two minimums${bothValues(p, "payout.minimum") ? ` (${bothValues(p, "payout.minimum")})` : ""}` : null,
    twoWays(p, "payout.frequency") ? "two schedules" : null,
  ].filter(Boolean)
  return parts.length ? `The brand gives ${parts.join(" and ")}` : null
}

/** When and how much: "Net 60, $100 minimum", the terms stated two ways, "On CJ Affiliate's terms", or null. */
function gettingPaid(p: Program): string | null {
  const timing = payoutText(p, "")
  const two = payoutTwoWays(p)
  // A conflict still shows next to the terms that are on record: "$200 minimum; the brand gives two schedules".
  if (timing) return two ? `${timing}; ${two[0].toLowerCase()}${two.slice(1)}` : timing
  if (two) return two
  const net = thirdPartyNetwork(p)
  return net ? `On ${net}'s terms` : null
}

/** "45 days", both recorded values when the brand states two ("30 days or 60 days; the brand gives both"), or null. */
function cookieDetail(p: Program): string | null {
  if (p.cookieDays != null) return `${p.cookieDays} days`
  if (!twoWays(p, "cookie_days")) return null
  const both = bothValues(p, "cookie_days")
  return both ? `${both}; the brand gives both` : "The brand gives two different windows"
}

/**
 * "Affiliate program details" for one program, from the registry. A term the
 * program has no value for is left out; one the brand states two ways says so.
 */
export function programDetails(p: Program): [string, string][] {
  const rows: [string, string | null][] = [
    ["Commission rate", earnShown(p)],
    ["Getting paid", gettingPaid(p)],
    ["Payment method", methodsText(p) ?? (twoWays(p, "payout.methods") ? "The brand names two different methods" : null)],
    ["Cookie duration", cookieDetail(p)],
    ["Approval", p.approval === "auto" ? "Automatic" : p.approval === "manual" ? `Manual${approvalTime(p) ? `, ${approvalTime(p)}` : ""}` : null],
    ["Requirements", requirementsText(p)],
  ]
  return rows.filter((r): r is [string, string] => Boolean(r[1]))
}

/** The comparison table's cells: Commission, Cookie, Payout ("—" when there is none on record). */
export function tableRow(p: Program): { commission: string; cookie: string; payout: string } {
  return {
    commission: earnShown(p),
    cookie: p.cookieDays != null ? `${p.cookieDays} days` : twoWays(p, "cookie_days") ? (bothValues(p, "cookie_days") ?? "Two values") : "—",
    payout: [gettingPaid(p), methodsText(p)].filter(Boolean).join(" · ") || "—",
  }
}

/** Median cookie window among the registry's verified programs (null when none publish one). */
function medianCookie(): number | null {
  const c = livePrograms.filter((p) => p.verified && p.cookieDays != null).map((p) => p.cookieDays!).sort((a, b) => a - b)
  return c.length ? c[Math.floor((c.length - 1) / 2)] : null
}
const MEDIAN_COOKIE = medianCookie()

/** At most this many pros and cons per program: the short lists, not every rule. */
export const PROS_CONS_MAX = 3

/**
 * Pros and cons for one program, from structured fields only. Cons are the
 * brand's prohibitions first, then the limits we compute (one-time, tiered),
 * then its other limits (eligibility, exclusions). Requirements of partners
 * are not cons: they go to the "Requirements" detail.
 */
export function prosCons(p: Program): { pros: string[]; cons: string[] } {
  const pros: string[] = []
  const cons: string[] = []
  if (p.commission.duration === "lifetime") pros.push("Pays a recurring share for the customer's lifetime")
  if (p.approval === "auto") pros.push("Approves applications automatically")
  if (p.payout.minimum === 0) pros.push("No payout minimum")
  if (p.payout.frequency === "weekly") pros.push("Pays weekly")
  if (p.cookieDays != null && MEDIAN_COOKIE != null && p.cookieDays > MEDIAN_COOKIE)
    pros.push(`Cookie of ${p.cookieDays} days, longer than the registry median of ${MEDIAN_COOKIE}`)
  if (p.marketingMaterials) pros.push("Banners and other marketing assets provided")
  if (p.dedicatedManager) pros.push("Dedicated affiliate manager")

  const restrictions = p.restrictions ?? []
  cons.push(...restrictions.filter(forbids))
  if (p.commission.type === "one-time") cons.push("Pays once per referral, with no recurring share")
  if (p.commission.type === "tiered") cons.push("The top figure needs volume or a higher tier")
  cons.push(...restrictions.filter((r) => !forbids(r) && !requires(r)))
  return { pros: pros.slice(0, PROS_CONS_MAX), cons: cons.slice(0, PROS_CONS_MAX).map(fragment) }
}

/** The programs a standard post is about: the ones it shows plus every program its `considered` rule picks. */
function aboutPrograms(post: BestPost, selection: PostSelection): Program[] {
  const shown = new Set(selection.shown.map((s) => s.program.slug))
  return programs.filter((p) => shown.has(p.slug) || Boolean(post.considered?.(p)))
}

export interface TypeSplit {
  rows: { type: string; label: string; count: number }[]
  total: number
}

/** Commission type of every live, verified program the post is about, for the FAQ's registry-wide counts. */
export function typeSplit(post: BestPost, selection: PostSelection): TypeSplit {
  const v = aboutPrograms(post, selection).filter((p) => isLive(p) && !hasNoProgram(p) && p.verified)
  const counts = new Map<string, number>()
  for (const p of v) counts.set(String(p.commission.type), (counts.get(String(p.commission.type)) ?? 0) + 1)
  const rows = [...counts].map(([type, count]) => ({ type, label: TYPE_LABEL[type] ?? type, count })).sort((a, b) => b.count - a.count)
  return { rows, total: v.length }
}

/**
 * The inline link in a "why" paragraph: ["Its ", "affiliate program", " pays …"].
 * The words in {braces} become the link to the brand's affiliate page.
 */
export function splitLink(text: string): [string, string, string] | null {
  const m = text.match(/^([^{}]*)\{([^{}]+)\}([^{}]*)$/)
  return m ? [m[1], m[2], m[3]] : null
}


/** "Our picks: Kinsta for WordPress agencies, …", from the picks the page shows. */
export function picksSentence(post: BestPost, selection: PostSelection): string | null {
  const bySlug = new Map(selection.shown.map((s) => [s.program.slug, s.program]))
  const parts = post.picks.flatMap((pick) => {
    const p = bySlug.get(pick.slug)
    return p ? [`${p.name} ${pick.label.replace(/^best\s+/i, "")}`] : []
  })
  if (!parts.length) return null
  const list = parts.length < 3 ? parts.join(" and ") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`
  return `Our picks: ${list}.`
}

function andList(items: string[]): string {
  return items.length < 3 ? items.join(" and ") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`
}

/**
 * The standard FAQ: questions readers ask about these programs, each answer
 * computed from the shown programs' structured fields, then the post's own.
 */
export function standardFaq(post: BestPost, selection: PostSelection, split: TypeSplit, esc: (t: string) => string = (t) => t): Faq[] {
  const shown = selection.shown.map((s) => s.program)
  const faq: Faq[] = []
  const name = (p: Program) => esc(p.name)
  // "web hosting affiliate programs": the list's query names the niche in every question.
  const niche = (getBestList(post.slug)?.query ?? "affiliate programs").toLowerCase()

  const recurring = shown.filter((p) => p.commission.type === "recurring" || Boolean(p.commission.duration))
  const rest = shown.filter((p) => !recurring.includes(p))
  const restTypes = [...new Set(rest.map((p) => (TYPE_LABEL[String(p.commission.type)] ?? String(p.commission.type)).toLowerCase()))]
  const recurringAll = split.rows.find((r) => r.type === "recurring")?.count ?? 0
  faq.push({
    q: `Do ${niche} pay recurring commissions?`,
    a:
      (recurring.length
        ? `On this page, ${andList(recurring.map((p) => `${name(p)} (${esc(earnShown(p))})`))} ${recurring.length === 1 ? "pays" : "pay"} a recurring share. `
        : "None of the programs on this page pays a recurring share. ") +
      (rest.length ? `${rest.length === 1 ? `The other program lists its` : `The other ${rest.length} list their`} commission as ${andList(restTypes)}, with no recurring length on record; each section gives the details. ` : "") +
      `Across the ${split.total} verified programs this post draws from, ${recurringAll} list a recurring commission.`,
  })

  // An empty term is said the way the data backs it: unpublished, stated two ways, or not on record.
  const blanks = (ps: Program[], label: (p: Program) => string, says: Record<string, [string, string]>) =>
    Object.entries(says)
      .map(([l, [one, many]]) => {
        const group = ps.filter((p) => label(p) === l)
        return group.length ? `${andList(group.map(name))} ${group.length === 1 ? one : many}. ` : ""
      })
      .join("")

  const auto = shown.filter((p) => p.approval === "auto")
  const manual = shown.filter((p) => p.approval === "manual")
  faq.push({
    q: `Which ${niche} approve you automatically?`,
    a: (
      (auto.length ? `${andList(auto.map(name))} ${auto.length === 1 ? "approves" : "approve"} applications automatically. ` : "None of the programs here states automatic approval. ") +
      (manual.length
        ? `${andList(manual.map((p) => (approvalTime(p) ? `${name(p)} (${esc(approvalTime(p)!)})` : name(p))))} ${manual.length === 1 ? "reviews" : "review"} applications by hand. `
        : "") +
      blanks(shown.filter((p) => !p.approval), (p) => emptyLabel(p, "approval"), {
        [STATED_TWO_WAYS]: ["states it two ways", "state it two ways"],
        [NOT_STATED]: ["does not publish how it approves", "do not publish how they approve"],
        [NOT_RECORDED]: ["has no approval details on our record", "have no approval details on our record"],
      })
    ).trim(),
  })

  const withCookie = shown.filter((p) => p.cookieDays != null)
  faq.push({
    q: `How long do cookies last on ${niche}?`,
    a: (
      (withCookie.length
        ? `${withCookie.length} of the ${shown.length} programs here publish a cookie window: ${andList(withCookie.map((p) => `${name(p)} (${p.cookieDays} days)`))}. `
        : "None of the programs here has a cookie window on record. ") +
      blanks(shown.filter((p) => p.cookieDays == null), (p) => emptyLabel(p, "cookie_days"), {
        [STATED_TWO_WAYS]: ["gives two different cookie windows, as its section shows", "give two different cookie windows each, as their sections show"],
        [NOT_STATED]: ["does not publish one", "do not publish one"],
        [NOT_RECORDED]: ["has none on our record", "have none on our record"],
      })
    ).trim(),
  })

  const noMin = shown.filter((p) => p.payout.minimum === 0)
  const paysBy = (p: Program, m: string) => (p.payoutMethods ?? p.payout.methods ?? []).some((x) => x.toLowerCase() === m)
  const paypal = shown.filter((p) => paysBy(p, "paypal"))
  const bank = shown.filter((p) => paysBy(p, "bank"))
  const noMethod = shown.filter((p) => !(p.payoutMethods ?? p.payout.methods ?? []).length)
  // A program with its own schedule on record is not "on the network's terms" (its section shows the schedule).
  const viaNetwork = noMethod.filter((p) => thirdPartyNetwork(p) && !p.payout.frequency)
  faq.push({
    q: `How do ${niche} pay out?`,
    a:
      (paypal.length ? `${paypal.length} of the ${shown.length} programs here pay by PayPal: ${andList(paypal.map(name))}. ` : "") +
      (bank.length ? `${andList(bank.map(name))} ${bank.length === 1 ? "lists" : "list"} bank transfer. ` : "") +
      (noMin.length ? `${andList(noMin.map(name))} ${noMin.length === 1 ? "has" : "have"} no payout minimum. ` : "") +
      [...new Set(viaNetwork.map((p) => thirdPartyNetwork(p)!))]
        .map((net) => {
          const on = viaNetwork.filter((p) => thirdPartyNetwork(p) === net)
          return `${andList(on.map(name))} ${on.length === 1 ? "pays" : "pay"} on ${esc(net)}'s terms. `
        })
        .join("") +
      blanks(noMethod.filter((p) => !viaNetwork.includes(p)), (p) => emptyLabel(p, "payout.methods"), {
        [STATED_TWO_WAYS]: ["states its payout method two ways", "state their payout method two ways"],
        [NOT_STATED]: ["publishes no payout method", "publish no payout method"],
        [NOT_RECORDED]: ["has no payout method on our record", "have no payout method on our record"],
      }) +
      "Each section shows the minimum, schedule and currency the brand publishes.",
  })

  const range = checkedRange(selection)
  if (range) {
    faq.push({
      q: "When were these terms checked?",
      a: `Each program's terms were checked on its own affiliate page between ${dateText(range[0])} and ${dateText(range[1])}. ${FRESHNESS_RULE}`,
    })
  }
  return [...faq, ...(post.faq ?? [])]
}

/**
 * The one line at the end of a standard post that points partners to the
 * Affitor marketplace (Shopify ends its posts the same way with its own
 * product). It says only what affitor.com says (one partner account, many
 * programs); no pricing, no promises, and no team note: programs on Affitor
 * are listed and ranked like every other (Sơn, 2026-10-18 and 2026-10-21).
 */
export const AFFITOR_LINE = {
  before: "Looking for more programs to promote? The ",
  anchor: "Affitor marketplace",
  after: " lets you apply to many affiliate programs from one partner account.",
} as const

/** How many posts the "Read more" box at the end lists. */
export const READ_MORE_COUNT = 5

/** A guide's related /best lists, then the other guides in GUIDES order, the first READ_MORE_COUNT. */
export function guideReadMoreLinks(guide: GuidePost): { href: string; label: string }[] {
  const lists = guide.related.flatMap((slug) => BEST_LISTS.filter((l) => l.slug === slug)).map((l) => ({ href: bestPath(l), label: l.h1 }))
  const guides = GUIDES.filter((g) => g.slug !== guide.slug).map((g) => ({ href: guidePath(g), label: guideTitle(g) }))
  return [...lists, ...guides].slice(0, READ_MORE_COUNT)
}

/** The post's related /best lists, then its guides, the first READ_MORE_COUNT that exist. */
export function readMoreLinks(post: BestPost): { href: string; label: string }[] {
  const lists = post.related.flatMap((slug) => BEST_LISTS.filter((l) => l.slug === slug)).map((l) => ({ href: bestPath(l), label: l.h1 }))
  const guides = (post.guides ?? []).flatMap((slug) => GUIDES.filter((g) => g.slug === slug)).map((g) => ({ href: guidePath(g), label: guideTitle(g) }))
  return [...lists, ...guides].slice(0, READ_MORE_COUNT)
}
