import { getBestList, updatedText } from "./best-lists"
import { FRESHNESS_RULE, NOT_STATED, checkedRange, earnText, payoutText, type BestPost, type PostSelection } from "./best-posts"
import { PAYOUT_METHODS } from "./claims/form"
import { IN_HOUSE, isLive, livePrograms, networkName, programs, type Program } from "./programs"
import { hasNoProgram } from "./no-program"
import type { Faq } from "./program-seo"
import { termNotes } from "./term-notes"

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

const METHOD = new Map(PAYOUT_METHODS)

/** "PayPal or Bank" from payout methods; null when none is recorded. */
export function methodsText(p: Program): string | null {
  const m = (p.payoutMethods ?? p.payout.methods ?? []).map((x) => METHOD.get(x.toLowerCase()) ?? x)
  return m.length ? m.join(" or ") : null
}

/** A third-party network the program runs on (not in-house, not unknown). */
function thirdPartyNetwork(p: Program): string | null {
  return p.network && p.network !== IN_HOUSE ? networkName(p.network) : null
}

const twoWays = (p: Program, ...fields: string[]) => fields.some((f) => termNotes(p.slug).conflicts.has(f))

/** When and how much: "Net 60, $100 minimum", a two-ways note, "On CJ Affiliate's terms", or null. */
function gettingPaid(p: Program): string | null {
  const timing = payoutText(p, "")
  if (timing) return timing
  if (twoWays(p, "payout.minimum", "payout.frequency")) return "The brand's own pages give two different minimums and schedules"
  const net = thirdPartyNetwork(p)
  return net ? `On ${net}'s terms` : null
}

/**
 * "Affiliate program details" for one program, from the registry. A term the
 * program has no value for is left out; one the brand states two ways says so.
 */
export function programDetails(p: Program): [string, string][] {
  const rows: [string, string | null][] = [
    ["Commission rate", earnText(p)],
    ["Getting paid", gettingPaid(p)],
    ["Payment method", methodsText(p) ?? (twoWays(p, "payout.methods") ? "The brand's own pages name two different methods" : null)],
    ["Cookie duration", p.cookieDays != null ? `${p.cookieDays} days` : twoWays(p, "cookie_days") ? "The brand's own pages give two different windows" : null],
    ["Approval", p.approval === "auto" ? "Automatic" : p.approval === "manual" ? `Manual${approvalTime(p) ? `, ${approvalTime(p)}` : ""}` : null],
  ]
  return rows.filter((r): r is [string, string] => Boolean(r[1]))
}

/** The comparison table's cells: Commission, Cookie, Payout ("—" when there is none on record). */
export function tableRow(p: Program): { commission: string; cookie: string; payout: string } {
  const paid = gettingPaid(p)
  const methods = methodsText(p)
  return {
    commission: earnText(p),
    cookie: p.cookieDays != null ? `${p.cookieDays} days` : twoWays(p, "cookie_days") ? "Two values, see below" : "—",
    payout: [twoWays(p, "payout.minimum", "payout.frequency") && !payoutText(p, "") ? "Two values, see below" : paid, methods].filter(Boolean).join(" · ") || "—",
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
 * Pros and cons for one program, from structured fields only: approval,
 * payout rules, cookie length against the registry median, assets, and the
 * brand's restrictions as recorded.
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

  if (p.commission.type === "one-time") cons.push("Pays once per referral, with no recurring share")
  if (p.commission.type === "tiered") cons.push("The top figure needs volume or a higher tier")
  for (const r of p.restrictions ?? []) cons.push(r)
  return { pros: pros.slice(0, PROS_CONS_MAX), cons: cons.slice(0, PROS_CONS_MAX) }
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
        ? `On this page, ${andList(recurring.map((p) => `${name(p)} (${esc(earnText(p))})`))} ${recurring.length === 1 ? "pays" : "pay"} a recurring share. `
        : "None of the programs on this page pays a recurring share. ") +
      (rest.length ? `The other ${rest.length} list their commission as ${andList(restTypes)}, with no recurring length on record; each section gives the details. ` : "") +
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
        [STATED_TWO_WAYS]: ["states its cookie window two ways on its own pages, so we show none", "state their cookie window two ways on their own pages, so we show none"],
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
  const viaNetwork = noMethod.filter((p) => thirdPartyNetwork(p))
  faq.push({
    q: `How do ${niche} pay out?`,
    a:
      (paypal.length ? `${paypal.length} of the ${shown.length} programs here pay by PayPal: ${andList(paypal.map(name))}. ` : "") +
      (bank.length ? `${andList(bank.map(name))} ${bank.length === 1 ? "lists" : "list"} bank transfer. ` : "") +
      (noMin.length ? `${andList(noMin.map(name))} ${noMin.length === 1 ? "has" : "have"} no payout minimum. ` : "") +
      viaNetwork.map((p) => `${name(p)} pays on ${esc(thirdPartyNetwork(p)!)}'s terms. `).join("") +
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
