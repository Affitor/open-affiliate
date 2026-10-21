/**
 * OAS v2 tier 1: checks a machine can read from public pages without a model,
 * the way ora.ai reads a site (HTTP status, HTML links and text, PageSpeed).
 * Shadow only: nothing here changes a published score.
 *
 *   npx tsx scripts/oas-tier1.ts [--limit N] [--only slug] [--slugs file] [--out dir] [--psi] [--seo] [--rescan-html]
 *     [--record dir | --replay dir]
 *
 * Every request names itself (UA "OpenAffiliate"), obeys the host's robots.txt,
 * and is refused for schema/blocked-hosts.json hosts at every redirect hop,
 * robots.txt requests included. Bodies are read up to a byte cap.
 * Results are cached per program in .internal/oas/tier1/cache, so a run resumes.
 * --psi adds PageSpeed Insights (PAGESPEED_API_KEY when set, keyless otherwise):
 * the URL is re-checked under the same rules first, and the first 429 stops PageSpeed.
 * Each program is scanned in its own child process with a hard time limit, so no
 * response (however it is shaped, whatever it costs to parse) can stall the run.
 * --seo adds P6 from DataForSEO (Google Ads search volume, worldwide, DATAFORSEO_LOGIN
 * and DATAFORSEO_PASSWORD): up to 1,000 brand names per request, a hard spend cap per
 * run, and every request's real cost logged to dataforseo-costs.json.
 * Writes .internal/oas/tier1/dry-run.json and distribution.md (or under --out).
 * --record saves every response the scan receives (robots.txt included); --replay serves
 * those saved responses and fails any URL not saved, so two versions of the readers can
 * be compared on the same bytes, without the network.
 */
import { fork } from "node:child_process"
import { createHash } from "node:crypto"
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { parse as parseDomain } from "tldts"
import { parse } from "yaml"
import { blockedReason, REDIRECTS } from "./blocked-hosts"

export type State = "met" | "not_met" | "unknown"
export type Check = { state: State; evidence?: string }
export const CHECK_IDS = ["P1", "P2", "P3", "P5", "P6", "A1", "A2"] as const
export const CHECK_NAMES: Record<string, string> = {
  P1: "Public pricing", P2: "Free trial or free plan", P3: "Self-serve signup",
  P5: "Core Web Vitals (mobile)", P6: "Buyer search demand", A1: "Program page is live", A2: "Program page links its terms",
}

const AGENT = "openaffiliate"
const UA = "Mozilla/5.0 (compatible; OpenAffiliate/1.0; +https://openaffiliate.dev)"
const MAX_HOPS = 10
const PAGE_BYTES = 1_500_000
const ROBOTS_BYTES = 512_000 // RFC 9309 §2.5: parse at least 500 KiB
const PSI_BYTES = 8_000_000

// ---------- robots.txt (RFC 9309) ----------

/** RFC 9309 §2.2.2: compare paths with unreserved characters decoded and everything else percent-encoded in upper case. */
export function normalizePath(path: string): string {
  const decoded = path.replace(/%([0-9a-fA-F]{2})/g, (_, hex: string) => {
    const c = String.fromCharCode(parseInt(hex, 16))
    return /[A-Za-z0-9\-._~]/.test(c) ? c : `%${hex.toUpperCase()}`
  })
  return [...decoded].map((c) => (c.codePointAt(0)! > 0x7e || c.codePointAt(0)! < 0x21 ? encodeURIComponent(c) : c)).join("")
}

/**
 * RFC 9309 path match: `*` is any run of characters, a trailing `$` anchors the end,
 * otherwise the rule is a prefix. Greedy two-pointer matching, O(rule × path) at worst:
 * a rule like "/*a*a*a…b" cannot backtrack exponentially the way a regex would.
 */
export function wildcardMatch(rule: string, path: string): boolean {
  const pattern = rule.endsWith("$") ? rule.slice(0, -1) : rule + "*"
  let i = 0, j = 0, star = -1, mark = 0
  while (i < path.length) {
    if (j < pattern.length && pattern[j] !== "*" && pattern[j] === path[i]) {
      i++
      j++
    } else if (j < pattern.length && pattern[j] === "*") {
      star = j++
      mark = i
    } else if (star !== -1) {
      j = star + 1
      i = ++mark
    } else {
      return false
    }
  }
  while (pattern[j] === "*") j++
  return j === pattern.length
}

export function robotsAllows(robots: string, path: string, agent = AGENT): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = []
  let current: (typeof groups)[number] | null = null
  let inAgents = false
  // Forward scan by the "#" and ":" boundaries (RFC 9309 §2.2), trimming only SP and HTAB:
  // no regex over the record, so any Unicode in a value (U+2028 included) is kept.
  const trim = (v: string) => {
    let a = 0
    let b = v.length
    while (a < b && (v[a] === " " || v[a] === "\t")) a++
    while (b > a && (v[b - 1] === " " || v[b - 1] === "\t")) b--
    return v.slice(a, b)
  }
  for (const raw of robots.split(/\r\n|\r|\n/)) {
    const hash = raw.indexOf("#")
    const line = hash === -1 ? raw : raw.slice(0, hash)
    const colon = line.indexOf(":")
    if (colon === -1) continue
    const key = trim(line.slice(0, colon)).toLowerCase()
    const value = trim(line.slice(colon + 1))
    if (key === "user-agent") {
      if (!current || !inAgents) groups.push((current = { agents: [], rules: [] }))
      // The product token is the part before any "/version".
      current.agents.push(trim(value.split("/")[0]).toLowerCase())
      inAgents = true
    } else if ((key === "allow" || key === "disallow") && current) {
      if (value) current.rules.push({ allow: key === "allow", path: normalizePath(value) })
      inAgents = false
    }
    // Other records (Sitemap, Crawl-delay, Host) are not part of a group and do not end one.
  }
  const mine = groups.filter((g) => g.agents.includes(agent))
  const rules = (mine.length ? mine : groups.filter((g) => g.agents.includes("*"))).flatMap((g) => g.rules)
  const target = normalizePath(path)
  let best: { allow: boolean; length: number } | null = null
  for (const rule of rules) {
    if (!wildcardMatch(rule.path, target)) continue
    if (!best || rule.path.length > best.length || (rule.path.length === best.length && rule.allow)) best = { allow: rule.allow, length: rule.path.length }
  }
  return best ? best.allow : true
}

// ---------- polite fetch ----------

type Page = { status: number; html: string; url: string; truncated?: boolean }
type Refused = { refused: string }
let fetcher: typeof fetch = (input, init) => fetch(input, init)
const robotsCache = new Map<string, Promise<string | null>>()

/** Tests swap the network for a stub; the robots cache goes with it. */
export function setFetcher(stub: typeof fetch): void {
  fetcher = stub
  robotsCache.clear()
}

/** The largest body any reader asks for (PageSpeed JSON): a recording keeps one byte more, so a cut is replayed as a cut. */
const recordKey = (url: string) => createHash("sha256").update(url).digest("hex")
const NULL_BODY = new Set([101, 204, 205, 304])

let recordSeq = 0
/**
 * Wraps a fetch: each response's status and Location are saved under `dir`, and its body exactly as the reader
 * consumes it (raw bytes, appended chunk by chunk, read only when the reader asks), with a failure that ended the
 * stream, so a replay reads the same bytes and fails the same way. Each response writes its own body file; when the
 * stream ends, is cancelled or fails, one manifest naming that file is renamed into place (a single atomic step), so
 * two responses for one URL never pair one's status with the other's body, across processes too, and an unfinished
 * capture (a killed child) does not exist for a replay.
 */
export function recordingFetcher(dir: string, base: typeof fetch): typeof fetch {
  mkdirSync(dir, { recursive: true })
  return async (input, init) => {
    const url = String(input)
    const res = await base(input, init)
    const key = recordKey(url)
    const bodyName = `${key}.${process.pid}.${recordSeq++}.body`
    let error: string | null = null
    let done = false
    writeFileSync(join(dir, bodyName), "")
    const finish = () => {
      if (done) return
      done = true
      const manifest = join(dir, `${bodyName}.json.tmp`)
      writeFileSync(manifest, JSON.stringify({ url, status: res.status, location: res.headers.get("location"), error, body: bodyName }))
      renameSync(manifest, join(dir, `${key}.json`))
    }
    const reader = res.body?.getReader()
    if (!reader || NULL_BODY.has(res.status)) {
      finish()
      return new Response(null, { status: res.status, headers: res.headers })
    }
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        let chunk: ReadableStreamReadResult<Uint8Array>
        try {
          chunk = await reader.read()
        } catch (e) {
          error = (e as Error).name || "Error"
          finish()
          controller.error(e)
          return
        }
        if (chunk.done) {
          finish()
          return controller.close()
        }
        appendFileSync(join(dir, bodyName), chunk.value)
        controller.enqueue(chunk.value)
      },
      cancel: (reason) => {
        finish() // the reader stopped here on purpose (a cap, a redirect): what it read is the recording
        return reader.cancel(reason)
      },
    }, { highWaterMark: 0 })
    return new Response(body, { status: res.status, headers: res.headers })
  }
}

