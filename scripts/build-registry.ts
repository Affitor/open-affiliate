import { readFileSync, writeFileSync, readdirSync } from "fs"
import { join, basename } from "path"
import { parse } from "yaml"
import { aliasRoutes, noProgramProblems, nonCashAffiliate } from "./program-rules"
import { confirmedPitch, termsConfirmed } from "../src/lib/confirmed-terms"

const PROGRAMS_DIR = join(process.cwd(), "programs")
const OUTPUT_FILE = join(process.cwd(), "src", "lib", "registry.json")
const CLIENT_OUTPUT_FILE = join(process.cwd(), "src", "lib", "client-registry.json")
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

/**
 * URL fields whose schema `pattern` admits only an absolute lowercase http(s)
 * URL whose authority is only a lowercase ASCII domain name (no port, no IP
 * address, no IDN), in printable ASCII without a backslash and without
 * HTML character references (`&amp;`, `&#38;`, `&#x26;`).
 * Read from the schema, so this build (CI's
 * Validate Programs) and checkSchema in scripts/sync-affitor.ts enforce one
 * rule. See the check in validateProgram.
 */
const URL_FIELDS = ["url", "signup_url", "dashboard_url"]
const SCHEMA_PROPERTIES = (
  JSON.parse(readFileSync(join(process.cwd(), "schema", "program.schema.json"), "utf8")) as {
    properties: Record<string, { pattern?: string }>
  }
).properties

/** Status values, read from the schema like the URL patterns above. */
const STATUSES = (SCHEMA_PROPERTIES.status as { enum?: string[] }).enum ?? []

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
    mode: "percentage" | "flat" | "tiered" | "hybrid" | "unknown"
    value: number | null
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
  status?: "active" | "paused" | "discontinued" | "no_program"
  status_note?: string | null
}

