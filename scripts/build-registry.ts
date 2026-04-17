import { readFileSync, writeFileSync, readdirSync } from "fs"
import { join, basename } from "path"
import { parse } from "yaml"

const PROGRAMS_DIR = join(process.cwd(), "programs")
const OUTPUT_FILE = join(process.cwd(), "src", "lib", "registry.json")

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

interface YamlProgram {
  name: string
  slug: string
  url: string
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
}

buildRegistry()
