import { readFileSync } from "node:fs"
import { gzipSync } from "node:zlib"
import {
  affiliateScore as fullAffiliateScore,
  categories as fullCategories,
  commissionDisplay as fullCommissionDisplay,
  commissionLabel as fullCommissionLabel,
  programs as fullPrograms,
} from "../src/lib/programs"
import {
  affiliateScore as clientAffiliateScore,
  categories as clientCategories,
  commissionDisplay as clientCommissionDisplay,
  commissionLabel as clientCommissionLabel,
  programs as clientPrograms,
} from "../src/lib/client-programs"

const CLIENT_REGISTRY_GZIP_BUDGET = 70_000
const clientRegistryPath = new URL(
  "../src/lib/client-registry.json",
  import.meta.url
)

function fail(message: string): never {
  throw new Error(`[client-registry] ${message}`)
}

if (clientPrograms.length !== fullPrograms.length) {
  fail(
    `program count differs: client=${clientPrograms.length}, full=${fullPrograms.length}`
  )
}

if (clientCategories.join("\n") !== fullCategories.join("\n")) {
  fail("category list differs from the full registry")
}

const clientBySlug = new Map(
  clientPrograms.map((program) => [program.slug, program])
)

for (const fullProgram of fullPrograms) {
  const clientProgram = clientBySlug.get(fullProgram.slug)
  if (!clientProgram) fail(`missing ${fullProgram.slug}`)

  const expectedProjection = {
    slug: fullProgram.slug,
    name: fullProgram.name,
    category: fullProgram.category,
    tags: fullProgram.tags,
    commission: {
      type: fullProgram.commission.type,
      rate: fullProgram.commission.rate,
      mode: fullProgram.commission.mode,
      value: fullProgram.commission.value,
      currency: fullProgram.commission.currency,
      duration: fullProgram.commission.duration ?? undefined,
    },
    cookieDays: fullProgram.cookieDays,
    shortDescription: fullProgram.shortDescription,
    verified: fullProgram.verified,
    network: fullProgram.network ?? null,
    createdAt: fullProgram.createdAt,
    source: fullProgram.source,
    descriptionAvailable: fullProgram.description.length > 20,
    agentPromptAvailable: fullProgram.agentPrompt.length > 10,
    signupAvailable: Boolean(fullProgram.signupUrl),
  }
  const normalizedClientProgram = {
    ...clientProgram,
    commission: {
      ...clientProgram.commission,
      duration: clientProgram.commission.duration ?? undefined,
    },
  }

  if (
    JSON.stringify(normalizedClientProgram) !== JSON.stringify(expectedProjection)
  ) {
    fail(`${fullProgram.slug} projection differs from the full registry`)
  }

  const checks: Array<[string, unknown, unknown]> = [
    ["name", clientProgram.name, fullProgram.name],
    ["category", clientProgram.category, fullProgram.category],
    ["cookieDays", clientProgram.cookieDays, fullProgram.cookieDays],
    ["verified", clientProgram.verified, fullProgram.verified],
    ["network", clientProgram.network, fullProgram.network],
    [
      "affiliateScore",
      clientAffiliateScore(clientProgram),
      fullAffiliateScore(fullProgram),
    ],
    [
      "commissionDisplay",
      clientCommissionDisplay(clientProgram.commission),
      fullCommissionDisplay(fullProgram.commission),
    ],
    [
      "commissionLabel",
      clientCommissionLabel(clientProgram.commission),
      fullCommissionLabel(fullProgram.commission),
    ],
  ]

  for (const [field, clientValue, fullValue] of checks) {
    if (!Object.is(clientValue, fullValue)) {
      fail(
        `${fullProgram.slug}.${field} differs: client=${String(clientValue)}, full=${String(fullValue)}`
      )
    }
  }
}

const raw = readFileSync(clientRegistryPath)
const gzipBytes = gzipSync(raw).byteLength
if (gzipBytes > CLIENT_REGISTRY_GZIP_BUDGET) {
  fail(
    `gzip size ${gzipBytes} exceeds ${CLIENT_REGISTRY_GZIP_BUDGET} byte budget`
  )
}

console.log(
  `Client registry verified: ${clientPrograms.length} programs, ${gzipBytes} gzip bytes`
)
