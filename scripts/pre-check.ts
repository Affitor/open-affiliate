#!/usr/bin/env tsx
/**
 * Pre-flight dedup filter — decides whether a candidate should enter the 8-step pipeline.
 *
 * Usage:
 *   npx tsx scripts/pre-check.ts candidates.txt                   # default: skip existing
 *   npx tsx scripts/pre-check.ts candidates.txt --refresh=stale   # include > 30d
 *   npx tsx scripts/pre-check.ts candidates.txt --refresh=all     # force re-scan everything
 *   npx tsx scripts/pre-check.ts candidates.txt --stale-days=60   # custom threshold
 *   npx tsx scripts/pre-check.ts candidates.txt --out=./out       # output dir
 *
 * Input format (one per line, blank/# comments ignored):
 *   stripe.com
 *   https://openai.com
 *   OpenAI
 *   chatgpt
 *
 * Output (written to --out or cwd):
 *   new.txt        — truly new, go to 8-step
 *   stale.txt      — exists + last_verified > threshold, light refresh
 *   skip.txt       — exists + fresh, log only
 *   flag.txt       — fuzzy match — human review
 *   pre-check-report.json  — full per-candidate decision detail
 *
 * Exit codes:
 *   0 — ran successfully
 *   1 — missing registry-index.json (run `npm run registry:build` first)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs"
import { join, resolve } from "path"

interface RegistryIndex {
  generated_at: string
  count: number
  by_slug: string[]
  by_domain: Record<string, string>
  by_alias: Record<string, string>
  source_lastsync: Record<string, string>
  last_verified: Record<string, string | null>
}

interface Decision {
  candidate: string
  normalized: string
  tier: "NEW" | "SKIP" | "REFRESH-LIGHT" | "REFRESH-FULL" | "FLAG"
  matched_slug: string | null
  match_type: "domain" | "slug" | "alias" | "fuzzy" | null
  last_verified_at: string | null
  age_days: number | null
  reason: string
}

const REGISTRY_INDEX = join(process.cwd(), "src", "lib", "registry-index.json")

// ── CLI ──
const args = process.argv.slice(2)
if (args.length === 0 || args[0].startsWith("--")) {
  console.error("Usage: npx tsx scripts/pre-check.ts <candidates.txt> [--refresh=none|stale|all] [--stale-days=N] [--out=DIR]")
  process.exit(1)
}
const inputFile = args[0]
const refreshMode = (args.find((a) => a.startsWith("--refresh="))?.split("=")[1] ?? "none") as
  | "none"
  | "stale"
  | "all"
const staleDays = parseInt(args.find((a) => a.startsWith("--stale-days="))?.split("=")[1] ?? "30", 10)
const outDir = resolve(args.find((a) => a.startsWith("--out="))?.split("=")[1] ?? ".")

if (!existsSync(REGISTRY_INDEX)) {
  console.error(`Missing ${REGISTRY_INDEX}. Run: npm run registry:build`)
  process.exit(1)
}

const index: RegistryIndex = JSON.parse(readFileSync(REGISTRY_INDEX, "utf-8"))

// ── Normalization ──
function normalizeCandidate(raw: string): { domain: string; name: string } {
  const trimmed = raw.trim()
  const isUrl = /^https?:\/\//i.test(trimmed) || /\.[a-z]{2,}/i.test(trimmed)

  if (isUrl) {
    const domain = trimmed
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "")
      .replace(/\/$/, "")
      .trim()
    return { domain, name: domain.split(".")[0] }
  }
  // Not a URL — treat as a name
  return { domain: "", name: trimmed.toLowerCase() }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

function daysSince(isoDate: string | null): number | null {
  if (!isoDate) return null
  const then = new Date(isoDate).getTime()
  if (isNaN(then)) return null
  return Math.floor((Date.now() - then) / 86400000)
}

// ── Fuzzy match (Levenshtein) ──
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) dp[i][0] = i
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[a.length][b.length]
}

function fuzzyMatch(needle: string): { slug: string; distance: number } | null {
  if (needle.length < 3) return null
  let best: { slug: string; distance: number } | null = null
  const haystack = [...index.by_slug, ...Object.keys(index.by_alias), ...Object.keys(index.by_domain)]
  for (const candidate of haystack) {
    const d = levenshtein(needle, candidate)
    if (d < 3 && (!best || d < best.distance)) {
      const slug = index.by_domain[candidate] ?? index.by_alias[candidate] ?? candidate
      best = { slug, distance: d }
    }
  }
  return best
}

// ── Match + decide ──
function decide(raw: string): Decision {
  const { domain, name } = normalizeCandidate(raw)
  const slugCandidate = slugify(name)

  let matched: string | null = null
  let matchType: Decision["match_type"] = null

  // 1. Exact domain match
  if (domain && index.by_domain[domain]) {
    matched = index.by_domain[domain]
    matchType = "domain"
  }
  // 2. Exact slug match
  else if (index.by_slug.includes(slugCandidate)) {
    matched = slugCandidate
    matchType = "slug"
  }
  // 3. Alias match
  else if (index.by_alias[name]) {
    matched = index.by_alias[name]
    matchType = "alias"
  }

  if (!matched) {
    // Fuzzy fallback — flag for human
    const fuzzy = fuzzyMatch(domain || slugCandidate)
    if (fuzzy) {
      return {
        candidate: raw,
        normalized: domain || name,
        tier: "FLAG",
        matched_slug: fuzzy.slug,
        match_type: "fuzzy",
        last_verified_at: index.last_verified[fuzzy.slug] ?? null,
        age_days: daysSince(index.last_verified[fuzzy.slug] ?? null),
        reason: `Fuzzy match (distance ${fuzzy.distance}) to ${fuzzy.slug} — human review`,
      }
    }
    return {
      candidate: raw,
      normalized: domain || name,
      tier: "NEW",
      matched_slug: null,
      match_type: null,
      last_verified_at: null,
      age_days: null,
      reason: "No match in registry",
    }
  }

  // Matched — apply refresh policy
  const lv = index.last_verified[matched] ?? null
  const age = daysSince(lv)

  if (refreshMode === "all") {
    return {
      candidate: raw,
      normalized: domain || name,
      tier: "REFRESH-FULL",
      matched_slug: matched,
      match_type: matchType,
      last_verified_at: lv,
      age_days: age,
      reason: `Matched ${matched} (${matchType}); --refresh=all forces full re-scan`,
    }
  }

  if (age === null) {
    // No freshness data — treat as stale
    return {
      candidate: raw,
      normalized: domain || name,
      tier: refreshMode === "stale" ? "REFRESH-LIGHT" : "SKIP",
      matched_slug: matched,
      match_type: matchType,
      last_verified_at: lv,
      age_days: null,
      reason: `Matched ${matched} (${matchType}); no last_verified_at`,
    }
  }

  if (age < staleDays) {
    return {
      candidate: raw,
      normalized: domain || name,
      tier: "SKIP",
      matched_slug: matched,
      match_type: matchType,
      last_verified_at: lv,
      age_days: age,
      reason: `Matched ${matched} (${matchType}); fresh (${age}d < ${staleDays}d)`,
    }
  }

  if (age < staleDays * 3) {
    return {
      candidate: raw,
      normalized: domain || name,
      tier: refreshMode === "none" ? "SKIP" : "REFRESH-LIGHT",
      matched_slug: matched,
      match_type: matchType,
      last_verified_at: lv,
      age_days: age,
      reason: `Matched ${matched} (${matchType}); stale (${age}d) — light refresh`,
    }
  }

  return {
    candidate: raw,
    normalized: domain || name,
    tier: refreshMode === "none" ? "SKIP" : "REFRESH-FULL",
    matched_slug: matched,
    match_type: matchType,
    last_verified_at: lv,
    age_days: age,
    reason: `Matched ${matched} (${matchType}); very stale (${age}d) — full re-scan`,
  }
}

// ── Run ──
const raw = readFileSync(inputFile, "utf-8")
const candidates = raw
  .split("\n")
  .map((l) => l.split("#")[0].trim())
  .filter((l) => l.length > 0)

const decisions = candidates.map(decide)

const buckets: Record<string, string[]> = {
  NEW: [],
  "REFRESH-LIGHT": [],
  "REFRESH-FULL": [],
  SKIP: [],
  FLAG: [],
}

for (const d of decisions) {
  buckets[d.tier].push(d.candidate)
}

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

writeFileSync(join(outDir, "new.txt"), buckets.NEW.join("\n") + (buckets.NEW.length ? "\n" : ""))
writeFileSync(join(outDir, "stale.txt"), [...buckets["REFRESH-LIGHT"], ...buckets["REFRESH-FULL"]].join("\n") + "\n")
writeFileSync(join(outDir, "skip.txt"), buckets.SKIP.join("\n") + (buckets.SKIP.length ? "\n" : ""))
writeFileSync(join(outDir, "flag.txt"), buckets.FLAG.join("\n") + (buckets.FLAG.length ? "\n" : ""))
writeFileSync(
  join(outDir, "pre-check-report.json"),
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      refresh_mode: refreshMode,
      stale_days: staleDays,
      input: inputFile,
      totals: {
        total: decisions.length,
        new: buckets.NEW.length,
        refresh_light: buckets["REFRESH-LIGHT"].length,
        refresh_full: buckets["REFRESH-FULL"].length,
        skip: buckets.SKIP.length,
        flag: buckets.FLAG.length,
      },
      decisions,
    },
    null,
    2
  ) + "\n"
)

console.log(`Pre-check complete (refresh=${refreshMode}, stale-days=${staleDays}):`)
console.log(`  ${decisions.length} candidates → ${buckets.NEW.length} NEW, ${buckets["REFRESH-LIGHT"].length} REFRESH-LIGHT, ${buckets["REFRESH-FULL"].length} REFRESH-FULL, ${buckets.SKIP.length} SKIP, ${buckets.FLAG.length} FLAG`)
console.log(`  Outputs: ${outDir}/{new,stale,skip,flag}.txt + pre-check-report.json`)