/** Serves responses saved by recordingFetcher; a URL that was not saved (or never finished) fails like a network error. */
export function replayFetcher(dir: string): typeof fetch {
  return async (input) => {
    const key = recordKey(String(input))
    if (!existsSync(join(dir, `${key}.json`))) throw new Error("not recorded")
    const meta = JSON.parse(readFileSync(join(dir, `${key}.json`), "utf8")) as { status: number; location: string | null; error?: string | null; body?: string }
    const headers = new Headers(meta.location ? { location: meta.location } : {})
    if (NULL_BODY.has(meta.status)) return new Response(null, { status: meta.status, headers })
    // The manifest names its own body file (recordings before it used one file per URL).
    const bytes = readFileSync(join(dir, meta.body && /^[0-9a-f]{64}\.\d+\.\d+\.body$/.test(meta.body) ? meta.body : `${key}.body`))
    // The bytes first, then the end or the recorded failure, on separate reads (as the stream delivered them live).
    let sent = false
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!sent && bytes.length) {
          sent = true
          controller.enqueue(new Uint8Array(bytes))
          return
        }
        if (meta.error) {
          const error = new Error("recorded stream failure")
          error.name = meta.error
          controller.error(error)
        } else controller.close()
      },
    }, { highWaterMark: 0 })
    return new Response(body, { status: meta.status, headers })
  }
}

/** Reads at most `max` bytes of a body, then cancels the rest; `truncated` says whether anything was cut. */
export async function readCapped(res: Response, max: number): Promise<{ text: string; truncated: boolean }> {
  const reader = res.body?.getReader()
  if (!reader) return { text: "", truncated: false }
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.byteLength
    if (size > max) {
      await reader.cancel()
      break
    }
  }
  return { text: new TextDecoder().decode(Buffer.concat(chunks).subarray(0, max)), truncated: size > max }
}

