/**
 * OAS v2 tier 1: checks a machine can read from public pages without a model,
 * the way ora.ai reads a site (HTTP status, HTML links and text, PageSpeed).
 * Shadow only: nothing here changes a published score.
 *
 *   npx tsx scripts/oas-tier1.ts [--limit N] [--only slug] [--psi]
 *
 * Every request names itself (UA "OpenAffiliate"), obeys the host's robots.txt,
 * and is refused for schema/blocked-hosts.json hosts at every redirect hop.
 * Results are cached per program in .internal/oas/tier1/cache, so a run resumes.
 * --psi adds PageSpeed Insights (keyless): the first 429 stops PageSpeed for the run.
 * Writes .internal/oas/tier1/dry-run.json and distribution.md.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { parse } from "yaml"
import { blockedReason, REDIRECTS } from "./blocked-hosts"

export type State = "met" | "not_met" | "unknown"
export type Check = { state: State; evidence?: string }
export const CHECK_IDS = ["P1", "P2", "P3", "P5", "P6", "A1", "A2"] as const
export const CHECK_NAMES: Record<string, string> = {
  P1: "Public pricing", P2: "Free trial or free plan", P3: "Self-serve signup",
  P5: "Core Web Vitals (mobile)", P6: "Buyer search demand", A1: "Program page is live", A2: "Program page links its terms",
}

const AGENT = "OpenAffiliate"
const UA = "Mozilla/5.0 (compatible; OpenAffiliate/1.0; +https://openaffiliate.dev)"
const MAX_HOPS = 10
const MAX_BYTES = 1_500_000

// ---------- robots.txt (RFC 9309: longest match wins, Allow wins a tie) ----------

export function robotsAllows(robots: string, path: string, agent = AGENT): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = []
  let current: (typeof groups)[number] | null = null
  let lastWasAgent = false
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim()
    const match = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line)
    if (!match) continue
    const key = match[1].toLowerCase()
    const value = match[2].trim()
    if (key === "user-agent") {
      if (!current || !lastWasAgent) groups.push((current = { agents: [], rules: [] }))
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
    } else if ((key === "allow" || key === "disallow") && current) {
      if (value) current.rules.push({ allow: key === "allow", path: value })
      lastWasAgent = false
    } else {
      lastWasAgent = false
    }
  }
  const name = agent.toLowerCase()
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && name.includes(a)))
  const rules = (mine.length ? mine : groups.filter((g) => g.agents.includes("*"))).flatMap((g) => g.rules)
  let best: { allow: boolean; length: number } | null = null
  for (const rule of rules) {
    const anchored = rule.path.endsWith("$")
    const body = (anchored ? rule.path.slice(0, -1) : rule.path).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")
    const pattern = new RegExp("^" + body + (anchored ? "$" : ""))
    if (!pattern.test(path)) continue
    if (!best || rule.path.length > best.length || (rule.path.length === best.length && rule.allow)) best = { allow: rule.allow, length: rule.path.length }
  }
  return best ? best.allow : true
}

// ---------- polite fetch ----------

type Page = { status: number; html: string; url: string }
type Refused = { refused: string }
const robotsCache = new Map<string, Promise<string | null>>()

async function robotsFor(origin: string): Promise<string | null> {
  if (!robotsCache.has(origin)) {
    robotsCache.set(origin, (async () => {
      try {
        const res = await fetch(`${origin}/robots.txt`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10000) })
        if (res.status >= 400 && res.status < 500) return "" // no robots.txt: everything allowed
        if (!res.ok) return null // unreachable or 5xx: treat as disallowed for this run
        return (await res.text()).slice(0, 500_000)
      } catch {
        return null
      }
    })())
  }
  return robotsCache.get(origin)!
}

/** GET with every hop checked against blocked hosts and robots.txt before it is requested. */
export async function politeGet(url: string): Promise<Page | Refused> {
  let current = url
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const blocked = blockedReason(current)
    if (blocked) return { refused: `blocked host (${blocked.split(":")[0]})` }
    let parsed: URL
    try {
      parsed = new URL(current)
    } catch {
      return { refused: "bad url" }
    }
    const robots = await robotsFor(parsed.origin)
    if (robots === null) return { refused: "robots.txt unreachable" }
    if (!robotsAllows(robots, parsed.pathname + parsed.search)) return { refused: "robots.txt disallows" }
    let res: Response
    try {
      res = await fetch(current, {
        headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.9" },
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
      })
    } catch (error) {
      return { refused: `fetch failed (${(error as Error).name})` }
    }
    const location = res.headers.get("location")
    if (REDIRECTS.has(res.status) && location) {
      await res.body?.cancel()
      current = new URL(location, current).href
      continue
    }
    const html = res.status === 200 ? (await res.text()).slice(0, MAX_BYTES) : (await res.body?.cancel(), "")
    return { status: res.status, html, url: current }
  }
  return { refused: "too many redirects" }
}

