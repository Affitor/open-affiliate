#!/usr/bin/env tsx
/**
 * fetch-logos — get a real brand mark for every program that lacks one.
 *
 * Adding a program YAML already produces the HTML page, the .md twin, the
 * sitemap entry, the JSON-LD, the API record and the category and network
 * listings. The logo was the one thing that did not appear, so a new program
 * rendered as a grey tile with a letter in it while everything around it had
 * a brand mark.
 *
 * Sources, tried in order. Each is a real published asset — never a generated
 * glyph and never a favicon upscaled into a blur:
 *
 *   1. dashboard-icons  — 512px PNGs, curated, the cleanest marks available
 *   2. lobehub          — good coverage of AI and dev-tool brands
 *   3. apple-touch-icon — the brand's own asset, straight from their site
 *   4. DuckDuckGo ip3   — last resort, real but low resolution
 *
 * Usage:
 *   npx tsx scripts/fetch-logos.ts            # only programs with no logo
 *   npx tsx scripts/fetch-logos.ts --slug=foo # one program
 *   npx tsx scripts/fetch-logos.ts --dry-run
 */

import { existsSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import registry from "../src/lib/registry.json"

const LOGOS_DIR = join(process.cwd(), "public", "logos")
const args = new Set(process.argv.slice(2))
const DRY_RUN = args.has("--dry-run")
const ONLY = [...args].find(a => a.startsWith("--slug="))?.split("=")[1]

type Program = { slug: string; name: string; url: string }
const programs = (registry as { programs: Program[] }).programs

/** Bare host, no www, no path — what every icon service keys on. */
function host(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

/** The brand token most icon sets use: "linear.com" -> "linear". */
function brandKey(h: string): string {
  return h.split(".")[0]
}

type Candidate = { url: string; source: string }

function candidates(p: Program): Candidate[] {
  const h = host(p.url)
  if (!h) return []
  const key = brandKey(h)
  return [
    {
      source: "dashboard-icons",
      url: `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/${key}.png`,
    },
    {
      source: "lobehub",
      url: `https://registry.npmmirror.com/@lobehub/icons-static-png/latest/files/dark/${key}.png`,
    },
    { source: "apple-touch-icon", url: `https://${h}/apple-touch-icon.png` },
    { source: "duckduckgo", url: `https://icons.duckduckgo.com/ip3/${h}.ico` },
  ]
}

/**
 * A 1x1 tracking pixel and a 404 page rendered as an image both come back 200.
 * Anything under 1KB is not a usable brand mark, and an HTML error page is not
 * an image at all — check both rather than trusting the status code.
 */
async function tryFetch(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (openaffiliate logo fetcher)" },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    const type = res.headers.get("content-type") ?? ""
    if (!/image|octet-stream/i.test(type)) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 1024) return null
    return buf
  } catch {
    return null
  }
}

/**
 * Smallest edge we will accept, in pixels.
 *
 * The UI renders logos at 32-56px, so a 16x16 favicon stretched to fit is a
 * blurred smudge. The component's fallback — the program's initial on a clean
 * tile — looks better than that. A missing logo is not a defect; a bad one is.
 *
 * DuckDuckGo's ip3 endpoint mostly returns 16x16 and 32x32, which is why this
 * check exists: without it the first run pulled six unusable icons and called
 * them a success.
 */
const MIN_EDGE = 64

/** PNG dimensions live in the IHDR chunk at a fixed offset. */
function pngSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

/**
 * An ICO holds several images; the directory lists each one's size, and 0
 * encodes 256. Take the largest, since that is what a browser would pick.
 */
function icoSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) return null
  const count = buf.readUInt16LE(4)
  let best = 0
  for (let i = 0; i < count; i++) {
    const off = 6 + i * 16
    if (off + 2 > buf.length) break
    const w = buf[off] === 0 ? 256 : buf[off]
    const h = buf[off + 1] === 0 ? 256 : buf[off + 1]
    best = Math.max(best, Math.min(w, h))
  }
  return best ? { w: best, h: best } : null
}

/** null when the format carries no readable dimensions, e.g. SVG — which scales. */
function smallestEdge(buf: Buffer): number | null {
  const size = pngSize(buf) ?? icoSize(buf)
  return size ? Math.min(size.w, size.h) : null
}

function extFor(buf: Buffer, url: string): string {
  if (buf.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "png"
  if (buf.subarray(0, 3).toString("hex") === "ffd8ff") return "jpg"
  if (buf.subarray(0, 4).toString("ascii") === "RIFF") return "webp"
  if (buf.subarray(0, 5).toString("ascii").includes("<svg")) return "svg"
  if (url.endsWith(".ico")) return "ico"
  return "png"
}

async function main(): Promise<void> {
  const have = new Set(
    readdirSync(LOGOS_DIR).map(f => f.replace(/\.[^.]+$/, ""))
  )

  let targets = programs.filter(p => !have.has(p.slug))
  if (ONLY) targets = programs.filter(p => p.slug === ONLY)

  if (targets.length === 0) {
    console.log("Every program already has a logo.")
    return
  }

  console.log(`${targets.length} program(s) without a logo\n`)

  let found = 0
  for (const p of targets) {
    let done = false
    for (const c of candidates(p)) {
      const buf = await tryFetch(c.url)
      if (!buf) continue
      const edge = smallestEdge(buf)
      if (edge !== null && edge < MIN_EDGE) {
        console.log(
          `  skip  ${p.slug.padEnd(34)} ${c.source.padEnd(17)} ${edge}px, too small`
        )
        continue
      }
      const ext = extFor(buf, c.url)
      const out = join(LOGOS_DIR, `${p.slug}.${ext}`)
      if (!DRY_RUN) writeFileSync(out, buf)
      console.log(
        `  ok    ${p.slug.padEnd(34)} ${c.source.padEnd(17)} ${(buf.length / 1024).toFixed(0)}KB .${ext}`
      )
      found++
      done = true
      break
    }
    if (!done) {
      // Not a failure worth blocking on. The component falls back to the
      // program's initial, which is honest — better than shipping a wrong mark.
      console.log(`  none  ${p.slug.padEnd(34)} no source had one`)
    }
  }

  console.log(
    `\n${found}/${targets.length} resolved${DRY_RUN ? " (dry run, nothing written)" : ""}`
  )
  if (found > 0 && !DRY_RUN) {
    console.log("Run build-registry to refresh logo-files.json.")
  }
}

main()
