import registryData from "./registry.json"

export interface Program {
  slug: string
  name: string
  url: string
  logo: string
  category: string
  commission: {
    type: "recurring" | "one-time" | "tiered"
    rate: string | number
    currency: string
    duration?: string | null
    conditions?: string | null
  }
  cookieDays: number
  payout: {
    minimum: number
    currency?: string
    frequency: string
    methods?: string[]
  }
  description: string
  shortDescription: string
  tags: string[]
  stars: number
  verified: boolean
  agentPrompt: string
  submittedBy: string
  createdAt: string
  // Extended fields from YAML
  signupUrl?: string
  approval?: string
  approvalTime?: string
  restrictions?: string[]
  commissionDuration?: string | null
  commissionConditions?: string | null
  attribution?: string
  trackingMethod?: string
  payoutMethods?: string[]
  marketingMaterials?: boolean
  apiAvailable?: boolean
  dedicatedManager?: boolean
  dashboardUrl?: string | null
  network?: string | null
  programAge?: string | null
  agentKeywords?: string[]
  agentUseCases?: string[]
}

// Map snake_case YAML fields to camelCase Program interface
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapYamlToProgram(yaml: any): Program {
  return {
    slug: yaml.slug,
    name: yaml.name,
    url: yaml.url,
    logo: yaml.name.charAt(0).toUpperCase(),
    category: yaml.category,
    commission: {
      type: yaml.commission.type as "recurring" | "one-time" | "tiered",
      rate: yaml.commission.rate,
      currency: yaml.commission.currency,
      duration: yaml.commission.duration ?? null,
      conditions: yaml.commission.conditions ?? null,
    },
    cookieDays: yaml.cookie_days,
    payout: {
      minimum: yaml.payout.minimum,
      currency: yaml.payout.currency,
      frequency: yaml.payout.frequency,
      methods: yaml.payout.methods ?? [],
    },
    description: yaml.description?.trim() ?? "",
    shortDescription: yaml.short_description ?? "",
    tags: yaml.tags ?? [],
    stars: 0,
    verified: yaml.verified ?? false,
    agentPrompt: yaml.agents?.prompt?.trim() ?? "",
    submittedBy: yaml.submitted_by ?? "community",
    createdAt: yaml.created_at ?? "",
    // Extended fields
    signupUrl: yaml.signup_url,
    approval: yaml.approval,
    approvalTime: yaml.approval_time,
    restrictions: yaml.restrictions ?? [],
    commissionDuration: yaml.commission.duration ?? null,
    commissionConditions: yaml.commission.conditions ?? null,
    attribution: yaml.attribution,
    trackingMethod: yaml.tracking_method,
    payoutMethods: yaml.payout.methods ?? [],
    marketingMaterials: yaml.marketing_materials ?? false,
    apiAvailable: yaml.api_available ?? false,
    dedicatedManager: yaml.dedicated_manager ?? false,
    dashboardUrl: yaml.dashboard_url ?? null,
    network: yaml.network ?? null,
    programAge: yaml.program_age ?? null,
    agentKeywords: yaml.agents?.keywords ?? [],
    agentUseCases: yaml.agents?.use_cases ?? [],
  }
}

export const programs: Program[] = (registryData.programs as unknown[]).map(mapYamlToProgram)

export const categories = registryData.categories as string[]

export function getProgram(slug: string): Program | undefined {
  return programs.find((p) => p.slug === slug)
}

export function searchPrograms(query: string, category?: string): Program[] {
  let results = programs
  if (category) {
    results = results.filter((p) => p.category === category)
  }
  if (query) {
    const q = query.toLowerCase()
    results = results.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.shortDescription.toLowerCase().includes(q) ||
        p.tags.some((t) => t.includes(q)) ||
        p.category.toLowerCase().includes(q)
    )
  }
  return results.sort((a, b) => b.stars - a.stars)
}