// ---------- readers (pure, tested) ----------

export function visibleText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&#36;|&dollar;/g, "$").replace(/&euro;/g, "€").replace(/&pound;/g, "£")
    .replace(/\s+/g, " ")
}

export function links(html: string, base: string): { href: string; text: string }[] {
  const out: { href: string; text: string }[] = []
  for (const m of html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]{0,400}?)<\/a>/gi)) {
    try {
      out.push({ href: new URL(m[1], base).href, text: visibleText(m[2]).trim() })
    } catch { /* not a URL */ }
  }
  return out
}

const sameSite = (a: string, b: string) => {
  const host = (u: string) => new URL(u).hostname.replace(/^www\./, "")
  const [x, y] = [host(a), host(b)]
  return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`)
}

export function pricingLink(html: string, base: string): string | null {
  const found = links(html, base).filter((l) =>
    sameSite(l.href, base) && (/\/(pricing|plans|prices?)(\/|$|\?)/i.test(new URL(l.href).pathname + "/") || /^(pricing|plans|plans (&|and) pricing|prices?)$/i.test(l.text)))
  // The main pricing page, not a sub-page such as /pricing/enterprise.
  return found.map((l) => l.href).sort((a, b) => new URL(a).pathname.length - new URL(b).pathname.length)[0] ?? null
}

const PRICE = /(?:[$€£₹]\s?\d|\b\d[\d.,]*\s?(?:USD|EUR|GBP)\b)/
/** A price in the visible text, or in a JSON-LD offer (pages that render prices with script often publish one). */
export function hasPrice(text: string, html = ""): string | null {
  const m = PRICE.exec(text)
  if (m) return text.slice(Math.max(0, m.index - 30), m.index + 40).trim()
  for (const ld of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    const offer = /"price"\s*:\s*"?(\d[\d.]*)"?[\s\S]{0,120}?"priceCurrency"\s*:\s*"([A-Z]{3})"|"priceCurrency"\s*:\s*"([A-Z]{3})"[\s\S]{0,120}?"price"\s*:\s*"?(\d[\d.]*)/.exec(ld[1])
    if (offer && Number(offer[1] ?? offer[4]) > 0) return `JSON-LD offer ${offer[1] ?? offer[4]} ${offer[2] ?? offer[3]}`
  }
  return null
}

const TRIAL = /\b(free trial|\d+[- ]day (?:free )?trial|free plan|free forever|free tier|forever free|start (?:for )?free|try (?:it )?(?:for )?free|free to start|get started (?:for )?free)\b/i
export function hasTrial(text: string): string | null {
  return TRIAL.exec(text)?.[0] ?? null
}

const SIGNUP_TEXT = /\b(sign ?up|get started|start (?:for )?free|start (?:your )?(?:free )?trial|try (?:it )?(?:for )?free|create (?:an |your )?account|register|join (?:now|free))\b/i
const SIGNUP_HREF = /\/(sign-?up|register|join|get-started|start|onboarding)(\/|$|\?)/i
export function selfServe(html: string, base: string): string | null {
  const found = links(html, base).find((l) => SIGNUP_TEXT.test(l.text) || SIGNUP_HREF.test(new URL(l.href).pathname))
  return found ? `${found.text || "link"} → ${found.href}`.slice(0, 120) : null
}

const TERMS_LINK = /(affiliate|partner|referral|ambassador|program)[\w\s-]{0,30}(terms|agreement|conditions)|(terms|agreement|conditions)[\w\s-]{0,30}(affiliate|partner|referral|ambassador|program)/i
export function termsLink(html: string, base: string): string | null {
  const found = links(html, base).find((l) => TERMS_LINK.test(l.text) || TERMS_LINK.test(decodeURIComponent(new URL(l.href).pathname).replace(/[-_/]/g, " ")))
  if (found) return `${found.text || "link"} → ${found.href}`.slice(0, 120)
  const inline = TERMS_LINK.exec(visibleText(html))
  return inline ? `on page: ${inline[0]}` : null
}

/** Core Web Vitals from a PageSpeed v5 result: field data when present, lab otherwise. */
export function cwv(psi: { loadingExperience?: { metrics?: Record<string, { category?: string }> }; lighthouseResult?: { audits?: Record<string, { numericValue?: number }> } }): Check {
  const field = psi.loadingExperience?.metrics
  const keys = ["LARGEST_CONTENTFUL_PAINT_MS", "INTERACTION_TO_NEXT_PAINT", "CUMULATIVE_LAYOUT_SHIFT_SCORE"]
  if (field && keys.every((k) => field[k]?.category)) {
    const slow = keys.filter((k) => field[k].category !== "FAST")
    return slow.length ? { state: "not_met", evidence: `field: ${slow.join(", ")} not good` } : { state: "met", evidence: "field: LCP, INP, CLS good" }
  }
  const audits = psi.lighthouseResult?.audits
  const lcp = audits?.["largest-contentful-paint"]?.numericValue
  const cls = audits?.["cumulative-layout-shift"]?.numericValue
  const tbt = audits?.["total-blocking-time"]?.numericValue
  if (lcp == null || cls == null || tbt == null) return { state: "unknown", evidence: "no field or lab data" }
  const ok = lcp <= 2500 && cls <= 0.1 && tbt <= 200
  return { state: ok ? "met" : "not_met", evidence: `lab: LCP ${Math.round(lcp)}ms, CLS ${cls.toFixed(2)}, TBT ${Math.round(tbt)}ms` }
}

// ---------- one program ----------

type Program = { slug: string; name?: string; url?: string | null; signup_url?: string | null; network?: string | null; status?: string }
export type Result = { slug: string; network: string; checkedAt: string; checks: Record<string, Check> }

const unknown = (why: string): Check => ({ state: "unknown", evidence: why })
const isPage = (p: Page | Refused): p is Page => "status" in p

async function scanProgram(p: Program): Promise<Result> {
  const checks: Record<string, Check> = {}
  if (!p.url) {
    for (const id of ["P1", "P2", "P3", "P5"]) checks[id] = unknown("no brand URL")
  } else {
    const home = await politeGet(p.url)
    if (!isPage(home) || home.status !== 200) {
      const why = isPage(home) ? `brand page HTTP ${home.status}` : home.refused
      for (const id of ["P1", "P2", "P3", "P5"]) checks[id] = unknown(why)
    } else {
      // A linked pricing page, else the conventional /pricing path (one request).
      const found = await politeGet(pricingLink(home.html, home.url) ?? new URL("/pricing", home.url).href)
      const pricing = isPage(found) && found.status === 200 ? found : null
      const text = visibleText(home.html) + " " + (pricing ? visibleText(pricing.html) : "")
      const price = pricing ? hasPrice(visibleText(pricing.html), pricing.html) : null
      checks.P1 = price ? { state: "met", evidence: `${pricing!.url}: ${price}` } : { state: "not_met", evidence: pricing ? `${pricing.url}: no price in the HTML` : "no pricing page found" }
      const trial = hasTrial(text)
      checks.P2 = trial ? { state: "met", evidence: trial } : { state: "not_met", evidence: "no trial or free plan stated" }
      const signup = selfServe(home.html, home.url) ?? (pricing ? selfServe(pricing.html, pricing.url) : null)
      checks.P3 = signup ? { state: "met", evidence: signup } : { state: "not_met", evidence: "no sign-up link" }
      checks.P5 = unknown("PageSpeed not run")
    }
  }
  checks.P6 = unknown("DataForSEO not run")
  if (!p.signup_url) {
    checks.A1 = unknown("no program URL")
    checks.A2 = unknown("no program URL")
  } else {
    const page = await politeGet(p.signup_url)
    if (!isPage(page)) {
      checks.A1 = unknown(page.refused)
      checks.A2 = unknown(page.refused)
    } else {
      checks.A1 = page.status === 200 ? { state: "met", evidence: page.url } : { state: "not_met", evidence: `HTTP ${page.status} at ${page.url}` }
      const terms = page.status === 200 ? termsLink(page.html, page.url) : null
      checks.A2 = page.status !== 200 ? unknown("program page not live") : terms ? { state: "met", evidence: terms } : { state: "not_met", evidence: "no link to program terms" }
    }
  }
  return { slug: p.slug, network: p.network ?? "unknown", checkedAt: new Date().toISOString(), checks }
}

let psiStopped: string | null = null
async function runPsi(p: Program, r: Result): Promise<void> {
  if (psiStopped || !p.url || r.checks.P1.state === "unknown") return // brand page not readable under our rules
  const api = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?strategy=mobile&category=performance&url=${encodeURIComponent(p.url)}`
  try {
    const res = await fetch(api, { signal: AbortSignal.timeout(120000) })
    if (res.status === 429) {
      psiStopped = `PageSpeed 429 at ${p.slug}`
      return
    }
    r.checks.P5 = res.ok ? cwv(await res.json()) : unknown(`PageSpeed HTTP ${res.status}`)
  } catch (error) {
    r.checks.P5 = unknown(`PageSpeed failed (${(error as Error).name})`)
  }
}

