// Type-scale ratchet. Counts font sizes in src/ that sit outside the scale
// 12 · 13 · 14 · 16 · 18 · 22 · 26 · 34 (plus 40 / 56 hero text and 52 / 76 score numerals) and fails when a
// file has more than scripts/type-scale-baseline.json allows. Redesign PRs lower the baseline; nothing raises it.
//   npx tsx scripts/check-type-scale.ts            check
//   npx tsx scripts/check-type-scale.ts --write    lower the baseline to the current counts (refuses if any file grew)
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = join(__dirname, "..")
const BASELINE = join(__dirname, "type-scale-baseline.json")
const ALLOWED_PX = new Set([12, 13, 14, 16, 18, 22, 26, 34, 40, 52, 56, 76])
// Tailwind's named sizes that are off the scale (xs, sm, base, lg and the OA tokens are on it).
const OFF_NAMED: Record<string, number> = { xl: 20, "2xl": 24, "3xl": 30, "4xl": 36, "5xl": 48, "6xl": 60, "7xl": 72, "8xl": 96, "9xl": 128 }
// Social images draw at their own pixel size and are exempt.
const EXEMPT = /opengraph-image\.tsx$|twitter-image\.tsx$/

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : /\.(tsx|ts|css)$/.test(name) && !EXEMPT.test(name) ? [path] : []
  })
}

export function offScale(source: string): string[] {
  const hits: string[] = []
  for (const m of source.matchAll(/\btext-\[(\d+(?:\.\d+)?)(px|rem)\]/g)) {
    const px = m[2] === "rem" ? Number(m[1]) * 16 : Number(m[1])
    if (!ALLOWED_PX.has(px)) hits.push(m[0])
  }
  for (const m of source.matchAll(/(?<![\w-])text-(xl|[2-9]xl)(?![\w-])/g)) hits.push(`text-${m[1]} (${OFF_NAMED[m[1]]}px)`)
  return hits
}

function main() {
  const counts: Record<string, number> = {}
  for (const path of files(join(ROOT, "src"))) {
    const n = offScale(readFileSync(path, "utf8")).length
    if (n) counts[relative(ROOT, path)] = n
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const base = JSON.parse(readFileSync(BASELINE, "utf8")) as { total: number; files: Record<string, number> }
  const grew = Object.entries(counts).filter(([file, n]) => n > (base.files[file] ?? 0))
  if (grew.length) {
    for (const [file, n] of grew) console.error(`${file}: ${n} off-scale font sizes (baseline ${base.files[file] ?? 0})`)
    console.error("Use the type scale: text-xs, text-meta, text-sm, text-base, text-lg, text-subtitle, text-title, text-display (src/app/globals.css).")
    process.exit(1)
  }
  if (process.argv.includes("--write")) {
    writeFileSync(BASELINE, `${JSON.stringify({ total, files: Object.fromEntries(Object.entries(counts).sort()) }, null, 2)}\n`)
    console.log(`type-scale baseline lowered to ${total} off-scale sizes in ${Object.keys(counts).length} files`)
    return
  }
  const lower = total < base.total ? ` Run with --write to lower the baseline to ${total}.` : ""
  console.log(`type scale ok: ${total} off-scale sizes left (baseline ${base.total}).${lower}`)
}

if (require.main === module) main()
