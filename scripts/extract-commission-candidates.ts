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
 *   1. probe   (free)       curl common affiliate paths on the domain.
 *                           Extraction must never start at a homepage — the
 *                           first calibration call did, crawled careers pages,
 *                           and concluded Framer has no affiliate program.
 *   2. filter  (free)       fetch the page, require affiliate vocabulary.
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
 */

import { execSync } from "node:child_process"
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"

import registry from "../src/lib/registry.json"

const API = "https://api.context.dev/v1/web/extract"
const KEY = process.env.CONTEXT_DEV_API_KEY
const OUT = join(process.cwd(), "data", "commission-candidates.json")
const PATHS = ["/affiliates", "/affiliate", "/partners", "/affiliate-program"]

type Program = {
  slug: string
  url: string
  commission: { mode?: string }
  network?: string | null
}
const programs = (registry as { programs: Program[] }).programs

const args = process.argv.slice(2)
const LIMIT = Number(args.find(a => a.startsWith("--limit="))?.split("=")[1] ?? 10)

function targets(): Program[] {
  const slugs = args.filter(a => !a.startsWith("--"))
  if (slugs.length) return programs.filter(p => slugs.includes(p.slug))
  if (args.includes("--unknowns")) {
    return programs.filter(
      p => p.commission.mode === "unknown" && (p.network ?? "in-house") === "in-house"
    )
  }
  return []
}

function sh(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf8", timeout: 20_000 }).trim()
  } catch {
    return ""
  }
}

/** Stage 1+2, both free: a live path whose content talks like an affiliate page. */
function findAffiliatePage(siteUrl: string): string | null {
  let host: string
  try {
    host = new URL(siteUrl).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
  for (const path of PATHS) {
    const url = `https://${host}${path}`
    const code = sh(`curl -s -o /dev/null -w '%{http_code}' -m 6 -L -A 'Mozilla/5.0' '${url}'`)
    if (code !== "200") continue
    const body = sh(`curl -s -m 8 -L -A 'Mozilla/5.0' '${url}'`).toLowerCase()
    const hits = (body.match(/affiliate|commission|referral|earn/g) ?? []).length
    if (hits >= 3 && body.length > 3000) return url
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
        "Determine whether this company runs an AFFILIATE program where promoters earn a share of referred revenue. Integration partners, resellers, and agency directories are NOT affiliate programs — return has_affiliate_program=false for those. Extract commission terms exactly as published; leave null anything not stated.",
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
  if (!KEY) {
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
    if (seen.has(p.slug)) {
      console.log(`  skip  ${p.slug} — already has a candidate`)
      continue
    }
    const page = findAffiliatePage(p.url)
    if (!page) {
      console.log(`  none  ${p.slug} — no live affiliate page found (free probe)`)
      continue
    }
    console.log(`  extract ${p.slug} ← ${page}`)
    const r = await extract(page)
    if (!r) continue
    const data = r.data as Record<string, unknown> | undefined
    store.candidates.push({
      slug: p.slug,
      status: data?.has_affiliate_program ? "candidate" : "no-affiliate-program",
      note: "unreviewed machine extraction",
      extracted: data ?? null,
      evidence_urls: r.urls_analyzed ?? [],
      extracted_at: new Date().toISOString().slice(0, 10),
      method: "context.dev extract, factCheck on",
    })
    const meta = r.key_metadata as { credits_remaining?: number } | undefined
    console.log(`        credits remaining: ${meta?.credits_remaining ?? "?"}`)
    await new Promise(r => setTimeout(r, 3000))
  }

  writeFileSync(OUT, JSON.stringify(store, null, 2) + "\n")
  console.log(`\nwrote ${OUT}`)
}

main()
