#!/usr/bin/env tsx
/**
 * extract-commission-candidates — machine-read affiliate terms into candidates.
 *
 * Produces candidates, never truth. A candidate reaches a program YAML only
 * after a human or an independent check confirms it; a candidate that
 * contradicts a verified entry is a staleness alarm, not a correction. The
 * registry's rule stands: empty over wrong.
 *
 * The pipeline is three stages, and the order is the economics:
 *
 *   1. probe   (free)       curl candidate pages: the YAML signup_url first,
 *                           then same-site links on the brand's homepage whose
 *                           text or path names an affiliate, referral or
 *                           ambassador page (the brand's own nav knows paths
 *                           no fixed list guesses, like /channelpartners or
 *                           /refer-a-seller), interleaved with common paths
 *                           (order at LINK_WORDS).
 *                           Extraction must never start at a homepage — the
 *                           first calibration call did, crawled careers pages,
 *                           and concluded Framer has no affiliate program. The
 *                           homepage is only read for its links.
 *   2. filter  (free)       fetch the page, require affiliate vocabulary
 *                           beyond what the homepage already carries.
 *                           SPAs answer 200 for any path; bolt.new/affiliate
 *                           opens their editor.
 *   3. extract (10 credits) context.dev /v1/web/extract with factCheck on.
 *                           In calibration it never invented a figure: closed
 *                           programs and login-walled portals came back null.
 *
 * Pilot economics, 2026-08-05: of 10 in-house unknowns with a live-looking
 * page, 9 had no affiliate program at all and 1 produced a real figure
 * (algolia, 15% first year). Most unknowns are unknown because nothing is
 * published — budget accordingly, and treat confirmed absence as a result
 * worth keeping too.
 *
 * Usage:
 *   CONTEXT_DEV_API_KEY=... npx tsx scripts/extract-commission-candidates.ts <slug> [slug...]
 *   npx tsx scripts/extract-commission-candidates.ts --unknowns --limit=10
 *   ... --out=data/other.json   write to another file (default data/commission-candidates.json)
 *   ... --probe                 stages 1+2 only: print the page found, spend no credits
 */

import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"

import registry from "../src/lib/registry.json"

const API = "https://api.context.dev/v1/web/extract"
const KEY = process.env.CONTEXT_DEV_API_KEY
const PATHS = ["/affiliates", "/affiliate", "/affiliate-program"]
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
// Words in a homepage link's text or path that name an affiliate page, strongest first.
// Order of trial: "affiliate" links, the common affiliate paths, referral/ambassador
// links (often customer refer-a-friend), /partners, and last links that only say
// "partner", which on most sites means integrations or resellers.
const LINK_WORDS = [/affiliate/, /\breferral|\brefer\b/, /ambassador|creator program/, /\bpartner(s|ships?)?\b/]
const WEAK = LINK_WORDS.length - 1
// Pages that mention a program without being one: articles, disclosures, docs, and
// product pages (an affiliate tool the brand sells is not its own program).
const NOT_PROGRAM =
  /\/(blog|news|press|stories|customers|case-studies|changelog|docs|help|support|resources|guides|learn|academy|glossary|integrations|templates|marketing|features?|solutions|use-cases|products?|platform|industries|for|compare|alternatives|careers|jobs|legal)(\/|$)|disclosure|policy|privacy/
// A subdomain counts only when its own name says so (affiliates.brand.com, partners.brand.com).
const PROGRAM_HOST = /^(affiliates?|partners?|refer|referrals?|ambassadors?)\./
const PROBE_ONLY = process.argv.includes("--probe")

type Program = {
  slug: string
  url: string
  signup_url?: string | null
  commission: { mode?: string }
  network?: string | null
}
const programs = (registry as { programs: Program[] }).programs

const args = process.argv.slice(2)
const LIMIT = Number(args.find(a => a.startsWith("--limit="))?.split("=")[1] ?? 10)
const MIN_CREDITS = Number(args.find(a => a.startsWith("--min-credits="))?.split("=")[1] ?? 0)
const OUT = join(
  process.cwd(),
  args.find(a => a.startsWith("--out="))?.split("=")[1] ?? "data/commission-candidates.json"
)

