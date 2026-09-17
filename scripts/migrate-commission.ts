#!/usr/bin/env tsx
/**
 * migrate-commission — turn `commission.rate` from free text into a typed shape.
 *
 * Today the field holds "30%", "varies", "$250", "175", "20-30%",
 * "$5 per lead + 30%" and "50% on the USD 49 workflow triage; 30% default on
 * the USD 2,500 AI readiness diagnostic" — all in one string. Every consumer
 * has to guess, which is why parseCommissionRate is a stack of regexes and why
 * /categories currently prints "Top: Sendcloud (200)" with no unit.
 *
 * Adds three fields alongside the original, following the shape kyma-api uses
 * for model pricing:
 *
 *   mode   percentage | flat | tiered | hybrid | unknown
 *   value  the number a reader compares on, null when mode is unknown
 *   rate   left exactly as the source wrote it
 *
 * `unknown` is the point. 192 programs say "varies", which means nobody
 * recorded a figure. Typing that as unknown makes it honest and lets the UI say
 * "not published" instead of printing a word into a number column.
 *
 * Usage:
 *   npx tsx scripts/migrate-commission.ts --dry-run
 *   npx tsx scripts/migrate-commission.ts
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const PROGRAMS_DIR = join(process.cwd(), "programs")
const DRY_RUN = process.argv.includes("--dry-run")

type Mode = "percentage" | "flat" | "tiered" | "hybrid" | "unknown"
type Parsed = { mode: Mode; value: number | null; why: string }

/**
 * Ten programs store a bare number with no unit — "175", "200", "6". Whether
 * that means percent or dollars is not recoverable from the field, so each was
 * read against its own description rather than guessed at in bulk.
 *
 * Three of them contradict their own description: oyster says 6 while the text
 * says 10% monthly revenue share, sendcloud says 200 while the text says 100%
 * of the first month, recruitment-intelligence says 10 while the text describes
 * a flat $29-300/mo. Those become unknown rather than picking a side — a wrong
 * commission figure costs a partner real money, and there is no tiebreaker here.
 */
const BARE_NUMBER_RULINGS: Record<string, Parsed> = {
  markty: { mode: "percentage", value: 50, why: "description: 50% recurring for 12 months" },
  "monday-com": { mode: "percentage", value: 20, why: "description: up to 20% commission" },
  "postnitro-ai": { mode: "percentage", value: 20, why: "description: 20% recurring" },
  tapstitch: { mode: "percentage", value: 10, why: "description: 10% on every order" },

  oyster: { mode: "unknown", value: null, why: "field says 6, description says 10% — conflict" },
  sendcloud: { mode: "unknown", value: null, why: "field says 200, description says 100% of first month — conflict" },
  "recruitment-intelligence": { mode: "unknown", value: null, why: "field says 10, description describes a flat $29-300/mo — conflict" },

  "bolt-for-business": { mode: "unknown", value: null, why: "bare number, description says nothing about commission" },
  "miro-affiliate": { mode: "unknown", value: null, why: "bare number, description says nothing about commission" },
  "ueni-com": { mode: "unknown", value: null, why: "bare number, description says nothing about commission" },
}

function parseRate(raw: string, slug: string): Parsed {
  const r = raw.trim()

  if (!r || /^(varies|unknown|n\/a|tbd)$/i.test(r)) {
    return { mode: "unknown", value: null, why: "no figure recorded" }
  }

  // A bare number carries no unit and cannot be read without evidence.
  if (/^\d+(\.\d+)?$/.test(r)) {
    return (
      BARE_NUMBER_RULINGS[slug] ?? {
        mode: "unknown",
        value: null,
        why: "bare number with no unit and no ruling",
      }
    )
  }

  const hasPct = /%/.test(r)
  const hasDollar = /\$/.test(r)

  // Both symbols means two components — a flat bounty plus a share, or a choice
  // between them. Neither number alone describes the deal.
  if (hasPct && hasDollar) {
    const pct = r.match(/(\d+(?:\.\d+)?)\s*%/)
    return {
      mode: "hybrid",
      value: pct ? parseFloat(pct[1]) : null,
      why: "contains both a flat amount and a percentage",
    }
  }

  if (hasPct) {
    // "20-30%" and "75-125% CPA + 25% annual" — a band, not a single rate.
    // Take the top of the band, which is what a reader compares on, and say so.
    const range = r.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*%/)
    if (range) {
      return { mode: "tiered", value: parseFloat(range[2]), why: "range, using the upper bound" }
    }
    const one = r.match(/(\d+(?:\.\d+)?)\s*%/)
    if (one) {
      return { mode: "percentage", value: parseFloat(one[1]), why: "single percentage" }
    }
  }

  if (hasDollar) {
    const range = r.match(/\$\s*(\d[\d,]*(?:\.\d+)?)\s*[-–]\s*\$?\s*(\d[\d,]*(?:\.\d+)?)/)
    if (range) {
      return {
        mode: "tiered",
        value: parseFloat(range[2].replace(/,/g, "")),
        why: "flat range, using the upper bound",
      }
    }
    const one = r.match(/\$\s*(\d[\d,]*(?:\.\d+)?)/)
    if (one) {
      return { mode: "flat", value: parseFloat(one[1].replace(/,/g, "")), why: "single flat amount" }
    }
  }

  return { mode: "unknown", value: null, why: "unrecognised format" }
}

function main(): void {
  const files = readdirSync(PROGRAMS_DIR).filter(f => f.endsWith(".yaml"))
  const counts: Record<Mode, number> = {
    percentage: 0,
    flat: 0,
    tiered: 0,
    hybrid: 0,
    unknown: 0,
  }
  const notable: string[] = []
  let changed = 0

  for (const file of files) {
    const path = join(PROGRAMS_DIR, file)
    const text = readFileSync(path, "utf8")
    const slug = file.replace(/\.yaml$/, "")

    // Operate on the raw text rather than round-tripping through a YAML
    // serialiser: that would reflow comments, quoting and block scalars across
    // all 760 files and bury the actual change in noise.
    const rateLine = text.match(/^(\s+)rate:\s*(.+)$/m)
    if (!rateLine) continue
    if (/^\s+mode:/m.test(text)) continue // already migrated

    const indent = rateLine[1]
    const rawValue = rateLine[2].trim().replace(/^["']|["']$/g, "")
    const parsed = parseRate(rawValue, slug)
    counts[parsed.mode]++

    if (parsed.mode === "unknown" && rawValue.toLowerCase() !== "varies") {
      notable.push(`  ${slug.padEnd(28)} "${rawValue}" → unknown (${parsed.why})`)
    }

    const addition =
      `\n${indent}mode: ${parsed.mode}` +
      `\n${indent}value: ${parsed.value === null ? "null" : parsed.value}`

    const updated = text.replace(rateLine[0], rateLine[0] + addition)
    if (!DRY_RUN) writeFileSync(path, updated)
    changed++
  }

  console.log(`${changed} file(s) ${DRY_RUN ? "would be" : ""} updated\n`)
  for (const [mode, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${mode.padEnd(12)} ${String(n).padStart(4)}`)
  }
  if (notable.length) {
    console.log(`\nunknown for a reason other than "varies":`)
    notable.forEach(l => console.log(l))
  }
}

main()
