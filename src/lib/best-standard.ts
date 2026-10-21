import { getBestList, updatedText } from "./best-lists"
import {
  FRESHNESS_RULE,
  NOT_STATED,
  POSTS,
  TERMS_MAX_AGE_DAYS,
  checkedRange,
  earnText,
  payoutText,
  postTitle,
  readyPost,
  type BestPost,
  type PostSelection,
} from "./best-posts"
import { PAYOUT_METHODS } from "./claims/form"
import { IN_HOUSE, commissionUnknown, isLive, livePrograms, networkName, programs, type Program } from "./programs"
import { hasNoProgram } from "./no-program"
import type { Faq } from "./program-seo"
import { leadReceipt, termNotes, type Receipt } from "./term-receipts"

/**
 * The data behind the standard "best X" layout (components/best-post-standard.tsx).
 * Every figure and every list here comes from structured registry fields; the
 * post's copy file holds words only.
 */

/** One date format on a standard post: "Oct 13, 2026". */
export const dateText = (iso: string) => updatedText(iso)

/** "Oct 13 to Oct 19, 2026", or one date when both are the same day. */
export function rangeText([from, to]: [string, string]): string {
  if (from === to) return dateText(to)
  const sameYear = from.slice(0, 4) === to.slice(0, 4)
  return `${sameYear ? dateText(from).replace(/, \d{4}$/, "") : dateText(from)} to ${dateText(to)}`
}

const TYPE_LABEL: Record<string, string> = {
  "one-time": "One-time",
  recurring: "Recurring",
  tiered: "Tiered",
  hybrid: "Hybrid",
}

/** "One-time", "Tiered", "Hybrid, for life": the commission type and, when recorded, how long it lasts. */
export function typeText(p: Program): string {
  const t = TYPE_LABEL[String(p.commission.type)] ?? String(p.commission.type)
  const d = p.commission.duration
  return d ? `${t}, ${d === "lifetime" ? "for life" : `for ${d}`}` : t
}

/**
 * What an empty term reads as, so a blank never claims more than the data:
 * - "Stated two ways": the field is in the YAML's `conflicts`;
 * - "Not stated by the brand": the verifier recorded it as unpublished
 *   (`not_published`, or a "not published" comment);
 * - "Not recorded": the registry simply has no value.
 */
export const STATED_TWO_WAYS = "Stated two ways"
export const NOT_RECORDED = "Not recorded"
export { NOT_STATED }

/** The empty label for one schema field ("cookie_days", "approval", "payout.methods"). */
export function emptyLabel(p: Program, ...fields: string[]): string {
  const notes = termNotes(p.slug, p.url)
  if (fields.some((f) => notes.conflicts.has(f))) return STATED_TWO_WAYS
  if (fields.every((f) => notes.notPublished.has(f))) return NOT_STATED
  return NOT_RECORDED
}

/** "45 days", or the empty label. */
export function cookieCell(p: Program): string {
  return p.cookieDays != null ? `${p.cookieDays} days` : emptyLabel(p, "cookie_days")
}

/** The table's short approval: "Automatic", "Manual", or the empty label. */
export function approvalShort(p: Program): string {
  return p.approval === "auto" ? "Automatic" : p.approval === "manual" ? "Manual" : emptyLabel(p, "approval")
}

/** "up to one week" from "Up to one week": the review time as it reads mid-sentence. */
export function approvalTime(p: Program): string | null {
  const t = p.approvalTime?.trim()
  return t ? t[0].toLowerCase() + t.slice(1) : null
}