function targets(): Program[] {
  const slugs = args.filter(a => !a.startsWith("--"))
  if (slugs.length) return slugs.flatMap(s => programs.filter(p => p.slug === s))
  if (args.includes("--unknowns")) {
    return programs.filter(
      p => p.commission.mode === "unknown" && (p.network ?? "in-house") === "in-house"
    )
  }
  return []
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

type Page = { code: string; body: string; final: string }

/** One GET, redirects followed. No shell, so a URL cannot break out of quoting;
 *  the buffer fits pages over 1 MB, which used to come back empty. */
function get(url: string): Page {
  try {
    const out = execFileSync(
      "curl",
      ["-s", "-L", "-m", "10", "-A", UA, "-w", "\n%{http_code} %{url_effective}", url],
      { encoding: "utf8", timeout: 20_000, maxBuffer: 32 * 1024 * 1024 }
    )
    const i = out.lastIndexOf("\n")
    const [code, final] = out.slice(i + 1).split(" ")
    return { code, body: out.slice(0, i), final }
  } catch {
    return { code: "", body: "", final: url }
  }
}

const bare = (hostname: string) => hostname.replace(/^www\./, "")
// Program words a reader sees. Scripts, styles, nav and footer repeat them on every page,
// and so do footers built from plain divs, so callers compare against the homepage.
const vocab = (html: string) =>
  (
    html
      .replace(/<(script|style|nav|footer)\b[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .toLowerCase()
      // \b keeps "learn more" out: every marketing page says it.
      .match(/affiliate|commission|referral|\bearn/g) ?? []
  ).length

function urlOf(u?: string | null, base?: string): URL | null {
  try {
    return u ? new URL(u, base) : null
  } catch {
    return null
  }
}

/** Same-site links on the homepage that name an affiliate page, best first, with
 *  their LINK_WORDS rank. The homepage is read for links only, never a target. */
function homepageLinks(home: Page, host: string): [string, number][] {
  const ranked = new Map<string, [number, number]>()
  const html = home.body
  for (const m of html.matchAll(/<a\b[^>]{0,1000}?\bhref\s*=\s*["']([^"'#]+)[^>]{0,1000}>/gi)) {
    const start = m.index + m[0].length
    const end = html.indexOf("</a>", start)
    const inner = html.slice(start, end < 0 ? start : Math.min(end, start + 3000))
    const u = urlOf(m[1].replace(/&amp;/g, "&"), home.final)
    if (!u) continue
    const h = bare(u.hostname)
    if (h !== host && !(h.endsWith(`.${host}`) && PROGRAM_HOST.test(h))) continue
    if ((h === host && u.pathname.length <= 1) || NOT_PROGRAM.test(u.pathname.toLowerCase())) continue
    const text = `${inner.replace(/<[^>]*>/g, " ")} ${h === host ? "" : h} ${u.pathname}`.toLowerCase()
    const rank = LINK_WORDS.findIndex(w => w.test(text))
    const prev = ranked.get(u.href)
    if (rank >= 0 && (!prev || rank < prev[0])) ranked.set(u.href, [rank, u.href.length])
  }
  return [...ranked]
    .sort((a, b) => a[1][0] - b[1][0] || a[1][1] - b[1][1])
    .slice(0, 5)
    .map(([url, [rank]]) => [url, rank])
}

/** Stage 1+2, both free: a live page whose content talks like an affiliate page.
 *  The YAML signup_url goes first — it is usually the real affiliate page. */
async function findAffiliatePage(siteUrl: string, signupUrl?: string | null): Promise<string | null> {
  const site = urlOf(siteUrl)
  if (!site) return null
  const host = bare(site.hostname)
  let homePage: Page | undefined
  const home = () => (homePage ??= get(site.origin))
  function* candidates(): Generator<string> {
    // A signup_url that is just the homepage is not an affiliate page.
    const signup = urlOf(signupUrl)
    if (signup && /^https?:$/.test(signup.protocol) && signup.pathname.length > 1) yield signup.href
    const links = homepageLinks(home(), host)
    for (const [url, rank] of links) if (rank === 0) yield url
    for (const path of PATHS) yield `https://${host}${path}`
    for (const [url, rank] of links) if (rank > 0 && rank < WEAK) yield url
    yield `https://${host}/partners`
    for (const [url, rank] of links) if (rank === WEAK) yield url
  }
  const tried = new Set<string>()
  let homeHits: number | undefined
  for (const url of candidates()) {
    const key = url.replace("://www.", "://")
    if (tried.has(key)) continue
    tried.add(key)
    await sleep(1000) // one request at a time per brand, with a pause
    const { code, body, final } = get(url)
    const f = urlOf(final)
    // A redirect can land on a product or docs page too.
    if (code !== "200" || !f || NOT_PROGRAM.test(f.pathname.toLowerCase())) continue
    // A redirect to a root or a bare locale (/, /en, /en-us) is a homepage, not a program page.
    if (/^(\/[a-z]{2}(-[a-z]{2})?)?\/?$/i.test(f.pathname) && !PROGRAM_HOST.test(bare(f.hostname))) continue
    // Count only what the page says beyond the site chrome the homepage also carries.
    // An SPA shell that answers 200 for any path has nothing beyond it.
    // No homepage, no baseline: accept nothing rather than guess.
    homeHits ??= home().code === "200" ? vocab(home().body) : Infinity
    if (vocab(body) - homeHits >= 3) return url
  }
  return null
}

async function extract(url: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      factCheck: true,
      maxPages: 3,
      maxDepth: 1,
      instructions:
        "Determine whether this company runs an AFFILIATE program where promoters earn a share of referred revenue. Integration partners, resellers, and agency directories are NOT affiliate programs — return has_affiliate_program=false for those. Extract commission terms exactly as published; leave null anything not stated. commission_quote is the verbatim sentence from the page stating the commission.",
      schema: {
        type: "object",
        properties: {
          has_affiliate_program: { type: "boolean" },
          program_kind: { type: ["string", "null"] },
          commission_text: { type: ["string", "null"] },
          commission_percent: { type: ["number", "null"] },
          commission_flat_usd: { type: ["number", "null"] },
          recurring: { type: ["boolean", "null"] },
          recurring_duration: { type: ["string", "null"] },
          cookie_days: { type: ["integer", "null"] },
          payout_minimum_usd: { type: ["number", "null"] },
          commission_quote: { type: ["string", "null"] },
        },
        required: ["has_affiliate_program"],
      },
      tags: ["oa-candidates"],
    }),
    signal: AbortSignal.timeout(180_000),
  })
  if (!res.ok) {
    console.error(`  extract failed ${res.status} for ${url}`)
    return null
  }
  return (await res.json()) as Record<string, unknown>
}

async function main(): Promise<void> {
  if (!KEY && !PROBE_ONLY) {
    console.error("CONTEXT_DEV_API_KEY is not set")
    process.exit(1)
  }
  const list = targets().slice(0, LIMIT)
  if (!list.length) {
    console.log("nothing to do — pass slugs or --unknowns")
    return
  }

  const store = existsSync(OUT)
    ? (JSON.parse(readFileSync(OUT, "utf8")) as { note: string; candidates: unknown[] })
    : { note: "Machine-extracted commission candidates. Never a source of truth.", candidates: [] }
  const seen = new Set(
    (store.candidates as { slug: string }[]).map(c => c.slug)
  )

  for (const p of list) {
    if (seen.has(p.slug) && !PROBE_ONLY) {
      console.log(`  skip  ${p.slug} — already has a candidate`)
      continue
    }
    const page = await findAffiliatePage(p.url, p.signup_url)
    if (!page) {
      console.log(`  none  ${p.slug} — no live affiliate page found (free probe)`)
      continue
    }
    if (PROBE_ONLY) {
      console.log(`  found ${p.slug} ← ${page}`)
      continue
    }
    console.log(`  extract ${p.slug} ← ${page}`)
    const r = await extract(page).catch(e => {
      console.error(`  extract failed for ${page}: ${e instanceof Error ? e.message : e}`)
      return null
    })
    if (!r) continue
    const data = r.data as Record<string, unknown> | undefined
    store.candidates.push({
      slug: p.slug,
      // An empty response is not evidence of absence.
      status:
        data?.has_affiliate_program === true
          ? "candidate"
          : data?.has_affiliate_program === false
            ? "no-affiliate-program"
            : "extract-empty",
      note: "unreviewed machine extraction",
      extracted: data ?? null,
      source_url: page,
      evidence_urls: r.urls_analyzed ?? [],
      extracted_at: new Date().toISOString().slice(0, 10),
      method: "context.dev extract, factCheck on",
    })
    // Saved per slug: a paid extraction is never lost to a later crash.
    writeFileSync(OUT, JSON.stringify(store, null, 2) + "\n")
    const meta = r.key_metadata as { credits_remaining?: number } | undefined
    console.log(`        credits remaining: ${meta?.credits_remaining ?? "?"}`)
    if ((meta?.credits_remaining ?? Infinity) < MIN_CREDITS) {
      console.log(`  stop — credits below --min-credits=${MIN_CREDITS}`)
      break
    }
    await new Promise(r => setTimeout(r, 3000))
  }

  if (!PROBE_ONLY) console.log(`\nwrote ${OUT}`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