// ---------- run + report ----------

/** Tier-1 score for the dry run: met over determined checks, equal weights (provisional, not a proposal). */
export function tier1Score(r: Result): number | null {
  const known = Object.values(r.checks).filter((c) => c.state !== "unknown")
  return known.length < 4 ? null : Math.round((known.filter((c) => c.state === "met").length / known.length) * 1000) / 10
}

export function distribution(results: Result[]): string {
  const lines = [`# OAS v2 tier 1 · dry run`, ``, `${results.length} programs · ${new Date().toISOString().slice(0, 10)} · equal weights, provisional`, ``, `## Checks`, ``, `| Check | Met | Not met | Unknown |`, `|---|---|---|---|`]
  for (const id of CHECK_IDS) {
    const count = (s: State) => results.filter((r) => r.checks[id]?.state === s).length
    lines.push(`| ${id} ${CHECK_NAMES[id]} | ${count("met")} | ${count("not_met")} | ${count("unknown")} |`)
  }
  const scored = results.map((r) => ({ r, s: tier1Score(r) })).filter((x): x is { r: Result; s: number } => x.s != null)
  lines.push(``, `## Score bands (${scored.length} with 4+ determined checks)`, ``, `| Score | Programs |`, `|---|---|`)
  for (let low = 100; low >= 0; low -= 10) {
    const n = scored.filter(({ s }) => (low === 100 ? s === 100 : s >= low && s < low + 10)).length
    lines.push(`| ${low === 100 ? "100" : `${low}–${low + 9.9}`} | ${n} |`)
  }
  lines.push(``, `## By network (neutrality)`, ``, `| Network | Programs | Scored | Mean |`, `|---|---|---|---|`)
  const networks = [...new Set(results.map((r) => r.network))].sort()
  for (const n of networks) {
    const all = results.filter((r) => r.network === n)
    const s = scored.filter((x) => x.r.network === n).map((x) => x.s)
    lines.push(`| ${n} | ${all.length} | ${s.length} | ${s.length ? (s.reduce((a, b) => a + b, 0) / s.length).toFixed(1) : "-"} |`)
  }
  const reasons = new Map<string, number>()
  for (const r of results) for (const c of Object.values(r.checks)) if (c.state === "unknown") reasons.set(c.evidence ?? "?", (reasons.get(c.evidence ?? "?") ?? 0) + 1)
  lines.push(``, `## Unknown, by reason`, ``, `| Reason | Checks |`, `|---|---|`)
  for (const [why, n] of [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 15)) lines.push(`| ${why} | ${n} |`)
  return lines.join("\n") + "\n"
}

