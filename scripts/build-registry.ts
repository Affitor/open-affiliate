import { readFileSync, writeFileSync, readdirSync } from "fs"
import { join, basename } from "path"
import { parse } from "yaml"

const PROGRAMS_DIR = join(process.cwd(), "programs")
const OUTPUT_FILE = join(process.cwd(), "src", "lib", "registry.json")
const INDEX_FILE = join(process.cwd(), "src", "lib", "registry-index.json")
const LOGOS_DIR = join(process.cwd(), "public", "logos")
const LOGO_MAP_FILE = join(process.cwd(), "src", "lib", "logo-files.json")

/**
 * Slugs allowed to keep a placeholder signup_url, frozen when the rule landed.
 * See the check in validateProgram.
 */
const SIGNUP_URL_DEBT = new Set<string>(
  (
    JSON.parse(
      readFileSync(join(process.cwd(), "schema", "signup-url-debt.json"), "utf8")
    ) as { slugs: string[] }
  ).slugs
)

const REQUIRED_FIELDS = [
  "name",
  "slug",
  "url",
  "category",
  "commission",
  "description",
  "short_description",
  "agents",
]

type ProgramKind =
  | "affiliate"
  | "referral"
  | "creator-payout"
  | "revenue-share"
  | "cashback"
  | "partner-network"

interface YamlProgram {
  name: string
  slug: string
  aliases?: string[]
  url: string
  kind?: ProgramKind
  source?: string
  category: string
  tags?: string[]
  commission: {
    type: string
    rate: string | number
    currency: string
    duration?: string | null
    conditions?: string | null
  }
  cookie_days: number
  attribution?: string
  tracking_method?: string
  payout: {
    minimum: number
    currency: string
    frequency: string
    methods?: string[]
  }
  signup_url?: string
  approval?: string
  approval_time?: string
  restrictions?: string[]
  eligibility?: {
    countries_allowed?: string[]
    countries_excluded?: string[]
    promotion_restrictions?: string[]
    tax_forms_required?: string[]
  }
  marketing_materials?: boolean
  api_available?: boolean
  dedicated_manager?: boolean
  dashboard_url?: string | null
  network?: string | null
  program_age?: string | null
  description: string
  short_description: string
  agents: {
    prompt: string
    keywords?: string[]
    use_cases?: string[]
  }
  verified?: boolean
  submitted_by?: string
  created_at?: string
  updated_at?: string
  last_verified_at?: string | null
}

function validateProgram(data: Record<string, unknown>, filename: string): void {
  for (const field of REQUIRED_FIELDS) {
    if (data[field] === undefined || data[field] === null) {
      throw new Error(`Missing required field "${field}" in ${filename}`)
    }
  }

  const expectedSlug = basename(filename, ".yaml")
  if (data.slug !== expectedSlug) {
    throw new Error(
      `Slug mismatch in ${filename}: expected "${expectedSlug}", got "${data.slug}"`
    )
  }

  const commission = data.commission as Record<string, unknown> | undefined
  if (commission) {
    const MODES = ["percentage", "flat", "tiered", "hybrid", "unknown"]
    if (!MODES.includes(String(commission.mode))) {
      throw new Error(
        `${filename}: commission.mode must be one of ${MODES.join(", ")} — got "${commission.mode}". ` +
          `Use "unknown" when no figure has been published rather than leaving it out.`
      )
    }
    if (commission.mode !== "unknown" && commission.value == null) {
      throw new Error(
        `${filename}: commission.mode is "${commission.mode}" but value is null. ` +
          `Either give the number a reader compares on, or set mode to unknown.`
      )
    }
  }

  // 208 programs reached the registry with a signup_url that was just the
  // homepage, most of them byte-identical to `url`. The field looked complete
  // and told a reader nothing.
  //
  // A ratchet rather than a flag day: those 208 are frozen in
  // schema/signup-url-debt.json so the build still passes, and anything new
  // fails. The list can shrink, never grow. Fixing a link means deleting a
  // slug from it.
  const signup = typeof data.signup_url === "string" ? data.signup_url.trim() : ""
  if (signup && !SIGNUP_URL_DEBT.has(String(data.slug))) {
    const site = typeof data.url === "string" ? data.url.trim() : ""
    const strip = (u: string) => u.replace(/\/+$/, "")
    if (strip(signup) === strip(site)) {
      throw new Error(
        `${filename}: signup_url is identical to url. Link to the affiliate or partner page, not the website.`
      )
    }
    try {
      const path = new URL(signup).pathname
      if (path === "" || path === "/") {
        throw new Error(
          `${filename}: signup_url points at the bare homepage. Link to the affiliate or partner page.`
        )
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("bare homepage")) throw err
      throw new Error(`${filename}: signup_url is not a valid URL — "${signup}"`)
    }
  }
}