function validateProgram(data: Record<string, unknown>, filename: string): void {
  for (const field of REQUIRED_FIELDS) {
    if (data[field] === undefined || data[field] === null) {
      throw new Error(`Missing required field "${field}" in ${filename}`)
    }
  }

  // PR 92: a sentence here passes a loose YAML load and then crashes
  // generate-md.ts (`restrictions.map`). Lists only.
  if (data.restrictions != null && !Array.isArray(data.restrictions)) {
    throw new Error(
      `${filename}: restrictions must be a list. PR 92 used one sentence and the production build failed.`
    )
  }

  // An unknown status would read as active: a typo like "no-program" puts the
  // page back in every list, with whatever terms the file still holds.
  // A string, compared as is: `[no_program]` coerced to "no_program" and passed,
  // while every reader compares with === and treated the entry as active.
  if (data.status != null && (typeof data.status !== "string" || !STATUSES.includes(data.status))) {
    throw new Error(`${filename}: status must be one of ${STATUSES.join(", ")} — got ${JSON.stringify(data.status)}`)
  }
  // A no_program file holds no terms and only the commission placeholder. The
  // page, .md and API hide terms anyway; this keeps them out of the YAML that
  // contributors and scripts read. Rules in scripts/program-rules.ts.
  const noProgram = noProgramProblems(data)
  if (noProgram.length) {
    throw new Error(`${filename}: status is no_program, so it holds no terms: ${noProgram.join("; ")}`)
  }

  const expectedSlug = basename(filename, ".yaml")
  if (data.slug !== expectedSlug) {
    throw new Error(
      `Slug mismatch in ${filename}: expected "${expectedSlug}", got "${data.slug}"`
    )
  }

  // The Markdown twins print these URLs for agents and readers, and every
  // looser rule let some Markdown renderer show or follow a different host
  // than the URL names. Review found, in turn: `&amp;` decoded by CommonMark;
  // an IPv6 host whose brackets the twins must encode; a backslash a URL
  // parser treats as `/` but the twins encode; a 259-character host that
  // markdown-it drops; and `%61` or `!` in a host, which markdown-it's URL
  // parser splits so the shown host differs from the real one; numeric hosts
  // (`2130706433`, `0x7f.1`, `1.2.3`) that a URL parser reads as 127.0.0.1 or
  // 1.2.0.3; and punycode, which markdown-it shows decoded, so
  // `xn--pple-43d.com` displays as a Cyrillic look-alike of apple.com. So the
  // host is an allow-list: a lowercase domain name of at least two labels of
  // letters, digits and hyphens whose last label starts with a letter, with no
  // `xn--` label. The authority is nothing but that host, because what a
  // parser does with the rest also differs from what is shown: it lowercases
  // `Flippa.com` and drops a written default port such as `:443`. The whole
  // URL is printable ASCII.
  //
  // IDN is refused outright (PR #170, review round 10), not handled. If a real
  // brand ever only has an internationalised domain, a person should decide
  // how to show it, rather than loosening this pattern.
  for (const field of URL_FIELDS) {
    const value = data[field]
    const pattern = SCHEMA_PROPERTIES[field]?.pattern
    if (typeof value === "string" && pattern && !new RegExp(pattern).test(value)) {
      // Anything outside printable ASCII is shown as \u{…}, so an invisible
      // character is visible in the error.
      const shown = value.replace(/[^\x21-\x7E]/gu, (c) => `\\u{${c.codePointAt(0)!.toString(16)}}`)
      throw new Error(
        `${filename}: ${field} breaks a URL rule: "${shown}". A URL field must be an ` +
          `absolute http:// or https:// URL (lowercase scheme) whose authority is a ` +
          `lowercase domain name and nothing else: no port and no user@. The domain uses ` +
          `only lowercase letters, digits, dots and hyphens (at most 253 characters; at ` +
          `least two labels, each 1 to 63 characters, not starting or ending with a ` +
          `hyphen; the last label starts with a letter), so no IP address, no IPv6 ` +
          `literal and no percent-encoding in the host. Internationalised domains are not ` +
          `accepted (no xn-- label); use the brand's ASCII domain. The whole URL must be ` +
          `printable ASCII with no spaces or backslash, and contain no HTML character ` +
          `reference (write "&", not "&amp;" or "&#38;").`
      )
    }
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

async function buildRegistry(): Promise<void> {
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
      // kind: affiliate with a figure that ranks, while the file's own text says
      // gift card, voucher or store credit. Rule and its limits in program-rules.ts.
      if (nonCashAffiliate(data)) {
        throw new Error(
          `kind is affiliate but the commission names a gift card, voucher or credit; set kind: referral, ` +
            `or mode: unknown and value: null if it is not cash`
        )
      }
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

  // Aliases that become URLs. Rule in program-rules.ts.
  const { routes: aliases, shadowed, clashes } = aliasRoutes(programs)
  for (const s of shadowed) console.warn(`[warn] ${s}`)
  if (clashes.length > 0) {
    console.error("Alias clashes (an alias points at one program; remove it from one file):")
    for (const c of clashes) console.error(`  - ${c}`)
    process.exit(1)
  }

  // Sort alphabetically by name
  programs.sort((a, b) => a.name.localeCompare(b.name))

  const categories = [...new Set(programs.map((p) => p.category))].sort()

  const registry = {
    generated_at: new Date().toISOString(),
    count: programs.length,
    categories,
    aliases,
    programs,
  }

  writeFileSync(OUTPUT_FILE, JSON.stringify(registry, null, 2) + "\n")

  // The Affiliate Score reads the stored cookie window, which the browser
  // must not receive for an unverified program (src/lib/confirmed-terms.ts).
  // So the score ships precomputed, by the site's own affiliateScore over the
  // registry.json just written: lists rank exactly as the server does.
  const site = await import("../src/lib/programs")
  const scoreBySlug = new Map(site.programs.map((p) => [p.slug, site.affiliateScore(p)]))

  // Client-side catalog pages need filtering and comparison fields, not the
  // long descriptions, agent prompts, restrictions, or use cases in the full
  // registry. Importing registry.json from a Client Component previously put
  // a 1.3 MB parsed JSON chunk on every route through the global search bar.
  // Keep a deliberately small projection for the three catalog UIs.
  const clientRegistry = {
    generated_at: registry.generated_at,
    count: programs.length,
    categories,
    programs: programs.map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tags: p.tags ?? [],
      commission: {
        type: p.commission.type,
        rate: p.commission.rate,
        mode: p.commission.mode,
        value: p.commission.value,
        currency: p.commission.currency,
        duration: p.commission.duration,
      },
      // Unverified: no cookie window, and no sentence stating one (confirmed-terms.ts).
      cookieDays: termsConfirmed(p) ? p.cookie_days : undefined,
      shortDescription: confirmedPitch(p, p.short_description),
      verified: p.verified ?? false,
      network: p.network ?? null,
      createdAt: p.created_at ?? "",
      source: p.source,
      score: scoreBySlug.get(p.slug),
      ...(p.status && p.status !== "active" ? { status: p.status } : {}),
    })),
  }

  writeFileSync(
    CLIENT_OUTPUT_FILE,
    JSON.stringify(clientRegistry, null, 2) + "\n"
  )

  console.log(`Registry built successfully:`)
  console.log(`  ${programs.length} programs loaded`)
  console.log(`  ${categories.length} categories: ${categories.join(", ")}`)
  console.log(`  ${Object.keys(aliases).length} alias routes`)
  console.log(`  Output: src/lib/registry.json`)
  console.log(`  Client output: src/lib/client-registry.json`)

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
 * Map slug -> logo filename for every file in public/logos.
 *
 * ProgramLogo only emits <Image> when the slug is in this map, so a YAML-only
 * program with no logo shows the letter fallback instead of a 404 <img>.
 * Prefer .png when both a png and another extension exist.
 */
function buildLogoMap(): void {
  const map: Record<string, string> = {}
  let png = 0

  for (const file of readdirSync(LOGOS_DIR)) {
    const dot = file.lastIndexOf(".")
    if (dot <= 0) continue
    const slug = file.slice(0, dot)
    const isPng = file.endsWith(".png")
    if (isPng) png++
    if (!map[slug] || isPng) map[slug] = file
  }

  writeFileSync(LOGO_MAP_FILE, JSON.stringify(map, null, 2) + "\n")
  console.log(`  Logos: ${png} .png, ${Object.keys(map).length} mapped`)
}

buildRegistry().catch((err) => {
  console.error(err)
  process.exit(1)
})