/** The block's approval fact, with the review time when the brand gives one. */
export function approvalText(p: Program): string {
  const time = approvalTime(p)
  return time && p.approval ? `${approvalShort(p)}: ${time}` : approvalShort(p)
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

/**
 * The payout fact, the same in the table and the section: schedule and
 * minimum, then methods ("Net 60, $100 minimum · PayPal or Bank"). With no
 * schedule or minimum: "Stated two ways" when the brand disagrees with
 * itself, "On CJ Affiliate's terms" for a program paid through a network,
 * else the empty label.
 */
export function payoutCell(p: Program): string {
  const timing = payoutText(p, "")
  const methods = methodsText(p)
  const notes = termNotes(p.slug, p.url)
  const twoWays = ["payout.minimum", "payout.frequency"].some((f) => notes.conflicts.has(f))
  const net = thirdPartyNetwork(p)
  const first = timing || (twoWays ? STATED_TWO_WAYS : methods ? "" : net ? `On ${net}'s terms` : emptyLabel(p, "payout.minimum", "payout.methods"))
  return [first, methods].filter(Boolean).join(" · ")
}

/** The quote a program's section shows: commission first, else one for a fact the section shows filled in. */
export function programReceipt(p: Program): Receipt | null {
  const shows: Record<Receipt["field"], boolean> = {
    commission: true,
    cookie: p.cookieDays != null,
    payout: p.payout.minimum != null || Boolean(p.payout.frequency),
    approval: Boolean(p.approval),
  }
  return leadReceipt(termNotes(p.slug, p.url).receipts, (f) => shows[f])
}

/** "Its own program", the network's name, "Not in our network list" when the YAML names a platform outside it, else "Not recorded". */
export function runsOnText(p: Program): string {
  if (p.network === IN_HOUSE) return "Its own program"
  if (p.network) return networkName(p.network)
  return termNotes(p.slug, p.url).networkOutsideList ? "Not in our network list" : NOT_RECORDED
}


const CONFLICT_LABEL: Record<string, string> = {
  cookie_days: "cookie window",
  "payout.minimum": "payout minimum",
  "payout.frequency": "payout schedule",
  "commission.rate": "commission",
}

/** Median cookie window among the registry's verified programs (null when none publish one). */
function medianCookie(): number | null {
  const c = livePrograms.filter((p) => p.verified && p.cookieDays != null).map((p) => p.cookieDays!).sort((a, b) => a - b)
  return c.length ? c[Math.floor((c.length - 1) / 2)] : null
}
const MEDIAN_COOKIE = medianCookie()

/**
 * Good / Watch out for one program, from structured fields only: approval,
 * payout rules, cookie length against the registry median, assets, the
 * brand's restrictions as recorded, and terms the brand states two ways.
 */
export function goodWatch(p: Program): { good: string[]; watch: string[] } {
  const good: string[] = []
  const watch: string[] = []
  if (p.commission.duration === "lifetime") good.push("Pays a recurring share for the customer's lifetime")
  if (p.approval === "auto") good.push("Approves applications automatically")
  if (p.payout.minimum === 0) good.push("No payout minimum")
  if (p.payout.frequency === "weekly") good.push("Pays weekly")
  if (p.cookieDays != null && MEDIAN_COOKIE != null && p.cookieDays > MEDIAN_COOKIE)
    good.push(`Cookie of ${p.cookieDays} days, longer than the registry median of ${MEDIAN_COOKIE}`)
  const methods = p.payoutMethods ?? p.payout.methods ?? []
  if (methods.length > 1) good.push(`Pays by ${methodsText(p)}`)
  if (p.marketingMaterials) good.push("Banners and other marketing assets provided")
  if (p.dedicatedManager) good.push("Dedicated affiliate manager")

  if (p.commission.type === "one-time") watch.push("Pays once per referral, with no recurring share")
  if (p.commission.type === "tiered") watch.push("The top figure needs volume or a higher tier")
  for (const r of p.restrictions ?? []) watch.push(r)
  for (const f of termNotes(p.slug, p.url).conflicts) watch.push(`Its pages state the ${CONFLICT_LABEL[f] ?? f} two ways, so we show none`)
  return { good: good.slice(0, 4), watch }
}

/** The programs a standard post is about: the ones it shows plus every program its `considered` rule picks. */
function aboutPrograms(post: BestPost, selection: PostSelection): Program[] {
  const shown = new Set(selection.shown.map((s) => s.program.slug))
  return programs.filter((p) => shown.has(p.slug) || Boolean(post.considered?.(p)))
}

export interface TypeSplit {
  rows: { type: string; label: string; count: number }[]
  total: number
  asOf: string
}

/** Commission type of every live, verified program the post is about: the chart in "What to look for". */
export function typeSplit(post: BestPost, selection: PostSelection): TypeSplit {
  const v = aboutPrograms(post, selection).filter((p) => isLive(p) && !hasNoProgram(p) && p.verified)
  const counts = new Map<string, number>()
  for (const p of v) counts.set(String(p.commission.type), (counts.get(String(p.commission.type)) ?? 0) + 1)
  const rows = [...counts]
    .map(([type, count]) => ({ type, label: TYPE_LABEL[type] ?? type, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  return { rows, total: v.length, asOf: v.map((p) => (p.lastVerifiedAt ?? "").slice(0, 10)).sort().at(-1) ?? "" }
}

export interface ConsideredGroup {
  reason: string
  /** A list the programs appear in instead, when that is the reason. */
  link?: { href: string; label: string }
  programs: { slug: string; name: string }[]
}

/**
 * "Also considered": every program the post is about but does not show,
 * grouped by the first reason the data gives, in this order: status, not
 * verified, no commission figure, stale terms, shown in another post, added
 * on or after the post's last pick. Anything left is "verified, not picked".
 */
export function alsoConsidered(post: BestPost, selection: PostSelection, asOf: Date = new Date()): ConsideredGroup[] {
  const shown = new Set(selection.shown.map((s) => s.program.slug))
  const others = POSTS.filter((o) => o.slug !== post.slug).flatMap((o) => {
    const ready = readyPost(o.slug)
    return ready ? [{ post: o, slugs: new Set(ready.selection.shown.map((s) => s.program.slug)), title: postTitle(o, ready.selection) }] : []
  })
  const groups = new Map<string, ConsideredGroup>()
  const add = (key: string, reason: string, p: Program, link?: ConsideredGroup["link"]) => {
    if (!groups.has(key)) groups.set(key, { reason, link, programs: [] })
    groups.get(key)!.programs.push({ slug: p.slug, name: p.name })
  }
  const maxAge = TERMS_MAX_AGE_DAYS * 86_400_000
  const candidates = aboutPrograms(post, selection)
    .filter((p) => !shown.has(p.slug))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }))
  for (const p of candidates) {
    const checked = Date.parse(p.lastVerifiedAt ?? "")
    const other = others.find((o) => o.slugs.has(p.slug))
    if (!isLive(p) || hasNoProgram(p)) add("status", "Paused, closed or no program found", p)
    else if (!p.verified) add("unverified", "Terms not verified yet", p)
    else if (commissionUnknown(p.commission)) add("nofigure", "No commission figure published", p)
    else if (!Number.isFinite(checked) || asOf.getTime() - checked > maxAge) add("stale", `Terms last checked over ${TERMS_MAX_AGE_DAYS} days ago`, p)
    else if (other) {
      const list = getBestList(other.post.slug)
      add(`post:${other.post.slug}`, "Covered in another of our lists", p, list ? { href: `/best/${list.slug}`, label: other.title } : undefined)
    } else if (p.createdAt.slice(0, 10) >= post.checked) add("new", `Added on or after our last pick for this list (${dateText(post.checked)})`, p)
    else add("rest", "Verified, not picked for this list", p)
  }
  return [...groups.values()]
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
      a: `Each program's terms were checked on its own affiliate page between ${dateText(range[0])} and ${dateText(range[1])}; every section shows its own date and the quote we read. ${FRESHNESS_RULE}`,
    })
  }
  return [...faq, ...(post.faq ?? [])]
}