/** GET following redirects by hand: each hop is checked against blocked hosts (and robots.txt when asked) before it is requested. */
async function hopGet(url: string, opts: { robots: boolean; maxBytes: number; timeout: number }): Promise<Page | Refused> {
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
    if (opts.robots) {
      const robots = await robotsFor(parsed.origin)
      if (robots === null) return { refused: "robots.txt unreachable" }
      if (!robotsAllows(robots, parsed.pathname + parsed.search)) return { refused: "robots.txt disallows" }
    }
    let res: Response
    try {
      res = await fetcher(current, {
        headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.9" },
        redirect: "manual",
        signal: AbortSignal.timeout(opts.timeout),
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
    try {
      if (res.status !== 200) {
        await res.body?.cancel()
        return { status: res.status, html: "", url: current }
      }
      const { text, truncated } = await readCapped(res, opts.maxBytes)
      return { status: res.status, html: text, url: current, truncated }
    } catch (error) {
      return { refused: `read failed (${(error as Error).name})` }
    }
  }
  return { refused: "too many redirects" }
}

function robotsFor(origin: string): Promise<string | null> {
  if (!robotsCache.has(origin)) {
    robotsCache.set(origin, hopGet(`${origin}/robots.txt`, { robots: false, maxBytes: ROBOTS_BYTES, timeout: 10000 }).then((r) => {
      if (!isPage(r)) return null // unreachable, or redirected to a blocked host: treat as disallowed
      // A file past the parse limit is not read in part: a cut record could widen access, so the host
      // counts as unreachable (fail closed). Files that large are rare.
      if (r.status === 200) return r.truncated ? null : r.html
      return r.status >= 400 && r.status < 500 ? "" : null // no robots.txt allows all; 5xx disallows for this run
    }))
  }
  return robotsCache.get(origin)!
}

export function politeGet(url: string): Promise<Page | Refused> {
  return hopGet(url, { robots: true, maxBytes: PAGE_BYTES, timeout: 15000 })
}

// ---------- readers (pure, tested) ----------

/** Drops script, style, noscript and svg blocks in one forward pass (an unclosed block runs to the end). */
function stripBlocks(html: string): string {
  const lower = html.toLowerCase()
  const open = /<(script|style|noscript|svg)\b/g
  let out = ""
  let at = 0
  for (let m = open.exec(lower); m; m = open.exec(lower)) {
    if (m.index < at) continue
    out += html.slice(at, m.index) + " "
    const close = lower.indexOf(`</${m[1]}`, m.index)
    at = close === -1 ? html.length : lower.indexOf(">", close) + 1 || html.length
    open.lastIndex = at
  }
  return out + html.slice(at)
}

export function visibleText(html: string): string {
  return stripBlocks(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&#36;|&dollar;/g, "$").replace(/&euro;/g, "€").replace(/&pound;/g, "£")
    .replace(/\s+/g, " ")
}

export function links(html: string, base: string): { href: string; text: string }[] {
  const out: { href: string; text: string }[] = []
  // Up to 4,000 characters of anchor content: icon buttons carry inline SVG (the sample's missed "Get started").
  for (const m of html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]{0,4000}?)<\/a>/gi)) {
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

const decoded = (path: string) => {
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

export function pricingLink(html: string, base: string): string | null {
  const found = links(html, base).filter((l) =>
    sameSite(l.href, base) && (/\/(pricing|plans|prices?)(\/|$|\?)/i.test(new URL(l.href).pathname + "/") || /^(pricing|plans|plans (&|and) pricing|prices?)$/i.test(l.text)))
  // The main pricing page, not a sub-page such as /pricing/enterprise.
  return found.map((l) => l.href).sort((a, b) => new URL(a).pathname.length - new URL(b).pathname.length)[0] ?? null
}

// A currency before the amount ("$29"), or after it ("29 USD", "1,90 €"); a K/M/B figure ("$2B+", "$50K") is a statistic, not a price.
// Amounts are at most 16 characters and must be the whole digit run, so a long run of digits costs linear time, not quadratic.
const PRICE = /(?:[$€£₹]\s?(\d[\d.,]{0,15})(?![\d.,])(?!\s?(?:k|m|b|bn|mm|million|billion)\b)|(?<![\d.,])(\d[\d.,]{0,15})(?![\d.,])\s?(?:USD|EUR|GBP|€|£)(?![\w]))/gi
const NOT_A_PRICE = /\b(save[sd]?|saving|off|discount|over|up to|worth|raised|funding|revenue|earn|commission|spend|managed|reduc\w*|cut|lower\w*|by)\b[^.]{0,20}$/i
/**
 * A product price: a non-zero amount in the visible text that is not a saving,
 * discount or other marketing figure, or a non-zero JSON-LD offer (pages that
 * draw prices with script often publish one).
 */
export function hasPrice(text: string, html = "", skip?: (before: string) => boolean): string | null {
  for (const m of text.matchAll(PRICE)) {
    // "1,90" (comma decimals) and "1,900" both read as a positive amount; only zero is not a price.
    const amount = Number((m[1] ?? m[2]).replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."))
    const before = text.slice(Math.max(0, m.index! - 40), m.index)
    if (!(amount > 0) || NOT_A_PRICE.test(before) || skip?.(before)) continue
    return text.slice(Math.max(0, m.index! - 30), m.index! + 40).trim()
  }
  for (const ld of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    const offer = /"price"\s*:\s*"?(\d[\d.]*)"?[\s\S]{0,120}?"priceCurrency"\s*:\s*"([A-Z]{3})"|"priceCurrency"\s*:\s*"([A-Z]{3})"[\s\S]{0,120}?"price"\s*:\s*"?(\d[\d.]*)/.exec(ld[1])
    if (offer && Number(offer[1] ?? offer[4]) > 0) return `JSON-LD offer ${offer[1] ?? offer[4]} ${offer[2] ?? offer[3]}`
  }
  return null
}

// Also "Try Duplicator free", "Install X Free", "free version", and the common non-English phrasings.
const TRIAL = /(?:\b(?:free trial|\d+[- ]day (?:free )?trial|free plan|free forever|free tier|forever free|free version|free account|start (?:for )?free|try (?:it )?(?:for )?free|(?:try|install) (?:[\w.-]+ ){1,3}(?:for )?free|free to start|(?<!\brisk[\s\u00a0\u2010-\u2015-]{0,2})free to try|get started (?:for )?free|free\s+[$€£]0\b|[$€£]0\s*\/\s*(?:mo|month)|dùng thử miễn phí|gói miễn phí|kostenlos testen|gratis testen|essai gratuit|prueba gratis|prueba gratuita|teste grátis|teste gratuito|prova gratuita)|無料トライアル|免费试用)/gi
// "Try our free demo", "for free shipping": free, but not a trial or a plan.
const NOT_TRIAL_AFTER = /^\s*(?:(?:online|live|personal|personalized|custom|standard|express|instant|quick|guided|interactive|product|1:1)\s+){0,2}(?:demo|shipping|delivery|consultation|quote|assessment|audit|estimate|sample|webinar|guide|e-?book|report|template|tool)s?\b/i
// A negation right after the phrase: "free to try? No", "Free to try: No", "is unavailable", "is no longer available".
const NEGATED_AFTER = /^\W{0,3}(?:[?:]\s*(?:no|not)\b|(?:is|are)\s+(?:(?:currently|temporarily|now|presently)\s+)?(?:no longer|not|unavailable)\b|(?:is|are)n'?t\b|no longer available|unavailable|not anymore)/i
/** Trial or free-plan wording, skipping negated mentions before or after it ("no free trial", "free plan is no longer available"). */
export function hasTrial(text: string): string | null {
  for (const m of text.matchAll(TRIAL)) {
    if (/\b(no|not|without|never)\b[\w\s-]{0,12}$/i.test(text.slice(Math.max(0, m.index! - 20), m.index))) continue
    if (NEGATED_AFTER.test(text.slice(m.index! + m[0].length, m.index! + m[0].length + 40))) continue
    // Only named freebies are skipped. Page text loses element boundaries, so the word after a "Start for free"
    // button is usually the next button's label: requiring "free" to end the phrase dropped 63 real readings.
    if (NOT_TRIAL_AFTER.test(text.slice(m.index! + m[0].length, m.index! + m[0].length + 30))) continue
    return m[0]
  }
  return null
}

// Buying on the brand's own site is also starting without sales (rubric P3: "start without booking a demo or contacting sales").
const SIGNUP_TEXT = /\b(sign ?up|get started|start (?:for )?free|start (?:your )?(?:free )?trial|try (?:it )?(?:for )?free|create (?:an |your )?account|make an account|register|join (?:now|free)|install now|buy now|purchase now|get it now|add to cart)\b/i
// "Start creating free": a start into the product, unless the link goes to a marketing page about it.
const START_TEXT = /\bstart (?:creating|designing|building|writing|editing)(?: (?:for free|free|now))?\b/i
const MARKETING_PATH = /^\/(?:blog|templates|gallery|features|docs|learn|examples)(?:\/|$)/i
// Merchandise is not the product.
const MERCH = /\b(merch|swag|apparel|t-?shirts?|shirts?|hoodies?|mugs?|stickers?)\b/i
const SIGNUP_HREF = /\/(sign-?up|register|join|get-started|start|onboarding)(\/|$|\?)/i
// Sales, event and newsletter calls to action are not a buyer signing up. "Sales" vetoes link text; in a path only as a
// sales-contact shape, so a product page such as /sales-tracking is not vetoed.
const NOT_SIGNUP = /\b(demo|webinar|event|newsletter|subscribe|contact|talk|book|schedule|waitlist|meeting)\b|zoom\.us|calendly\.com|eventbrite\.|lu\.ma\/|\/meetings\//i
const SALES_PATH = /(?:contact|talk)-?(?:to-?)?sales|sales-(?:call|demo)/i
// App stores are self-serve: installing is signing up. Exact store host and a listing path, never the store's home.
/** A store listing's identity (its slug or package id), from the fields each store uses; null for anything else. */
function listingId(u: URL): string | null {
  const seg = u.pathname.split("/").filter(Boolean)
  switch (u.hostname) {
    case "apps.shopify.com": return seg.length === 1 ? seg[0] : null
    case "wordpress.org": return seg[0] === "plugins" && seg.length === 2 ? seg[1] : null
    // The 32-letter extension id is required; a tab after it ("/reviews") is the same listing.
    case "chromewebstore.google.com": return seg[0] === "detail" && /^[a-p]{32}$/.test(seg[2] ?? "") ? seg[1] : null
    case "chrome.google.com": return seg[0] === "webstore" && seg[1] === "detail" && /^[a-p]{32}$/.test(seg[3] ?? "") ? seg[2] : null
    case "apps.apple.com": { const i = seg.indexOf("app"); return i >= 0 && /^id\d+$/.test(seg[i + 2] ?? "") ? seg[i + 1] : null }
    case "play.google.com": return u.pathname === "/store/apps/details" ? u.searchParams.get("id") : null
    case "marketplace.atlassian.com": return seg[0] === "apps" && /^\d+$/.test(seg[1] ?? "") ? seg[2] ?? null : null
    case "marketplace.visualstudio.com": return u.pathname === "/items" ? u.searchParams.get("itemName") : null
    case "addons.mozilla.org": {
      // /<locale>/firefox/addon/<slug>/ or /firefox/addon/<slug>/
      const i = seg.indexOf("addon")
      return (i === 1 || i === 2) && /^(firefox|android)$/.test(seg[i - 1]) && seg.length === i + 2 ? seg[i + 1] : null
    }
    default: return null
  }
}
// A listing that integrates the brand into another product is someone else's ("integration-for-rank-math").
const THIRD_PARTY = new Set(["integration", "integrations", "connector", "for", "bridge", "sync"])
/**
 * The brand's own store listing: the listing's identity carries the brand's name as whole
 * words ("seo-by-rank-math" for rankmath.com, "com.datadog.app" for datadog.com). Query
 * parameters other than the store's id field, substrings ("bread" for read.com) and
 * integrations by other developers do not count.
 */
const appStore = (href: string, base: string) => {
  const u = new URL(href)
  const id = u.protocol === "https:" ? listingId(u) : null
  const name = parseDomain(new URL(base).hostname, { allowPrivateDomains: true }).domainWithoutSuffix?.toLowerCase().replace(/[^a-z0-9]/g, "")
  if (!id || !name || id.length > 200) return false
  const words = decoded(id).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  if (words.some((w) => THIRD_PARTY.has(w))) return false
  // The name must start and end on word boundaries of the joined words: linear in the identity's length.
  const joined = words.join("")
  const bounds = new Set<number>([0])
  words.reduce((at, w) => (bounds.add(at + w.length), at + w.length), 0)
  for (let at = joined.indexOf(name); at >= 0; at = joined.indexOf(name, at + 1)) {
    if (bounds.has(at) && bounds.has(at + name.length)) return true
  }
  return false
}
/**
 * A link on the brand's own page to another host of the brand: the same registrable domain
 * ("ads.snapchat.com" from "forbusiness.snapchat.com"), or the same distinctive name under
 * another suffix ("app.n8n.cloud" from "n8n.io"). A name that is a dictionary word ("brand")
 * does not prove the brand across suffixes; without a dictionary, nothing does.
 */
function brandHost(href: string, base: string, words: Set<string> | null = systemWords()): boolean {
  if (sameSite(href, base)) return true
  const [a, b] = [href, base].map((u) => parseDomain(new URL(u).hostname, { allowPrivateDomains: true }))
  if (!a.domain || !b.domain) return false
  if (a.domain === b.domain) return true
  const name = b.domainWithoutSuffix?.toLowerCase() ?? ""
  return name === a.domainWithoutSuffix?.toLowerCase() && name.length >= 3 && !!words && !words.has(name.replace(/-/g, ""))
}
/** `words`: the dictionary that decides which names are distinctive across suffixes (injected in tests; none fails closed). */
export function selfServe(html: string, base: string, words: Set<string> | null = systemWords()): string | null {
  const found = links(html, base).find((l) => {
    const target = decoded(l.href)
    if (NOT_SIGNUP.test(l.text) || NOT_SIGNUP.test(target) || /\bsales\b/i.test(l.text)) return false
    const path = new URL(l.href).pathname
    if (SALES_PATH.test(decoded(path))) return false
    if (appStore(l.href, base)) return true
    if (MERCH.test(l.text) || MERCH.test(decoded(path))) return false
    const start = START_TEXT.test(l.text) && !MARKETING_PATH.test(decoded(path))
    return brandHost(l.href, base, words) && (SIGNUP_TEXT.test(l.text) || start || SIGNUP_HREF.test(path))
  })
  return found ? `${found.text || "link"} → ${found.href}`.slice(0, 120) : null
}

const TERMS_LINK = /(affiliate|partner|referral|ambassador|program)[\w\s-]{0,30}(terms|agreement|conditions)|(terms|agreement|conditions)[\w\s-]{0,30}(affiliate|partner|referral|ambassador|program)/i
// Bounded figures ("30%", "$25"), never a run of digits matched from every position.
// Statistics are not rates: an amount followed by "+" ("$25,000+ earned", as "$2B+" is not a price), and a share of
// people ("100% of clients happy"), which stat cards put right next to commission wording.
const FIGURE = String.raw`(?:(?<![\d.])\d{1,4}(?:\.\d{1,2})?\s?%(?!\s+of\s+(?:our\s+|all\s+)?(?:clients|customers|users|partners|merchants|businesses|companies|members|creators)\b)|[$€£]\s?\d[\d.,]{0,9}(?![\d.,])(?!\s?\+))`
// A figure next to commission wording: "recurring" or "per sale" alone is also how a subscription is billed.
// The commission figure: next to commission wording, after "earn" or "pays you", or as a share of what referrals pay
// ("30% of every payment"). Not a discount ("25% off"), a product claim ("99.9% uptime") or a price ("$29 per
// customer"); generic verbs ("customers get 99% satisfaction") do not make a figure a commission.
const NOT_RATE = String.raw`(?!\s*(?:off|discount|uptime|accura\w*|faster|fewer|more|less|cheaper|savings?|satisf\w*)\b)`
const COMMISSION_FIGURE = new RegExp([
  String.raw`${FIGURE}[^.]{0,60}\b(?:commission|revenue share|rev share)`,
  String.raw`\b(?:(?:commission|revenue share|rev share)\w*|earn(?:s|ing)?|pays? you)\b[^.]{0,40}?${FIGURE}${NOT_RATE}`,
  String.raw`${FIGURE}\s+(?:of|from|on)\s+(?:each|every|all|the|their|any|what)\b[^.]{0,30}?\b(?:sales?|payments?|purchases?|subscriptions?|orders?|referrals?|revenue|spend|they pay)\b`,
].join("|"), "i")
// A concrete term carries its value: a number of days, an amount, a schedule, a named method, or an approval rule.
const PAY_METHOD = String.raw`(?:paypal|wise|payoneer|stripe|tipalti|revolut|venmo|bank(?: transfer| account)?|wire(?: transfer)?|ach|direct deposit|crypto(?:currency)?|usdt|usdc|bitcoin|btc|check|cheque)\b`
// A schedule, not a noun it qualifies: "a monthly plan" is what the buyer pays, "monthly performance bonuses" are not payouts.
const SCHEDULE = String.raw`(?:monthly|weekly|bi-?weekly|twice a month|every (?:month|week|two (?:weeks|months)|\d{1,3} (?:days|weeks|months))|(?:on )?the \d{1,2}(?:st|nd|rd|th)\b(?: (?:day )?of (?:the|each|every) month)?|(?:on )?the (?:first|last|end)(?: business)? (?:day )?of (?:the|each|every) month)\b(?!\s+(?:plans?|subscriptions?|subscribers?|fees?|prices?|pricing|billing|payments? plan|performance|bonus(?:es)?|reports?|newsletters?|updates?|webinars?|challenges?))`
// Up to n words (letters, digits, currency, apostrophes): the gap a term may span; without amounts for payout schedules,
// so an earnings calculator ("Payout $348 Monthly") is not a schedule.
const gap = (n: number, amounts = true) => String.raw`(?:\s+${amounts ? "[a-z0-9$€£'’:,;()-]+" : "[a-z'’:,;()-]+"}){0,${n}}?`
const METHOD_OR_SCHEDULE = String.raw`(?:${SCHEDULE}|(?:via|through|by|with|to your)\s+(?:direct )?${PAY_METHOD})`
const any = (parts: string[]) => new RegExp(parts.join("|"), "i")
/**
 * Each kind of concrete term is read inside one sentence, with what that sentence must not be about: a cookie in a
 * consent banner, an approval of jobs or loans, a payment that is the buyer's bill. Terms that also describe buyers
 * ("paid monthly") or jobs ("applications are reviewed") need a sentence that names the program.
 */
// Program words: an ambiguous approval or payment phrase counts only near one.
const PROGRAM_WORDS = /\b(affiliat|partner|referr|ambassador|program|commission|payout|earn|reward)/i
/**
 * `needs`: a program word in the same sentence. `near`: a program word within 300 characters (page text glues menus
 * into sentences, so "near" is the honest unit). `denies`: read within `window` characters around the term, across
 * sentence boundaries ("We use cookies… These cookies expire after 30 days"). `subject`: the words just before it.
 */
const TERM_KINDS: { term: RegExp; needs?: RegExp; near?: RegExp; denies?: RegExp; window?: number; subject?: RegExp }[] = [
  {
    // "30-day cookie", "90-Days Cookie Duration", "120 days' cookie tracking", "Cookie window 60 days", "cookie duration is 24 hours".
    term: any([
      String.raw`\b\d{1,4}[- ]?(?:days?|hours?)['’]?${gap(2)}\s+(?:cookies?|attribution|tracking)\b`,
      String.raw`\b(?:cookies?|attribution)\b${gap(8)}\s+\d{1,4}[\s-]?(?:days?|months?|hours?)\b`,
    ]),
    // "We use cookies to track your referrals" introduces the referral cookie, not a banner.
    denies: /\b(consent|accept|we use cookies(?! to track (?:your )?(?:referrals?|clicks?|affiliate|sales))|cookie (?:settings|preferences)|remember|preferences?|session|analytics|essential|necessary|functional|browsing experience)\b/i,
    window: 100,
  },
  {
    // Words that are about paying the affiliate: payouts, get paid, paid out, cash out, commissions with a payout verb.
    term: any([
      String.raw`\b(?:payouts?|get paid|paid out|cash(?:-| )?out)\b${gap(6, false)}\s+${METHOD_OR_SCHEDULE}`,
      String.raw`\bcommissions?\b${gap(6)}\s+(?:are|is|will be|get|gets)\s+(?:paid|sent|credited|distributed|issued|transferred|deposited)(?:\s+out)?${gap(4)}\s+${METHOD_OR_SCHEDULE}`,
      String.raw`\b(?:receive|get) (?:your )?(?:monthly |weekly )?commissions?(?: payments?)?${gap(3, false)}\s+${SCHEDULE}`,
      String.raw`\b(?:receive|get) (?:your )?(?:monthly|weekly) commissions?\b`,
      String.raw`\b(?:minimum payout|payout minimum|payout threshold|payment minimum|minimum threshold)[^.]{0,40}(?:[$€£]\s?\d|\b\d[\d,.]{0,8}\s?(?:USD|EUR|GBP|ZAR|dollars?)\b)`,
      String.raw`\b[A-Z]{3}\s?\d[\d,.]{0,8} minimum payout`,
      String.raw`\bno minimum (?:payout|threshold)`,
      String.raw`\bnet[- ]?(?:15|30|45|60|90)\b[^.]{0,30}\b(?:payouts?|payments?|paid)\b|\b(?:payouts?|payments?|paid)\b[^.]{0,30}\bnet[- ]?(?:15|30|45|60|90)\b`,
      String.raw`\b${PAY_METHOD} (?:payouts?|payments?)`,
    ]),
  },
  {
    // "Payments are made every two months": the affiliate's money, unless the sentence is the buyer's bill.
    term: any([String.raw`\bpayments? (?:are|is|will be) (?:made|sent|processed|issued)\b${gap(6, false)}\s+${METHOD_OR_SCHEDULE}`]),
    near: PROGRAM_WORDS,
    denies: /\b(your plan|billing|billed|invoices?|charged|credit cards?)\b/i,
    window: 200,
    subject: /\b(customers?|clients?|subscriptions?|subscribers?|buyers?|users?|plan|tenants?|members?)['’]?s?\s*$/i,
  },
  {
    // Approval rules: "no automatic approval", "automatically approved", "once approved", unless jobs, loans or documents.
    term: any([
      String.raw`\bapproval (?:is )?required`,
      String.raw`\brequires? (?:manual )?approval`,
      String.raw`\b(?:manual|instant|automatic) approval`,
      String.raw`\b(?:automatically|instantly|manually) approved`,
      String.raw`\bapproved within \d{1,3} (?:hours?|days?|business days?)`,
      String.raw`\bonce (?:you(?:'re|’re| are) )?approved\b`,
    ]),
    near: PROGRAM_WORDS,
    denies: /\b(jobs?|careers?|hiring|candidates?|employment|applicants?|recruit\w*|positions?|loans?|credit (?:approval|checks?|scores?|applications?|lines?)|mortgages?|expenses?|leave requests?|time off|documents?|invoices?|budgets?|timesheets?|purchase orders?)\b/i,
    window: 200,
  },
  {
    term: any([
      String.raw`\bapplications? (?:are|is|will be|get) (?:manually |personally )?(?:reviewed|approved)`,
      String.raw`\bwe review (?:every|each|all) applications?`,
      String.raw`\b(?:paid|payments?)\b${gap(8)}\s+${METHOD_OR_SCHEDULE}`,
      String.raw`\b${PAY_METHOD} account\b[^.]{0,30}\b(?:get|be) paid`,
    ]),
    needs: PROGRAM_WORDS,
    // Not "subscriptions": affiliate pages name them constantly ("commission on subscriptions"); the subject check
    // below catches the buyer's own payments.
    denies: /\b(jobs?|careers?|hiring|candidates?|employment|applicants?|loans?|your plan|billing|billed|invoices?|charged)\b/i,
    window: 200,
    subject: /\b(customers?|clients?|subscriptions?|subscribers?|buyers?|users?|plan|tenants?|members?)['’]?s?\s*$/i,
  },
]
const TERMS_ALL = TERM_KINDS.map((kind) => ({ ...kind, term: new RegExp(kind.term.source, "gi") }))
/** The first concrete term, in reading order, that passes its kind's rules; with its position in `text`. */
function concreteTerm(text: string): { index: number; 0: string } | null {
  let at = 0
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    let best: { index: number; 0: string } | null = null
    for (const kind of TERMS_ALL) {
      if (kind.needs && !kind.needs.test(sentence)) continue
      for (const m of sentence.matchAll(kind.term)) {
        if (best && m.index! >= best.index) break
        const abs = at + m.index!
        const w = kind.window ?? 100
        if (kind.denies?.test(text.slice(Math.max(0, abs - w), abs + m[0].length + w))) continue
        if (kind.near && !kind.near.test(text.slice(Math.max(0, abs - 300), abs + m[0].length + 300))) continue
        if (kind.subject?.test(text.slice(Math.max(0, abs - 30), abs))) continue
        best = { index: m.index!, 0: m[0] }
        break
      }
    }
    if (best) return { index: at + best.index, 0: best[0] }
    at += sentence.length + 1
  }
  return null
}

// Terms announced, not published: an announcement within the window cancels the inline reading (precision first).
const NOT_YET = /coming soon|to be announced|\btb[ad]\b/i
/**
 * A link to the program's terms or agreement (a site-wide Terms of Service link
 * does not count), or terms published on the page itself: a commission figure plus one
 * concrete term (decision 20/10 18:00), and not an announcement that they are coming.
 */
export function termsLink(html: string, base: string): string | null {
  const found = links(html, base).find((l) => TERMS_LINK.test(l.text) || TERMS_LINK.test(decoded(new URL(l.href).pathname).replace(/[-_/]/g, " ")))
  if (found) return `${found.text || "link"} → ${found.href}`.slice(0, 120)
  // The page's own summary counts as its text ("earn up to 30% CPA!" in the meta description).
  const meta = /<meta\s+[^>]{0,200}?name=["']description["'][^>]{0,40}?content=["']([^"']{0,500})["']/i.exec(html)?.[1] ?? ""
  const text = `${meta} ${visibleText(html)}`
  // Markers found once over the whole text, then compared by distance: a window slice could cut one in half.
  const markers = [...text.matchAll(new RegExp(NOT_YET.source, "gi"))].map((m) => m.index!)
  const announced = (at: number) => markers.some((m) => Math.abs(m - at) <= 150)
  // A terms heading alone ("partnership terms") is not published terms: the figure and the concrete term are.
  const figure = COMMISSION_FIGURE.exec(text)
  const concrete = concreteTerm(text)
  return figure && concrete && !announced(figure.index) && !announced(concrete.index) ? `on page: ${figure[0]} · ${concrete[0]}`.slice(0, 120) : null
}

/**
 * Core Web Vitals from a PageSpeed v5 result. Field data (CrUX) decides when it
 * shows a failure, or covers LCP, INP and CLS all good; partial good field data
 * falls back to lab thresholds, where Total Blocking Time stands in for INP.
 */
export function cwv(psi: { loadingExperience?: { metrics?: Record<string, { category?: string }> }; lighthouseResult?: { audits?: Record<string, { numericValue?: number }> } }): Check {
  const field = psi.loadingExperience?.metrics ?? {}
  const keys = ["LARGEST_CONTENTFUL_PAINT_MS", "INTERACTION_TO_NEXT_PAINT", "CUMULATIVE_LAYOUT_SHIFT_SCORE"]
  const present = keys.filter((k) => field[k]?.category)
  const bad = present.filter((k) => field[k].category !== "FAST")
  if (bad.length) return { state: "not_met", evidence: `field: ${bad.join(", ")} not good` }
  if (present.length === keys.length) return { state: "met", evidence: "field: LCP, INP, CLS good" }
  const audits = psi.lighthouseResult?.audits
  const lcp = audits?.["largest-contentful-paint"]?.numericValue
  const cls = audits?.["cumulative-layout-shift"]?.numericValue
  const tbt = audits?.["total-blocking-time"]?.numericValue
  if (lcp == null || cls == null || tbt == null) return { state: "unknown", evidence: "no field or lab data" }
  const ok = lcp <= 2500 && cls <= 0.1 && tbt <= 200
  return { state: ok ? "met" : "not_met", evidence: `lab: LCP ${Math.round(lcp)}ms, CLS ${cls.toFixed(2)}, TBT ${Math.round(tbt)}ms (INP proxy)` }
}

// ---------- one program ----------

export type Program = { slug: string; name?: string | null; url?: string | null; signup_url?: string | null; network?: string | null; status?: string }
export type Result = { slug: string; network: string; checkedAt: string; checks: Record<string, Check> }

const unknown = (why: string): Check => ({ state: "unknown", evidence: why })
const isPage = (p: Page | Refused): p is Page => "status" in p
const gone = (status: number) => status === 404 || status === 410

export async function scanProgram(p: Program, found: { candidates: string[] } = { candidates: [] }): Promise<Result> {
  const checks: Record<string, Check> = {}
  const read: string[] = []
  if (!p.url) {
    for (const id of ["P1", "P2", "P3", "P5"]) checks[id] = unknown("no brand URL")
  } else {
    const home = await politeGet(p.url)
    if (!isPage(home) || home.status !== 200) {
      const why = isPage(home) ? `brand page HTTP ${home.status}` : home.refused
      for (const id of ["P1", "P2", "P3", "P5"]) checks[id] = unknown(why)
    } else {
      // A linked pricing page, else the conventional /pricing path (one request).
      const pricingUrl = pricingLink(home.html, home.url) ?? new URL("/pricing", home.url).href
      const fetched = await politeGet(pricingUrl)
      const pricing = isPage(fetched) && fetched.status === 200 ? fetched : null
      read.push(p.url, home.url, pricingUrl, ...(isPage(fetched) ? [fetched.url] : []))
      // Absent (404/410) is a reading; refused, blocked or erroring is not, so a miss stays unknown.
      const unread = pricing || (isPage(fetched) && gone(fetched.status)) ? null : isPage(fetched) ? `pricing page HTTP ${fetched.status}` : `pricing page: ${fetched.refused}`
      // A page longer than the read limit was not read in full: what was found counts, a miss is unknown.
      const cut = home.truncated || pricing?.truncated ? "page longer than the read limit" : null
      const miss = (fallback: string): Check => (unread ? unknown(unread) : cut ? unknown(cut) : { state: "not_met", evidence: fallback })
      const homeText = visibleText(home.html)
      const pricingText = pricing ? visibleText(pricing.html) : ""
      const price = (pricing && hasPrice(pricingText, pricing.html)) || hasPrice(homeText, home.html)
      checks.P1 = price ? { state: "met", evidence: price } : miss(pricing ? `${pricing.url}: no price in the HTML` : "no pricing page found")
      const trial = hasTrial(homeText) ?? hasTrial(pricingText)
      checks.P2 = trial ? { state: "met", evidence: trial } : miss("no trial or free plan stated")
      const signup = selfServe(home.html, home.url) ?? (pricing ? selfServe(pricing.html, pricing.url) : null)
      checks.P3 = signup ? { state: "met", evidence: signup } : miss("no sign-up link")
      checks.P5 = unknown("PageSpeed not run")
      found.candidates = discoveryCandidates([home, ...(pricing ? [pricing] : [])], read)
    }
  }
  checks.P6 = unknown("DataForSEO not run")
  if (!p.signup_url) {
    checks.A1 = unknown("no program URL")
    checks.A2 = unknown("no program URL")
  } else {
    const page = await politeGet(p.signup_url)
    // Phase 2 never re-reads the listed program page either.
    found.candidates = found.candidates
      .filter((u) => normalUrl(u) !== normalUrl(p.signup_url!) && (!isPage(page) || normalUrl(u) !== normalUrl(page.url)))
    if (!isPage(page)) {
      checks.A1 = unknown(page.refused)
      checks.A2 = unknown(page.refused)
    } else if (page.status === 200) {
      const title = /<title[^>]*>([\s\S]{0,200}?)<\/title>/i.exec(page.html)?.[1] ?? ""
      const toHome = new URL(page.url).pathname.replace(/\/$/, "") === "" && new URL(p.signup_url).pathname.replace(/\/$/, "") !== ""
      if (/\b(404|not found)\b/i.test(title)) {
        checks.A1 = { state: "not_met", evidence: `soft 404 at ${page.url}` }
        checks.A2 = unknown("program page not live")
      } else if (toHome) {
        // The program URL now lands on the homepage: the program may be gone, or moved.
        checks.A1 = unknown(`program URL redirects to the homepage (${page.url})`)
        checks.A2 = unknown("program URL redirects to the homepage")
      } else {
        checks.A1 = { state: "met", evidence: page.url }
        const terms = termsLink(page.html, page.url)
        checks.A2 = terms ? { state: "met", evidence: terms }
          : page.truncated ? unknown("program page longer than the read limit")
          : { state: "not_met", evidence: "no link to program terms" }
      }
    } else {
      // Gone (404/410) is not live; 401/403/429 is bot protection and 5xx may pass, so those stay unknown.
      checks.A1 = gone(page.status) ? { state: "not_met", evidence: `HTTP ${page.status} at ${page.url}` } : unknown(`program page HTTP ${page.status}`)
      checks.A2 = unknown("program page not live")
    }
  }
  found.candidates = found.candidates.slice(0, DISCOVERY_PAGES)
  return { slug: p.slug, network: p.network ?? "unknown", checkedAt: new Date().toISOString(), checks }
}

// ---------- phase 2: bounded discovery (P1 / P2 / P3) ----------

const PRICING_SEGMENTS = new Set(["pricing", "plans", "buy", "store"])
const START_SEGMENTS = new Set(["trial", "free-trial", "get-started", "download"])
export const DISCOVERY_PAGES = 3
/** Scheme, host and path, without query, fragment or trailing slash: two links to one page are one candidate. */
const normalUrl = (url: string) => {
  try {
    const u = new URL(url)
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}`
  } catch {
    return url
  }
}

/**
 * Pages worth reading for P1 / P2 / P3 that phase 1 did not read: links on the homepage and pricing page to a brand
 * host whose path has a pricing segment (kind 1) or a trial / start segment (kind 2). Kind 1 first, then the shorter
 * path, then A–Z; at most three. "shop" is not a candidate (usually merchandise on software sites).
 */
export function discoveryCandidates(pages: { html: string; url: string }[], read: string[], words: Set<string> | null = systemWords()): string[] {
  if (!pages.length) return []
  const seen = new Set(read.map(normalUrl))
  const kinds = new Map<string, number>()
  for (const page of pages) {
    for (const l of links(page.html, page.url)) {
      let u: URL
      try {
        u = new URL(l.href)
      } catch {
        continue
      }
      if (!/^https?:$/.test(u.protocol) || !brandHost(l.href, pages[0].url, words)) continue
      const key = normalUrl(l.href)
      if (seen.has(key) || kinds.has(key)) continue
      const segments = u.pathname.toLowerCase().split("/").filter(Boolean)
      const kind = segments.some((s) => PRICING_SEGMENTS.has(s)) ? 1 : segments.some((s) => START_SEGMENTS.has(s)) ? 2 : 0
      if (kind) kinds.set(key, kind)
    }
  }
  const path = (u: string) => new URL(u).pathname
  return [...kinds]
    .sort(([a, ka], [b, kb]) => ka - kb || path(a).length - path(b).length || (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, 50) // the caller removes the program page, then takes the first three
    .map(([u]) => u)
}

/** The page's whole <title> text, by a forward scan (no regex over the document). */
export function titleOf(html: string): string {
  const lower = html.toLowerCase()
  for (let at = lower.indexOf("<title"); at !== -1; at = lower.indexOf("<title", at + 6)) {
    const next = lower[at + 6]
    if (next !== ">" && next !== " " && next !== "\t" && next !== "\n" && next !== "\r" && next !== "/") continue
    const open = lower.indexOf(">", at)
    if (open === -1) return ""
    const close = lower.indexOf("</title", open)
    return html.slice(open + 1, close === -1 ? html.length : close)
  }
  return ""
}

/**
 * Reads the candidate pages for the checks phase 1 did not meet. Only positive readings come back: a page that fails,
 * redirects off the brand, or is about merchandise adds nothing, and nothing here turns a reading into unknown.
 */
export async function discover(p: Program, candidates: string[], wanted: ("P1" | "P2" | "P3")[], words: Set<string> | null = systemWords()): Promise<Record<string, Check>> {
  const out: Record<string, Check> = {}
  for (const url of candidates.slice(0, DISCOVERY_PAGES)) {
    if (wanted.every((id) => out[id])) break
    const page = await politeGet(url)
    if (!isPage(page) || page.status !== 200 || !p.url || !brandHost(page.url, p.url, words)) continue
    if (MERCH.test(decoded(new URL(page.url).pathname)) || MERCH.test(titleOf(page.html))) continue
    const text = visibleText(page.html)
    const on = (evidence: string): Check => ({ state: "met", evidence: `${evidence} (on ${page.url})`.slice(0, 160) })
    if (wanted.includes("P1") && !out.P1) {
      // Visible prices only: a JSON-LD offer on a discovered page cannot be checked against the merchandise guard.
      const price = hasPrice(text, "", (before) => MERCH.test(before))
      if (price) out.P1 = on(price)
    }
    if (wanted.includes("P2") && !out.P2) {
      const trial = hasTrial(text)
      if (trial) out.P2 = on(trial)
    }
    if (wanted.includes("P3") && !out.P3) {
      const signup = selfServe(page.html, page.url, words)
      if (signup) out.P3 = on(signup)
    }
  }
  return out
}

let psiStopped: string | null = null
/** PageSpeed for the brand page, after re-checking that page under today's rules: a cached result never authorises a request. */
export async function runPsi(p: Program, r: Result, permit: () => Promise<void> = async () => {}): Promise<void> {
  if (psiStopped || !p.url) return
  const page = await politeGet(p.url)
  if (!isPage(page) || page.status !== 200) {
    r.checks.P5 = unknown(isPage(page) ? `brand page HTTP ${page.status}` : page.refused)
    return
  }
  const key = process.env.PAGESPEED_API_KEY ? `&key=${encodeURIComponent(process.env.PAGESPEED_API_KEY)}` : ""
  const api = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?strategy=mobile&category=performance&url=${encodeURIComponent(page.url)}${key}`
  try {
    await permit() // the run's shared pace: one PageSpeed call per second at most
    // The API is never followed through a redirect: the next hop would skip the blocked-host check.
    const res = await fetcher(api, { redirect: "manual", signal: AbortSignal.timeout(120000) })
    if (REDIRECTS.has(res.status)) {
      await res.body?.cancel()
      r.checks.P5 = unknown(`PageSpeed redirected (HTTP ${res.status})`)
      return
    }
    if (res.status === 429) {
      await res.body?.cancel()
      psiStopped = `PageSpeed 429 at ${p.slug}`
      return
    }
    r.checks.P5 = res.ok ? cwv(JSON.parse((await readCapped(res, PSI_BYTES)).text)) : (await res.body?.cancel(), unknown(`PageSpeed HTTP ${res.status}`))
  } catch (error) {
    r.checks.P5 = unknown(`PageSpeed failed (${(error as Error).name})`)
  }
}

// ---------- run + report ----------

// ---------- P6: DataForSEO search volume ----------

/** Buyer demand: at least 1,000 searches a month (in the dry run, 10, the smallest bucket, passed 97% of programs). */
export const P6_MIN_VOLUME = 1000
export const SEO_CAP_USD = 1
/** Assumed ceiling per request before the first real cost is known (one task, up to 1,000 keywords). */
const SEO_MAX_PER_REQUEST_USD = 0.15
const SEO_BATCH = 1000
const SEO_URL = "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live"

/**
 * The brand as a Google Ads keyword: the name without its parenthesised part,
 * diacritics folded, only letters, digits, spaces, dots, apostrophes and hyphens
 * (Google Ads rejects other symbols), at most 10 words and 80 characters. null when nothing is left.
 */
// Only suffixes that are never part of a brand name: "Co", "Company", "AB" and the like can be
// ("The Browser Company", "Brit + Co"), so they stay.
const LEGAL_SUFFIX = new Set(["inc", "llc", "ltd", "limited", "gmbh", "corp", "plc", "srl", "pty"])

export function seoKeyword(name: string | null | undefined): string | null {
  if (!name) return null
  const plain = name.replace(/\([^)]*\)/g, " ").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  const words = plain.replace(/[^a-z0-9.' -]/g, " ").split(" ").filter((w) => /[a-z0-9]/.test(w))
  // A legal suffix is not what buyers type: "Aircall Inc." is searched as "aircall".
  while (words.length > 1 && LEGAL_SUFFIX.has(words[words.length - 1].replace(/\.$/, ""))) words.pop()
  words.splice(10)
  const keyword = words.join(" ").slice(0, 80).trim()
  return keyword || null
}

let dictionary: Set<string> | null | undefined
/** The system word list, when the machine has one; without it no name counts as an ordinary word. */
function systemWords(): Set<string> | null {
  if (dictionary === undefined) {
    try {
      dictionary = new Set(readFileSync("/usr/share/dict/words", "utf8").toLowerCase().split("\n"))
    } catch {
      dictionary = null
    }
  }
  return dictionary
}

/**
 * What to ask DataForSEO for a program: its brand keyword, or, when the brand is a
 * single ordinary word ("pitch", "finally"), its domain ("pitch.com"), because the
 * word's volume measures the word, not the brand.
 */
export function seoQuery(p: { name?: string | null; url?: string | null }, words: Set<string> | null = systemWords()): string | null {
  const keyword = seoKeyword(p.name)
  if (!keyword || keyword.includes(" ") || !words?.has(keyword) || !p.url) return keyword
  try {
    return seoKeyword(new URL(p.url).hostname.replace(/^www\./, "")) ?? keyword
  } catch {
    return keyword
  }
}

export function p6Check(keyword: string, volume: number | null | undefined): Check {
  if (volume == null) return { state: "not_met", evidence: `"${keyword}": no measurable volume` }
  return volume >= P6_MIN_VOLUME
    ? { state: "met", evidence: `"${keyword}": ${volume}/mo worldwide` }
    : { state: "not_met", evidence: `"${keyword}": ${volume}/mo worldwide` }
}

/** costUsd is the cost DataForSEO reported (null when it is missing or not a valid number); the cap counts at least the reservation. */
export type SeoCost = { at: string; keywords: number; costUsd: number | null; status: number | string }

/**
 * Search volume for each keyword, batched. The cap counts every request at
 * max(reservation, reported cost) — SEO_MAX_PER_REQUEST_USD, above the $0.075–0.09 DataForSEO
 * bills one live task today — and a request is sent only when that still fits, so a run sends
 * at most floor(cap / reservation) requests. A reported cost above the reservation (a price
 * change) stops the run at the first sign; no client can stop the provider billing that one
 * request. Volumes are read only from a fully successful response, and only an explicit null or
 * a finite non-negative number counts; every other keyword is left out (its check stays unknown).
 */
export async function searchVolumes(keywords: string[], auth: string, capUsd = SEO_CAP_USD): Promise<{ volumes: Map<string, number | null>; costs: SeoCost[]; stopped: string | null }> {
  const volumes = new Map<string, number | null>()
  const costs: SeoCost[] = []
  const reserve = SEO_MAX_PER_REQUEST_USD
  let spent = 0
  const unique = [...new Set(keywords)]
  for (let i = 0; i < unique.length; i += SEO_BATCH) {
    if (spent + reserve > capUsd) return { volumes, costs, stopped: `cap $${capUsd} reached after $${spent.toFixed(4)}` }
    const batch = unique.slice(i, i + SEO_BATCH)
    let status: number | string = "no response"
    let body: { status_code?: number; cost?: unknown; tasks?: { cost?: unknown; status_code?: number; result?: { keyword?: unknown; search_volume?: unknown }[] | null }[] } = {}
    try {
      const res = await fetcher(SEO_URL, {
        method: "POST", redirect: "manual", signal: AbortSignal.timeout(120000),
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
        body: JSON.stringify([{ keywords: batch }]),
      })
      status = res.status
      body = JSON.parse((await readCapped(res, PSI_BYTES)).text)
    } catch (error) {
      status = `${status} (${(error as Error).name})`
    }
    const task = body?.tasks?.[0]
    const success = status === 200 && body?.status_code === 20000 && task?.status_code === 20000
    // The reported cost: the larger of the request and task figures, null if either is not a valid number.
    const raw = [body?.cost, task?.cost].filter((c) => c !== undefined)
    const numbers = raw.filter((c): c is number => typeof c === "number" && Number.isFinite(c) && c >= 0)
    const reported = raw.length > 0 && numbers.length === raw.length ? Math.max(...numbers) : null
    // Any real figure above the reservation, at either level, is a price change, even if the other level is garbled.
    const highest = numbers.length ? Math.max(...numbers) : 0
    spent += Math.max(reserve, highest)
    costs.push({ at: new Date().toISOString(), keywords: batch.length, costUsd: reported, status: task?.status_code ?? body?.status_code ?? status })
    if (highest > reserve) return { volumes, costs, stopped: `price changed: $${highest} for one request` }
    if (success && Array.isArray(task.result)) {
      for (const row of task.result) {
        if (typeof row?.keyword !== "string" || !("search_volume" in row)) continue
        const v = row.search_volume
        if (v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0)) volumes.set(row.keyword.toLowerCase(), v as number | null)
      }
    }
  }
  return { volumes, costs, stopped: null }
}

/**
 * Recomputes P6 for every result under today's rule (threshold and query), so a
 * cached answer from an older rule never survives a --seo run.
 */
export async function refreshP6(results: Result[], queries: Map<string, string | null>, auth: string): Promise<{ costs: SeoCost[]; stopped: string | null }> {
  const { volumes, costs, stopped } = await searchVolumes(results.map((r) => queries.get(r.slug)).filter((k): k is string => !!k), auth)
  for (const r of results) {
    const keyword = queries.get(r.slug)
    r.checks.P6 = !keyword ? unknown("no usable brand name")
      : volumes.has(keyword) ? p6Check(keyword, volumes.get(keyword))
      : unknown(stopped ? "DataForSEO spend cap reached" : "DataForSEO returned no row")
  }
  return { costs, stopped }
}

/** A cached result, or null when the file is missing, unreadable or not a result (the program is then scanned again). */
export function readCache(file: string, slug: string): Result | null {
  try {
    const r = JSON.parse(readFileSync(file, "utf8"))
    if (r?.slug !== slug || !CHECK_IDS.every((id) => ["met", "not_met", "unknown"].includes(r.checks?.[id]?.state))) return null
    // Rebuilt from the fields we own, so nothing else in the file reaches the report.
    const check = (c: Check): Check => (typeof c.evidence === "string" ? { state: c.state, evidence: c.evidence } : { state: c.state })
    return {
      slug, network: typeof r.network === "string" ? r.network : "unknown", checkedAt: typeof r.checkedAt === "string" ? r.checkedAt : "",
      checks: Object.fromEntries(CHECK_IDS.map((id) => [id, check(r.checks[id])])),
    }
  } catch {
    return null
  }
}

/**
 * One program file, rebuilt from the four text fields the scan uses (so no other
 * shape in the YAML can reach a request or a report), or the reason it cannot be
 * read: a broken file never stops the run.
 */
export function loadProgram(path: string): Program | { slug: string; error: string } {
  const slug = path.replace(/^.*\//, "").replace(/\.yaml$/, "")
  try {
    const p = parse(readFileSync(path, "utf8"))
    const text = (v: unknown) => (typeof v === "string" ? v : null)
    if (text(p?.slug) !== slug) return { slug, error: "program file slug does not match its name" }
    return { slug, name: text(p.name), url: text(p.url), signup_url: text(p.signup_url), network: text(p.network) }
  } catch (error) {
    return { slug, error: `program file unreadable (${(error as Error).name})` }
  }
}

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

/** PageSpeed calls across all child processes are granted at least this far apart (< 1 request per second, with margin for IPC delivery). */
export const PSI_GAP_MS = 1200
let lastGrant = -Infinity
let queue: Promise<void> = Promise.resolve()
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
/**
 * Resolves when this caller may start a PageSpeed call. Grants are serialised and
 * measured on the real clock at grant time, so a late timer or a stalled event
 * loop only delays later grants; it never releases two together.
 */
export function psiSlot(): Promise<void> {
  const grant = queue.then(async () => {
    while (Date.now() - lastGrant < PSI_GAP_MS) await sleep(PSI_GAP_MS - (Date.now() - lastGrant))
    lastGrant = Date.now()
  })
  queue = grant
  return grant
}

const failed = (slug: string, network: string, why: string): Result =>
  ({ slug, network, checkedAt: new Date().toISOString(), checks: Object.fromEntries(CHECK_IDS.map((id) => [id, unknown(why)])) })

/**
 * Scans one program in a child process (same tsx flags), killed after `ms`: CPU or
 * memory spent on one hostile response ends with that program as unknown.
 */
export function scanIsolated(p: Program, mode: { scan: boolean; psi: boolean }, ms: number): Promise<{ result: Result; psi429: boolean; candidates: string[] }> {
  return new Promise((resolve) => {
    const child = fork(__filename, ["--child"], { execArgv: process.execArgv, stdio: ["ignore", "ignore", "ignore", "ipc"] })
    let done = false
    const finish = (result: Result, psi429 = false, candidates: string[] = []) => {
      if (done) return
      done = true
      clearTimeout(timer)
      child.kill("SIGKILL")
      resolve({ result, psi429, candidates })
    }
    const timer = setTimeout(() => finish(failed(p.slug, p.network ?? "unknown", `scan timed out after ${ms / 1000}s`)), ms)
    child.on("message", (m: { result?: Result; psi429?: boolean; psiReady?: boolean; candidates?: string[] }) => {
      // A child asks before each PageSpeed call; the parent paces the whole run.
      if (m.psiReady) psiSlot().then(() => child.connected && child.send({ psiGo: true }))
      else if (m.result) finish(m.result, m.psi429, Array.isArray(m.candidates) ? m.candidates : [])
    })
    child.once("exit", () => finish(failed(p.slug, p.network ?? "unknown", "scan process exited")))
    child.once("error", (error) => finish(failed(p.slug, p.network ?? "unknown", `scan process failed (${error.name})`)))
    child.send({ program: p, ...mode })
  })
}

/** Phase 2 in its own child and deadline: a timeout, crash or error returns no readings, so phase 1 stands as it was. */
export function discoverIsolated(p: Program, candidates: string[], wanted: ("P1" | "P2" | "P3")[], ms = 60_000): Promise<Record<string, Check>> {
  return new Promise((resolve) => {
    const child = fork(__filename, ["--child"], { execArgv: process.execArgv, stdio: ["ignore", "ignore", "ignore", "ipc"] })
    let done = false
    const finish = (found: Record<string, Check>) => {
      if (done) return
      done = true
      clearTimeout(timer)
      child.kill("SIGKILL")
      resolve(found)
    }
    const timer = setTimeout(() => finish({}), ms)
    child.on("message", (m: { discovered?: Record<string, Check> }) => {
      if (m.discovered) finish(Object.fromEntries(Object.entries(m.discovered).filter(([id, c]) => wanted.includes(id as "P1") && c?.state === "met")))
    })
    child.once("exit", () => finish({}))
    child.once("error", () => finish({}))
    child.send({ program: p, discover: { candidates, wanted } })
  })
}

/** Merges phase 2 into phase 1: a positive reading replaces not_met or unknown; nothing else changes. */
export function withDiscovered(r: Result, found: Record<string, Check>): Result {
  const checks = { ...r.checks }
  for (const [id, c] of Object.entries(found)) if (checks[id] && checks[id].state !== "met" && c.state === "met") checks[id] = c
  return { ...r, checks }
}

async function child() {
  // An orphan (the parent died or was stopped) must not wait forever for a PageSpeed permit.
  process.once("disconnect", () => process.exit(1))
  if (process.env.OAS_REPLAY) setFetcher(replayFetcher(process.env.OAS_REPLAY))
  else if (process.env.OAS_RECORD) setFetcher(recordingFetcher(process.env.OAS_RECORD, fetcher))
  process.once("message", async ({ program, scan, psi, discover: phase2 }: { program: Program; scan: boolean; psi: boolean; discover?: { candidates: string[]; wanted: ("P1" | "P2" | "P3")[] } }) => {
    if (phase2) {
      const discovered = await discover(program, phase2.candidates, phase2.wanted).catch(() => ({}))
      process.send!({ discovered }, () => process.exit(0))
      return
    }
    const found = { candidates: [] as string[] }
    const result = scan
      ? await scanProgram(program, found).catch((error: Error) => failed(program.slug, program.network ?? "unknown", `scan error (${error.name})`))
      : failed(program.slug, program.network ?? "unknown", "PageSpeed not run") // PageSpeed only: the caller keeps its cached checks
    const permit = () => new Promise<void>((resolve) => {
      process.on("message", function go(m: { psiGo?: boolean }) {
        if (!m?.psiGo) return
        process.off("message", go)
        resolve()
      })
      process.send!({ psiReady: true })
    })
    if (psi && result.checks.P5.evidence === "PageSpeed not run") await runPsi(program, result, permit).catch(() => {})
    process.send!({ result, psi429: psiStopped !== null, candidates: found.candidates }, () => process.exit(0))
  })
}

/**
 * --rescan-html re-reads every page (the HTML checks changed) but keeps cached PageSpeed
 * and DataForSEO readings: it makes no paid or quota call, whatever else is on the line.
 */
export function runOptions(args: string[]) {
  const rescanHtml = args.includes("--rescan-html")
  const psi = args.includes("--psi") && !rescanHtml
  const seo = args.includes("--seo") && !rescanHtml
  // PageSpeed and DataForSEO run in the parent: a replay makes no network call at all, so it refuses them.
  if (args.includes("--replay") && (psi || seo)) throw new Error("--replay cannot run --psi or --seo (they would reach the network)")
  return { rescanHtml, psi, seo }
}

async function main() {
  const args = process.argv.slice(2)
  const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null
  const flag = (name: string) => (args.includes(name) ? resolve(args[args.indexOf(name) + 1]) : null)
  // --slugs: one slug per line (a sample); --out: a separate output and cache, so a sample run never touches the registry run.
  const slugs = flag("--slugs") ? new Set(readFileSync(flag("--slugs")!, "utf8").split("\n").map((l) => l.trim()).filter(Boolean)) : null
  const record = flag("--record")
  const replay = flag("--replay")
  if (record && replay) throw new Error("--record and --replay are exclusive")
  // Children inherit the environment: they install the recording or replaying fetcher. An explicit flag clears the other.
  if (record) {
    process.env.OAS_RECORD = record
    delete process.env.OAS_REPLAY
  }
  if (replay) {
    process.env.OAS_REPLAY = replay
    delete process.env.OAS_RECORD
  }
  const { rescanHtml, psi, seo } = runOptions(args)
  if (rescanHtml && (args.includes("--psi") || args.includes("--seo"))) console.log("--rescan-html: --psi and --seo ignored")
  // Lengths only, never values: confirms the credentials reached the run before any call.
  if (psi) console.log(`PAGESPEED_API_KEY length ${process.env.PAGESPEED_API_KEY?.length ?? 0}`)
  if (seo) console.log(`DATAFORSEO_LOGIN length ${process.env.DATAFORSEO_LOGIN?.length ?? 0}, DATAFORSEO_PASSWORD length ${process.env.DATAFORSEO_PASSWORD?.length ?? 0}`)
  const out = flag("--out") ?? join(process.cwd(), ".internal", "oas", "tier1")
  const cache = join(out, "cache")
  mkdirSync(cache, { recursive: true })
  const programs = readdirSync("programs").filter((f) => f.endsWith(".yaml"))
    .filter((f) => !only || f === `${only}.yaml`)
    .filter((f) => !slugs || slugs.has(f.slice(0, -".yaml".length)))
    .slice(0, limit)
    .map((f) => loadProgram(join("programs", f)))
  const results: Result[] = []
  let next = 0
  const worker = async () => {
    while (next < programs.length) {
      const p = programs[next++]
      if ("error" in p) {
        results.push({ slug: p.slug, network: "unknown", checkedAt: new Date().toISOString(), checks: Object.fromEntries(CHECK_IDS.map((id) => [id, unknown(p.error)])) })
        continue
      }
      const file = join(cache, `${p.slug}.json`)
      // One program's failure, hang or timeout is recorded as unknown, never the end of the run.
      const cached = existsSync(file) ? readCache(file, p.slug) : null
      const wantPsi = psi && !psiStopped && (!cached || cached.checks.P5.evidence === "PageSpeed not run")
      let r: Result
      // Phase 2 after a page scan: up to three more pages for the P1 / P2 / P3 readings phase 1 did not meet.
      const phase2 = async (result: Result, candidates: string[]) => {
        const wanted = (["P1", "P2", "P3"] as const).filter((id) => result.checks[id].state !== "met")
        return wanted.length && candidates.length ? withDiscovered(result, await discoverIsolated(p, candidates, [...wanted])) : result
      }
      if (rescanHtml) {
        // A program with no cache keeps P5 and P6 as the scan leaves them (PageSpeed not run, P6 not asked).
        const { result: scanned, candidates } = await scanIsolated(p, { scan: true, psi: false }, 120_000)
        const result = await phase2(scanned, candidates)
        r = cached ? { ...result, checks: { ...result.checks, P5: cached.checks.P5, P6: cached.checks.P6 } } : result
      } else if (cached && !wantPsi) {
        r = cached
      } else {
        const { result: scanned, psi429, candidates } = await scanIsolated(p, { scan: !cached, psi: wantPsi }, wantPsi ? 240_000 : 120_000)
        const result = cached ? scanned : await phase2(scanned, candidates)
        r = cached && wantPsi ? { ...cached, checks: { ...cached.checks, P5: result.checks.P5 } } : result
        if (psi429 && !psiStopped) psiStopped = `PageSpeed 429 at ${p.slug}`
      }
      try {
        writeFileSync(file, JSON.stringify(r, null, 2) + "\n")
      } catch { /* the result still counts; it is scanned again next run */ }
      results.push(r)
      if (results.length % 25 === 0) console.log(`${results.length}/${programs.length}${psiStopped ? ` · ${psiStopped}` : ""}`)
    }
  }
  // With PageSpeed each scan waits ~30 s on Google; psiSlot caps the call rate, so more run at once.
  await Promise.all(Array.from({ length: psi ? 12 : 8 }, worker))
  if (seo) {
    const queries = new Map(programs.filter((p): p is Program => !("error" in p)).map((p) => [p.slug, seoQuery(p)]))
    const auth = Buffer.from(`${process.env.DATAFORSEO_LOGIN ?? ""}:${process.env.DATAFORSEO_PASSWORD ?? ""}`).toString("base64")
    const { costs, stopped } = await refreshP6(results, queries, auth)
    for (const r of results) {
      try {
        writeFileSync(join(cache, `${r.slug}.json`), JSON.stringify(r, null, 2) + "\n")
      } catch { /* rescanned next run */ }
    }
    const log = join(out, "dataforseo-costs.json")
    const previous: SeoCost[] = existsSync(log) ? JSON.parse(readFileSync(log, "utf8")) : []
    writeFileSync(log, JSON.stringify([...previous, ...costs], null, 2) + "\n")
    const known = costs.filter((c) => c.costUsd !== null)
    console.log(`DataForSEO: ${costs.length} requests, $${known.reduce((a, c) => a + c.costUsd!, 0).toFixed(4)} reported${known.length < costs.length ? `, ${costs.length - known.length} without a valid cost` : ""}${stopped ? ` · ${stopped}` : ""}`)
  }
  results.sort((a, b) => a.slug.localeCompare(b.slug))
  writeFileSync(join(out, "dry-run.json"), JSON.stringify(results, null, 2) + "\n")
  writeFileSync(join(out, "distribution.md"), distribution(results))
  console.log(`tier 1: ${results.length} programs → ${join(out, "distribution.md")}${psiStopped ? ` · ${psiStopped}` : ""}`)
}

if (process.argv[1]?.endsWith("oas-tier1.ts")) {
  if (process.argv.includes("--child")) child()
  else main()
}