function buildRegistry(): void {
  const yamlFiles = readdirSync(PROGRAMS_DIR)
    .filter((f) => f.endsWith(".yaml"))
    .sort()

  const programs: YamlProgram[] = []
  const errors: string[] = []

  for (const filename of yamlFiles) {
    const filepath = join(PROGRAMS_DIR, filename)
    try {
      const raw = readFileSync(filepath, "utf-8")
      const data = parse(raw) as Record<string, unknown>

      validateProgram(data, filename)
      programs.push(data as unknown as YamlProgram)
    } catch (err) {
      errors.push(`${filename}: ${(err as Error).message}`)
    }
  }

  if (errors.length > 0) {
    console.error("Validation errors:")
    for (const e of errors) {
      console.error(`  - ${e}`)
    }
    process.exit(1)
  }

  // Sort alphabetically by name
  programs.sort((a, b) => a.name.localeCompare(b.name))

  const categories = [...new Set(programs.map((p) => p.category))].sort()

  const registry = {
    generated_at: new Date().toISOString(),
    count: programs.length,
    categories,
    programs,
  }

  writeFileSync(OUTPUT_FILE, JSON.stringify(registry, null, 2) + "\n")

  console.log(`Registry built successfully:`)
  console.log(`  ${programs.length} programs loaded`)
  console.log(`  ${categories.length} categories: ${categories.join(", ")}`)
  console.log(`  Output: src/lib/registry.json`)

  // Inline index build — no subprocess. Never fails the build: if any step
  // here throws, we warn and continue so Vercel deploys still succeed. The
  // index is only consumed by scripts/pre-check.ts (ops tooling), not by
  // the Next.js app at runtime.
  try {
    buildIndex(programs)
  } catch (err) {
    console.warn(`[warn] registry-index.json build skipped: ${(err as Error).message}`)
  }
}

function buildIndex(programs: YamlProgram[]): void {
  const bySlug: string[] = []
  const byDomain: Record<string, string> = {}
  const byAlias: Record<string, string> = {}
  const sourceLastsync: Record<string, string> = {}
  const lastVerified: Record<string, string | null> = {}

  const normDomain = (url: string): string =>
    url
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "")
      .replace(/\/$/, "")
      .trim()

  for (const p of programs) {
    bySlug.push(p.slug)
    const dom = normDomain(p.url)
    if (dom) byDomain[dom] = p.slug
    const nameKey = p.name.toLowerCase().trim()
    if (nameKey && nameKey !== p.slug) byAlias[nameKey] = p.slug
    for (const a of p.aliases ?? []) byAlias[String(a).toLowerCase().trim()] = p.slug
    const lv = p.last_verified_at || p.updated_at || p.created_at || null
    lastVerified[p.slug] = lv
    const src = p.source
    if (src && lv) {
      if (!sourceLastsync[src] || lv > sourceLastsync[src]) sourceLastsync[src] = lv
    }
  }

  const index = {
    generated_at: new Date().toISOString(),
    count: programs.length,
    by_slug: [...bySlug].sort(),
    by_domain: byDomain,
    by_alias: byAlias,
    source_lastsync: sourceLastsync,
    last_verified: lastVerified,
  }
  writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2) + "\n")
  console.log(
    `  Index: ${bySlug.length} slugs, ${Object.keys(byDomain).length} domains, ${Object.keys(byAlias).length} aliases`
  )

  buildLogoMap()
}

/**
 * Map slug -> logo filename, for every logo that is not a plain .png.
 *
 * ProgramLogo used to hardcode `/logos/${slug}.png`. 48 programs store their
 * logo as .jpg, .webp or .svg, so those requests 404 and the component fell
 * back to rendering the first letter of the name — the brand mark never
 * appeared, on every page that lists them.
 *
 * Reading the directory rather than hardcoding an extension list means a logo
 * saved in some future format works without touching the component.
 */
function buildLogoMap(): void {
  const overrides: Record<string, string> = {}
  let png = 0

  for (const file of readdirSync(LOGOS_DIR)) {
    const dot = file.lastIndexOf(".")
    if (dot <= 0) continue
    const slug = file.slice(0, dot)
    if (file.endsWith(".png")) {
      png++
      continue
    }
    // A slug with both foo.png and foo.jpg keeps the .png the component
    // already asks for; only record it when there is no .png to fall back on.
    overrides[slug] = file
  }

  for (const slug of Object.keys(overrides)) {
    if (readdirSync(LOGOS_DIR).includes(`${slug}.png`)) delete overrides[slug]
  }

  writeFileSync(LOGO_MAP_FILE, JSON.stringify(overrides, null, 2) + "\n")
  console.log(`  Logos: ${png} .png, ${Object.keys(overrides).length} needing an override`)
}

buildRegistry()
