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

const lines = (s: string) => s.split(/\r\n?|\n/).map((l) => l.trim()).filter(Boolean)
const optionalNumber = (s: string) => (s.trim() === "" ? null : Number(s))
/** An emptied optional field is sent as null: the apply step deletes the YAML key. */
const optionalText = (s: string) => s.trim() || null

const commissionOf = (v: ProgramValues) => ({
  type: v.type,
  rate: v.rate.trim(),
  duration: optionalText(v.duration),
  conditions: optionalText(v.conditions),
})

const payoutOf = (v: ProgramValues) => ({
  minimum: optionalNumber(v.payoutMinimum),
  currency: v.currency,
  frequency: v.frequency || null,
  methods: v.methods,
})

/**
 * Every field as the API takes it, under the YAML's keys. Commission and
 * payout are one object each: change any part and the whole group goes, so
 * the reviewer sees it together.
 */
function normalized(v: ProgramValues): Record<string, unknown> {
  return {
    commission: commissionOf(v),
    payout: payoutOf(v),
    cookie_days: optionalNumber(v.cookieDays),
    short_description: v.shortDescription.trim(),
    description: v.description.replace(/\r\n?/g, "\n").trim(),
    use_cases: lines(v.useCases),
    signup_url: optionalText(v.signupUrl),
    approval: v.approval || null,
    approval_time: optionalText(v.approvalTime),
    restrictions: lines(v.restrictions),
    marketing_materials: v.marketingMaterials,
    dedicated_manager: v.dedicatedManager,
    status: v.status,
    status_note: optionalText(v.statusNote),
  }
}

/**
 * The changes an edit sends: only fields whose normalized value differs from
 * where the form started, so spaces or blank lines alone send nothing.
 */
export function changesFrom(initial: ProgramValues, current: ProgramValues): Record<string, unknown> {
  const before = normalized(initial)
  const after = normalized(current)
  return Object.fromEntries(Object.entries(after).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(before[key])))
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
    description: v.description.replace(/\r\n?/g, "\n").trim(),
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
  ["daily", "Daily"],
  ["weekly", "Weekly"],
  ["bi-weekly", "Every two weeks"],
  ["twice-monthly", "Twice a month"],
  ["monthly", "Monthly"],
  ["quarterly", "Quarterly"],
  ["on-request", "On request"],
  ["net-30", "Net 30"],
  ["net-60", "Net 60"],
]

/** "On request" for on-request; the stored value when it has no label. */
export function frequencyLabel(f: string): string {
  return FREQUENCIES.find(([v]) => v === f)?.[1] ?? f
}
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