async function main() {
  const args = process.argv.slice(2)
  const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null
  const psi = args.includes("--psi")
  const out = join(process.cwd(), ".internal", "oas", "tier1")
  const cache = join(out, "cache")
  mkdirSync(cache, { recursive: true })
  const programs = readdirSync("programs").filter((f) => f.endsWith(".yaml"))
    .map((f) => parse(readFileSync(join("programs", f), "utf8")) as Program)
    .filter((p) => !only || p.slug === only)
    .slice(0, limit)
  const results: Result[] = []
  let next = 0
  const worker = async () => {
    while (next < programs.length) {
      const p = programs[next++]
      const file = join(cache, `${p.slug}.json`)
      const r: Result = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : await scanProgram(p)
      if (psi && r.checks.P5?.state === "unknown" && r.checks.P5.evidence === "PageSpeed not run") await runPsi(p, r)
      writeFileSync(file, JSON.stringify(r, null, 2) + "\n")
      results.push(r)
      if (results.length % 25 === 0) console.log(`${results.length}/${programs.length}${psiStopped ? ` · ${psiStopped}` : ""}`)
    }
  }
  await Promise.all(Array.from({ length: psi ? 3 : 8 }, worker))
  results.sort((a, b) => a.slug.localeCompare(b.slug))
  writeFileSync(join(out, "dry-run.json"), JSON.stringify(results, null, 2) + "\n")
  writeFileSync(join(out, "distribution.md"), distribution(results))
  console.log(`tier 1: ${results.length} programs → ${join(out, "distribution.md")}${psiStopped ? ` · ${psiStopped}` : ""}`)
}

if (process.argv[1]?.endsWith("oas-tier1.ts")) main()
