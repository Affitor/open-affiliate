#!/usr/bin/env tsx
/**
 * Build registry-index.json — a lightweight fingerprint index for pre-flight dedup.
 *
 * Output: src/lib/registry-index.json
 * Shape:
 *   {
 *     generated_at: ISO timestamp,
 *     count: number,
 *     by_slug: string[],                    // all slugs
 *     by_domain: { [domain]: slug },        // normalized domain → slug
 *     by_alias: { [alias]: slug },          // lowercased alias → slug
 *     source_lastsync: { [source]: date },  // most recent last_verified_at per source
 *     last_verified: { [slug]: date|null }  // per-slug freshness
 *   }
 *
 * Used by scripts/pre-check.ts and discovery scrapers.
 */

import { readFileSync, writeFileSync } from "fs"
import { join } from "path"

const REGISTRY_FILE = join(process.cwd(), "src", "lib", "registry.json")
const OUTPUT_FILE = join(process.cwd(), "src", "lib", "registry-index.json")

interface Program {
  slug: string
  name: string
  url: string
  aliases?: string[]
  source?: string
  last_verified_at?: string | null
  updated_at?: string | null
  created_at?: string
}

function normalizeDomain(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/\/$/, "")
    .trim()
}

function buildIndex(): void {
  const registry = JSON.parse(readFileSync(REGISTRY_FILE, "utf-8"))
  const programs: Program[] = registry.programs

  const by_slug: string[] = []
  const by_domain: Record<string, string> = {}
  const by_alias: Record<string, string> = {}
  const source_lastsync: Record<string, string> = {}
  const last_verified: Record<string, string | null> = {}

  for (const p of programs) {
    by_slug.push(p.slug)

    const domain = normalizeDomain(p.url)
    if (domain) by_domain[domain] = p.slug

    // Add lowercased name as implicit alias (common case)
    const nameKey = p.name.toLowerCase().trim()
    if (nameKey && nameKey !== p.slug) {
      by_alias[nameKey] = p.slug
    }

    for (const alias of p.aliases ?? []) {
      by_alias[alias.toLowerCase().trim()] = p.slug
    }

    const verified = p.last_verified_at || p.updated_at || p.created_at || null
    last_verified[p.slug] = verified

    const source = p.source
    if (source && verified) {
      if (!source_lastsync[source] || verified > source_lastsync[source]) {
        source_lastsync[source] = verified
      }
    }
  }

  const index = {
    generated_at: new Date().toISOString(),
    count: programs.length,
    by_slug: by_slug.sort(),
    by_domain,
    by_alias,
    source_lastsync,
    last_verified,
  }

  writeFileSync(OUTPUT_FILE, JSON.stringify(index, null, 2) + "\n")

  console.log(`Registry index built:`)
  console.log(`  ${programs.length} programs`)
  console.log(`  ${Object.keys(by_domain).length} unique domains`)
  console.log(`  ${Object.keys(by_alias).length} aliases indexed`)
  console.log(`  ${Object.keys(source_lastsync).length} sources tracked`)
  console.log(`  Output: src/lib/registry-index.json`)
}

buildIndex()
