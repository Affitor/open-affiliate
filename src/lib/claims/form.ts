import type { Program } from "@/lib/programs"

/**
 * The owner forms (edit a listing, add a program) as plain strings and flags,
 * and the conversion to what the API takes (YAML keys, spec v4 §5.1 and §6).
 * No React here, so the conversion is tested with the API in claims.test.ts.
 */
export interface ProgramValues {
  type: string
  rate: string
  duration: string
  conditions: string
  cookieDays: string
  payoutMinimum: string
  currency: string
  frequency: string
  methods: string[]
  shortDescription: string
  description: string
  useCases: string
  signupUrl: string
  approval: string
  approvalTime: string
  restrictions: string
  marketingMaterials: boolean
  dedicatedManager: boolean
  status: string
  statusNote: string
}

export const EMPTY_VALUES: ProgramValues = {
  type: "recurring",
  rate: "",
  duration: "",
  conditions: "",
  cookieDays: "",
  payoutMinimum: "",
  currency: "USD",
  frequency: "",
  methods: [],
  shortDescription: "",
  description: "",
  useCases: "",
  signupUrl: "",
  approval: "",
  approvalTime: "",
  restrictions: "",
  marketingMaterials: false,
  dedicatedManager: false,
  status: "active",
  statusNote: "",
}

/** The form's starting values: the listing as a reader sees it (pass confirmedTerms(program)). */
export function valuesOf(p: Program): ProgramValues {
  return {
    type: p.commission.type,
    rate: p.commission.rate == null ? "" : String(p.commission.rate),
    duration: p.commission.duration ?? "",
    conditions: p.commission.conditions ?? "",
    cookieDays: p.cookieDays == null ? "" : String(p.cookieDays),
    payoutMinimum: p.payout.minimum == null ? "" : String(p.payout.minimum),
    currency: p.payout.currency ?? "USD",
    frequency: p.payout.frequency ?? "",
    methods: p.payoutMethods ?? [],
    shortDescription: p.shortDescription ?? "",
    description: p.description ?? "",
    useCases: (p.agentUseCases ?? []).join("\n"),
    signupUrl: p.signupUrl ?? "",
    approval: p.approval ?? "",
    approvalTime: p.approvalTime ?? "",
    restrictions: (p.restrictions ?? []).join("\n"),
    marketingMaterials: p.marketingMaterials ?? false,
    dedicatedManager: p.dedicatedManager ?? false,
    status: p.status ?? "active",
    statusNote: p.statusNote ?? "",
  }
}

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean)
const optionalNumber = (s: string) => (s.trim() === "" ? null : Number(s))

const commissionOf = (v: ProgramValues) => ({
  type: v.type,
  rate: v.rate.trim(),
  duration: v.duration.trim(),
  conditions: v.conditions.trim(),
})

const payoutOf = (v: ProgramValues) => ({
  minimum: optionalNumber(v.payoutMinimum),
  currency: v.currency,
  frequency: v.frequency || null,
  methods: v.methods,
})

/** Groups the YAML holds as one object: change any part and the whole group goes, so the reviewer sees it together. */
const GROUPS: Record<string, (keyof ProgramValues)[]> = {
  commission: ["type", "rate", "duration", "conditions"],
  payout: ["payoutMinimum", "currency", "frequency", "methods"],
}

/** The changes an edit sends: only what differs from where the form started, under the YAML's keys. */
export function changesFrom(initial: ProgramValues, current: ProgramValues): Record<string, unknown> {
  const differs = (k: keyof ProgramValues) => JSON.stringify(initial[k]) !== JSON.stringify(current[k])
  const out: Record<string, unknown> = {}
  if (GROUPS.commission.some(differs)) out.commission = commissionOf(current)
  if (GROUPS.payout.some(differs)) out.payout = payoutOf(current)
  if (differs("cookieDays")) out.cookie_days = optionalNumber(current.cookieDays)
  if (differs("shortDescription")) out.short_description = current.shortDescription.trim()
  if (differs("description")) out.description = current.description.trim()
  if (differs("useCases")) out.use_cases = lines(current.useCases)
  if (differs("signupUrl")) out.signup_url = current.signupUrl.trim()
  if (differs("approval") && current.approval) out.approval = current.approval
  if (differs("approvalTime")) out.approval_time = current.approvalTime.trim()
  if (differs("restrictions")) out.restrictions = lines(current.restrictions)
  if (differs("marketingMaterials")) out.marketing_materials = current.marketingMaterials
  if (differs("dedicatedManager")) out.dedicated_manager = current.dedicatedManager
  if (differs("status")) out.status = current.status
  if (differs("statusNote")) out.status_note = current.statusNote.trim()
  return out
}

/** True when the changes touch what affiliates earn, so a terms page is required. */
export function touchesMoney(changes: Record<string, unknown>): boolean {
  return "commission" in changes || "payout" in changes || "cookie_days" in changes
}

/** A new program as the API takes it (spec v4 §6). Empty optional parts are left out. */
export function newProgramFrom(
  product: { name: string; url: string; category: string },
  v: ProgramValues,
): Record<string, unknown> {
  const payout = payoutOf(v)
  const hasPayout = payout.minimum !== null || v.frequency !== "" || v.methods.length > 0 || v.currency !== "USD"
  return {
    name: product.name.trim(),
    url: product.url.trim(),
    category: product.category,
    commission: commissionOf(v),
    short_description: v.shortDescription.trim(),
    description: v.description.trim(),
    ...(v.signupUrl.trim() ? { signup_url: v.signupUrl.trim() } : {}),
    ...(v.cookieDays.trim() ? { cookie_days: optionalNumber(v.cookieDays) } : {}),
    ...(hasPayout ? { payout } : {}),
  }
}

// Choices the forms offer, with the words a person reads. claims.test.ts
// checks every value against the schema's enum, so the two cannot drift.
export const COMMISSION_TYPES: [string, string][] = [
  ["recurring", "Recurring"],
  ["one-time", "One-time"],
  ["tiered", "Tiered"],
  ["hybrid", "Hybrid"],
]
export const FREQUENCIES: [string, string][] = [
  ["", "Not stated"],
  ["weekly", "Weekly"],
  ["monthly", "Monthly"],
  ["net-30", "Net 30"],
  ["net-60", "Net 60"],
]
export const PAYOUT_METHODS: [string, string][] = [
  ["paypal", "PayPal"],
  ["bank", "Bank"],
  ["wise", "Wise"],
  ["stripe", "Stripe"],
  ["crypto", "Crypto"],
  ["check", "Check"],
]
export const APPROVALS: [string, string][] = [
  ["auto", "Automatic"],
  ["manual", "Reviewed by us"],
  ["invite-only", "Invite only"],
]
export const STATUSES: [string, string][] = [
  ["active", "Active"],
  ["paused", "Paused"],
  ["discontinued", "Ended"],
]
export const CATEGORIES = [
  "AI", "Analytics", "Business Operations", "Communication", "Content Management", "CRM", "Customer Support",
  "Design", "Developer Tools", "E-Commerce", "Email Marketing", "Finance", "HR & Recruiting", "Infrastructure",
  "Marketing", "Productivity", "SaaS", "Sales", "Security", "Social Media",
]
