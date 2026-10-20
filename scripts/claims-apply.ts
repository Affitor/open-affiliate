/**
 * Claim v4 apply step (spec §7.1): every queued owner change becomes one
 * data PR "claim: <slug>", and a merged PR marks its change applied.
 *
 *   npx tsx scripts/claims-apply.ts           # dry run: prints the plan, writes nothing
 *   npx tsx scripts/claims-apply.ts --write   # opens PRs, records pr_url, marks merged ones applied
 *   npx tsx scripts/claims-apply.ts --record <edit-id> <pr-url>   # a new program's intake PR
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (run it under
 * ~/cos/bin/run-masked) and an authenticated `gh`. It never requests an owner's
 * URL: the reviewer opens terms_url, so there is nothing here to point inward.
 *
 * Owner text is data. The PR body shows it in fences, every invisible code
 * point spelled out, and the reviewer's checklist says what to refuse.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { Document, parse as parseYaml } from "yaml"
import { parseCommissionMode } from "../src/lib/commission-mode"
import { registrableDomain, unclaimableReason } from "../src/lib/claims/rules"
import { AFFITOR_EDITABLE, EditChanges, alreadyListed, pageKey, slugFor, type ClaimProgram } from "../src/lib/claims/service"
import { DELETE, checkReadBack, checkSchema, edit, type Diff, type Edit } from "./sync-affitor"

/** A claim_edits row with the claim it was sent under (program_claims). */
export interface QueuedEdit {
  id: string
  slug: string
  kind: "edit" | "new"
  status: string
  pr_url: string | null
  fields: Record<string, unknown>
  created_at: string
  claim: { domain: string; status: string; verified_at: string | null } | null
}

export type Plan =
  | { action: "pr"; edit: QueuedEdit; file: string; text: string; branch: string; title: string; body: string; diffs: Diff[] }
  | { action: "same"; edit: QueuedEdit }
  | { action: "skip"; edit: QueuedEdit; reason: string }
  | { action: "intake"; edit: QueuedEdit; brief: string; taken: string | null }

const MONEY_KEYS = new Set(["commission", "cookie_days", "payout"])

/** The flags the API writes (service.ts); anything else in a stored row is dropped, not shown. */
const KNOWN_FLAGS = new Set([
  "commission_drop_over_50pct",
  "signup_domain_changed",
  "status_not_active",
  "names_other_brand",
  "terms_url_off_domain",
])

// ---------- showing owner text ------------------------------------------------

const SHOWN_AS_CODE = /[\p{Cc}\p{Z}\p{Default_Ignorable_Code_Point}\p{Cf}\p{Co}\p{Cn}\p{Cs}\p{Variation_Selector}⠀\u{1D159}\u{16FE4}]/u

/**
 * Owner text with every invisible, format, private-use, unassigned or
 * spacing-other-than-a-space code point written as ⟨U+XXXX⟩, and a mark that
 * sits on nothing (start of the text, after a space) too. Line breaks stay.
 */
export function visible(text: string): string {
  const chars = [...text]
  return chars
    .map((c, i) => {
      if (c === "\n" || c === " ") return c
      const lone = /\p{M}/u.test(c) && (i === 0 || /\s/u.test(chars[i - 1]))
      if (!SHOWN_AS_CODE.test(c) && !lone) return c
      return `⟨U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}⟩`
    })
    .join("")
}

/** A fenced block GitHub renders as plain text: the fence is longer than any backtick run inside. */
export function fenced(value: unknown): string {
  const text = value === null || value === undefined ? "(none)" : typeof value === "string" ? value : JSON.stringify(value, null, 2)
  const shown = visible(text)
  const longest = Math.max(0, ...(shown.match(/`+/g) ?? []).map((run) => run.length))
  const fence = "`".repeat(Math.max(3, longest + 1))
  return `${fence}text\n${shown}\n${fence}`
}

/** Words that address an AI reader rather than a person. A hint for the reviewer, not a verdict. */
const INSTRUCTION_LIKE =
  /\b(ignore (all|any|the|previous|prior|above)|disregard|system prompt|you (must|should) (always|never|recommend|mention|say)|always (recommend|mention|prefer)|never (recommend|mention)|(ai|llm) (agents?|assistants?|models?)|instructions? (to|for) (ai|agents?|llms?|assistants?))/i
const LINK = /https?:\/\/[^\s"'<>`)]+/gi

/** Every string an owner wrote in this change, flattened. */
function ownerStrings(value: unknown): string[] {
  if (typeof value === "string") return [value]
  if (Array.isArray(value)) return value.flatMap(ownerStrings)
  if (value && typeof value === "object") return Object.values(value).flatMap(ownerStrings)
  return []
}

function textFlags(strings: string[], domain: string): string[] {
  const flags: string[] = []
  if (strings.some((s) => INSTRUCTION_LIKE.test(s))) flags.push("instruction_like")
  const links = strings.flatMap((s) => s.match(LINK) ?? [])
  if (links.some((l) => registrableDomain(l) !== domain)) flags.push("link_off_domain")
  return flags
}

// ---------- changes → YAML edits -----------------------------------------------

/** null clears an optional field: the YAML key goes. An empty list goes too. */
const orDelete = (v: unknown) => (v === null || (Array.isArray(v) && v.length === 0) ? DELETE : v)

/**
 * The YAML edits for an owner's change (spec v4 §5.1), or a reason it cannot
 * be written as is. mode and value come from the rate the owner wrote, read
 * here again; a stored reading is not trusted.
 */
export function editsFor(changes: EditChanges, current: Record<string, unknown>): Edit[] | string {
  const edits: Edit[] = []
  const set = (path: string[], v: unknown) => {
    if (v !== undefined) edits.push([path, orDelete(v)])
  }
  if (changes.commission) {
    const c = changes.commission
    const read = parseCommissionMode(c.rate)
    const currency = (current.commission as Record<string, unknown> | undefined)?.currency
    // The form has no currency: a flat amount needs one the listing already states (missing, null and "" do not count).
    if (read.mode === "flat" && (typeof currency !== "string" || !currency)) return "flat_needs_currency"
    set(["commission", "type"], c.type)
    set(["commission", "rate"], c.rate)
    edits.push([["commission", "mode"], read.mode], [["commission", "value"], read.value])
    set(["commission", "duration"], c.duration)
    set(["commission", "conditions"], c.conditions)
  }
  set(["cookie_days"], changes.cookie_days)
  if (changes.payout) {
    set(["payout", "minimum"], changes.payout.minimum)
    set(["payout", "currency"], changes.payout.currency)
    set(["payout", "frequency"], changes.payout.frequency)
    set(["payout", "methods"], changes.payout.methods)
  }
  set(["short_description"], changes.short_description)
  set(["description"], changes.description)
  set(["agents", "use_cases"], changes.use_cases)
  set(["signup_url"], changes.signup_url)
  set(["approval"], changes.approval)
  set(["approval_time"], changes.approval_time)
  set(["restrictions"], changes.restrictions)
  set(["marketing_materials"], changes.marketing_materials)
  set(["dedicated_manager"], changes.dedicated_manager)
  set(["status"], changes.status)
  set(["status_note"], changes.status_note)
  return edits
}

/**
 * agents.use_cases spliced into the file: renderEdited re-renders a whole
 * top-level entry, which would unfold the hand-wrapped agents.prompt into
 * the diff. The block is every line under "agents:" up to the next line at
 * column 0; use_cases is its "  use_cases:" line and its items.
 */
function withUseCases(src: string, useCases: unknown): string {
  const lines = src.split("\n")
  const start = lines.indexOf("agents:")
  if (start < 0) throw new Error("agents is not a block")
  let end = start + 1
  while (end < lines.length && (lines[end] === "" || lines[end].startsWith(" "))) end++
  while (end > start + 1 && lines[end - 1] === "") end--
  const at = lines.findIndex((l, i) => i > start && i < end && l.startsWith("  use_cases:"))
  let stop = at + 1
  // Its items sit deeper, or at the key's own indent ("  - x", as many files have).
  while (at >= 0 && stop < end && (lines[stop] === "" || lines[stop].startsWith("   ") || lines[stop].startsWith("  - "))) stop++
  const rendered =
    useCases === DELETE
      ? []
      : new Document({ use_cases: useCases })
          .toString({ lineWidth: 0 })
          .trimEnd()
          .split("\n")
          .map((l) => `  ${l}`)
  const out = at >= 0 ? [...lines.slice(0, at), ...rendered, ...lines.slice(stop)] : [...lines.slice(0, end), ...rendered, ...lines.slice(end)]
  return out.join("\n")
}

/**
 * The file with the owner's edits, or null text when main already says
 * this. Proof, beyond the read-back of each edit: every other value in the
 * file parses exactly as before.
 */
function written(src: string, listing: Record<string, unknown>, edits: Edit[], stamps: Edit[], file: string): { text: string | null; diffs: Diff[] } {
  const useCases = edits.find(([path]) => path[0] === "agents")
  const result = edit(src, edits.filter((e) => e !== useCases), stamps, file)
  let text = result.text
  const diffs = [...result.diffs]
  const agents = (listing.agents ?? {}) as Record<string, unknown>
  const before = agents.use_cases ?? null
  if (useCases && !(useCases[1] === DELETE ? before === null : isDeepStrictEqual(before, useCases[1]))) {
    checkSchema([useCases], file)
    text = withUseCases(text ?? src, useCases[1])
    diffs.push({ field: "agents.use_cases", from: before, to: useCases[1] === DELETE ? null : useCases[1] })
  }
  if (!text) return { text: null, diffs }
  checkReadBack(text, [...edits, ...stamps], file)
  const after = parseYaml(text) as Record<string, unknown>
  const touched = new Set(diffs.map((d) => d.field))
  for (const key of new Set([...Object.keys(listing), ...Object.keys(after)])) {
    const field = (sub: string) => `${key}.${sub}`
    const a = listing[key]
    const b = after[key]
    if (touched.has(key)) continue
    if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a)) {
      const left = Object.fromEntries(Object.entries(a).filter(([k]) => !touched.has(field(k))))
      const right = Object.fromEntries(Object.entries(b).filter(([k]) => !touched.has(field(k))))
      if (!isDeepStrictEqual(left, right)) throw new Error(`${file}: ${key} changed beyond the edit`)
    } else if (!isDeepStrictEqual(a, b)) throw new Error(`${file}: ${key} changed beyond the edit`)
  }
  return { text, diffs }
}

/** The listing's domain when the claim still owns it; null otherwise. */
function ownedDomain(row: QueuedEdit, listing: Record<string, unknown>): string | null {
  const c = row.claim
  if (!c || c.status !== "active" || !c.verified_at) return null
  const url = typeof listing.url === "string" ? listing.url : ""
  if (listing.slug !== row.slug || unclaimableReason(url)) return null
  return registrableDomain(url) === c.domain ? c.domain : null
}

const branchFor = (row: QueuedEdit) => `claim/${row.slug}-${row.id.slice(0, 8)}`

/** Plan one queued owner edit against the registry at origin/main (`repo`). */
export function planEdit(row: QueuedEdit, repo: string, today: string): Plan {
  const file = join("programs", `${row.slug}.yaml`)
  const path = join(repo, file)
  if (!/^[a-z0-9-]+$/.test(row.slug) || !existsSync(path)) return { action: "skip", edit: row, reason: "listing_gone" }
  const src = readFileSync(path, "utf8")
  const listing = (parseYaml(src) ?? {}) as Record<string, unknown>
  const domain = ownedDomain(row, listing)
  if (!domain) return { action: "skip", edit: row, reason: "not_owner" }
  const parsed = EditChanges.safeParse(row.fields.changes)
  if (!parsed.success) return { action: "skip", edit: row, reason: "invalid_change" }
  const changes = parsed.data
  const keys = Object.keys(changes)
  if (keys.length === 0) return { action: "skip", edit: row, reason: "invalid_change" }
  if (listing.network === "affitor" && keys.some((k) => !AFFITOR_EDITABLE.has(k))) {
    return { action: "skip", edit: row, reason: "synced_field" }
  }
  const edits = editsFor(changes, listing)
  if (typeof edits === "string") return { action: "skip", edit: row, reason: edits }
  // Every money field is checked against terms_url before this merges (spec v4 §5.3).
  const money = keys.some((k) => MONEY_KEYS.has(k))
  const stamps: Edit[] = money ? [[["verified"], true], [["last_verified_at"], today]] : []
  let result: { text: string | null; diffs: Diff[] }
  try {
    result = written(src, listing, edits, stamps, file)
  } catch (e) {
    // Our file's layout (JSON-style YAML, an inline agents map) is a person's
    // job; a value the schema refuses goes back to the owner.
    const ours = e instanceof Error && /does not parse|reads back|beyond the edit|not a block/.test(e.message)
    return { action: "skip", edit: row, reason: ours ? "layout" : "schema" }
  }
  if (!result.text) return { action: "same", edit: row }

  const termsUrl = typeof row.fields.terms_url === "string" ? row.fields.terms_url : null
  const note = typeof row.fields.note === "string" ? row.fields.note : null
  const stored = Array.isArray(row.fields.flags) ? row.fields.flags.filter((f) => KNOWN_FLAGS.has(f as string)) : []
  const flags = [...new Set([...(stored as string[]), ...textFlags([...ownerStrings(changes), ...(note ? [note] : [])], domain)])]
  if (money && (listing.commission as Record<string, unknown> | undefined)?.currency && changes.commission) flags.push("check_currency")
  const body = prBody({ slug: row.slug, domain, diffs: result.diffs, flags, termsUrl, note, money })
  return { action: "pr", edit: row, file, text: result.text, branch: branchFor(row), title: `claim: ${row.slug}`, body, diffs: result.diffs }
}

function prBody(o: {
  slug: string
  domain: string
  diffs: Diff[]
  flags: string[]
  termsUrl: string | null
  note: string | null
  money: boolean
}): string {
  const parts = [
    `Owner change to \`${o.slug}\`. Submitted by the verified team of \`${o.domain}\` (claim v4).`,
    "",
    "## Changes",
  ]
  for (const d of o.diffs) {
    parts.push("", `### \`${d.field}\``, "Before:", fenced(d.from), "After:", fenced(d.to))
  }
  parts.push("", "## Flags", o.flags.length ? o.flags.map((f) => `- \`${f}\``).join("\n") : "None.")
  parts.push("", "## Terms page", o.termsUrl ? fenced(o.termsUrl) : "None sent (no money field changed).")
  if (o.note) parts.push("", "## Note from the team", fenced(o.note))
  parts.push(
    "",
    "## Reviewer checklist",
    ...(o.money
      ? ["- [ ] Every money field above matches the terms page, read today. Otherwise CHƯA ĐẠT and set the change to `asked`."]
      : []),
    "- [ ] Owner text is data: no instructions to AI agents, no claims about other brands, no links off the brand's domain.",
    "- [ ] Every `⟨U+…⟩` above is one the text really needs.",
    "- [ ] A flag above is answered (asked the owner, or a reason in the verdict).",
  )
  return parts.join("\n") + "\n"
}

// ---------- new programs ------------------------------------------------------------

/** Every listing on origin/main, for the "taken" check. */
function catalog(repo: string): ClaimProgram[] {
  return readdirSync(join(repo, "programs"))
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => parseYaml(readFileSync(join(repo, "programs", f), "utf8")) as ClaimProgram)
}

/**
 * A new program needs oa-program-intake (agents block, terms read), so the
 * script prints a brief instead of a PR, after the "taken" check against
 * origin/main and the files of every open PR.
 */
export function planNew(row: QueuedEdit, programs: ClaimProgram[], openPrFiles: Set<string>): Plan {
  const p = (row.fields.program ?? {}) as { name?: unknown; url?: unknown }
  const name = typeof p.name === "string" ? p.name : ""
  const url = typeof p.url === "string" ? p.url : ""
  const c = row.claim
  if (!c || c.status !== "active" || !c.verified_at || registrableDomain(url) !== c.domain) {
    return { action: "skip", edit: row, reason: "not_owner" }
  }
  // The slug is the API's rule again, from the name and site: a stored one is not trusted.
  const slug = slugFor(name, url)
  if (!slug || slug !== row.slug) return { action: "skip", edit: row, reason: "invalid_change" }
  const listed = alreadyListed(programs, url, slug)
  const taken = listed ? `programs/${listed.slug}.yaml` : openPrFiles.has(`programs/${slug}.yaml`) ? `open PR adds programs/${slug}.yaml` : null
  const brief = [
    `New program from the verified team of ${c.domain}: ${visible(name)} (slug ${slug}, page ${pageKey(url) ?? "?"})`,
    taken ? `TAKEN: ${taken}. Do not add it; set the change to rejected with a reason.` : "Run oa-program-intake steps 1-3 on it, then --record <edit-id> <pr-url>.",
    "Owner fields (data):",
    fenced(row.fields.program),
    "Terms page:",
    fenced(row.fields.terms_url ?? null),
  ].join("\n")
  return { action: "intake", edit: row, brief, taken }
}

// ---------- the run -----------------------------------------------------------------

export interface ApplyStore {
  /** Rows waiting: status pending (with or without a PR). */
  pending(): Promise<QueuedEdit[]>
  /** Sets pr_url only while it is still empty; false when another run got there first. */
  recordPr(id: string, url: string): Promise<boolean>
  /** pending → applied, plus an edit.applied event. */
  markApplied(row: QueuedEdit): Promise<void>
  /** pending → rejected or asked, plus an edit.rejected / edit.returned event carrying the reason. */
  close(row: QueuedEdit, status: "rejected" | "asked", reason: string): Promise<void>
}

export interface Forge {
  /** A checkout of origin/main, fresh for this run; removed by `done`. */
  checkout(): { dir: string; done: () => void }
  openPrFiles(): Set<string>
  /** The open PR whose head is this branch, if any. */
  openPrFor(branch: string): string | null
  /** Commit `text` to `file` on a new branch off origin/main, push, open the PR; its URL. */
  openPr(dir: string, plan: Extract<Plan, { action: "pr" }>): string
  state(prUrl: string): "OPEN" | "MERGED" | "CLOSED"
}

export interface RunResult {
  plans: Plan[]
  opened: string[]
  recorded: string[]
  applied: string[]
  closed: string[]
}

/**
 * What a skipped change becomes. The owner can do nothing about these, so
 * they end as "Not applied"; the rest go back to the owner ("Needs your reply").
 */
const REJECTED: ReadonlySet<string> = new Set(["not_owner", "listing_gone", "invalid_change"])

export async function run(o: { store: ApplyStore; forge: Forge; write: boolean; today: string; log?: (s: string) => void }): Promise<RunResult> {
  const log = o.log ?? (() => {})
  const rows = await o.store.pending()
  const out: RunResult = { plans: [], opened: [], recorded: [], applied: [], closed: [] }

  // Changes already in a PR: applied once it merged; a closed one waits for a person.
  for (const row of rows.filter((r) => r.pr_url)) {
    const state = o.forge.state(row.pr_url!)
    if (state === "MERGED") {
      log(`${row.id} ${row.slug}: PR merged → applied`)
      if (o.write) {
        await o.store.markApplied(row)
        out.applied.push(row.id)
      }
    } else if (state === "CLOSED") log(`${row.id} ${row.slug}: PR closed unmerged, a person sets rejected or asked`)
  }

  const fresh = rows.filter((r) => !r.pr_url)
  if (!fresh.length) return out
  const { dir, done } = o.forge.checkout()
  try {
    const programs = fresh.some((r) => r.kind === "new") ? catalog(dir) : []
    const prFiles = fresh.some((r) => r.kind === "new") ? o.forge.openPrFiles() : new Set<string>()
    for (const row of fresh) {
      const plan = row.kind === "new" ? planNew(row, programs, prFiles) : planEdit(row, dir, o.today)
      out.plans.push(plan)
      if (plan.action === "skip" && plan.reason === "layout") log(`${row.id} ${row.slug}: the file's layout needs a person, left pending`)
      else if (plan.action === "skip") {
        const status = REJECTED.has(plan.reason) ? "rejected" : "asked"
        log(`${row.id} ${row.slug}: ${status} (${plan.reason})`)
        if (o.write) {
          await o.store.close(row, status, plan.reason)
          out.closed.push(row.id)
        }
      }
      if (plan.action === "same") log(`${row.id} ${row.slug}: main already says this, no PR`)
      if (plan.action === "intake") log(`${row.id}\n${plan.brief}`)
      if (plan.action !== "pr") continue
      log(`${row.id} ${row.slug}: PR ${plan.branch} (${plan.diffs.map((d) => d.field).join(", ")})`)
      if (!o.write) continue
      // A run that pushed and died before recording finds its PR by branch.
      // Runs are meant to be serial; a racing second run fails its push
      // (no force) and the next run records the PR the first one opened.
      let url: string
      try {
        url = o.forge.openPrFor(plan.branch) ?? o.forge.openPr(dir, plan)
      } catch {
        log(`${row.id} ${row.slug}: could not open the PR, left pending for the next run`)
        continue
      }
      out.opened.push(url)
      if (await o.store.recordPr(row.id, url)) out.recorded.push(row.id)
    }
  } finally {
    done()
  }
  return out
}

// ---------- real store and forge -----------------------------------------------------

const PR_URL = /^https:\/\/github\.com\/Affitor\/open-affiliate\/pull\/\d+$/

function sh(cmd: string, args: string[], cwd?: string, input?: string): string {
  return execFileSync(cmd, args, { cwd, input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim()
}

function gitForge(root: string): Forge {
  return {
    checkout() {
      sh("git", ["fetch", "-q", "origin", "main"], root)
      const dir = mkdtempSync(join(tmpdir(), "claims-apply-"))
      sh("git", ["worktree", "add", "-q", "--detach", dir, "origin/main"], root)
      return {
        dir,
        done: () => {
          sh("git", ["worktree", "remove", "--force", dir], root)
          rmSync(dir, { recursive: true, force: true })
        },
      }
    },
    openPrFiles() {
      const prs = JSON.parse(sh("gh", ["pr", "list", "--state", "open", "--limit", "500", "--json", "files"], root)) as { files: { path: string }[] }[]
      return new Set(prs.flatMap((p) => p.files.map((f) => f.path)))
    },
    openPrFor(branch) {
      const prs = JSON.parse(sh("gh", ["pr", "list", "--state", "open", "--head", branch, "--json", "url"], root)) as { url: string }[]
      return prs[0]?.url ?? null
    },
    openPr(dir, plan) {
      sh("git", ["checkout", "-q", "-b", plan.branch], dir)
      writeFileSync(join(dir, plan.file), plan.text)
      sh("git", ["add", plan.file], dir)
      sh("git", ["commit", "-q", "-m", plan.title], dir)
      // No force: a second run racing this one fails here instead of replacing it.
      sh("git", ["push", "-q", "origin", plan.branch], dir)
      const url = sh("gh", ["pr", "create", "--head", plan.branch, "--base", "main", "--title", plan.title, "--body-file", "-"], dir, plan.body)
      sh("git", ["checkout", "-q", "--detach", "origin/main"], dir)
      const last = url.split("\n").pop()!
      if (!PR_URL.test(last)) throw new Error(`gh pr create returned no PR URL for ${plan.branch}`)
      return last
    },
    state(prUrl) {
      return JSON.parse(sh("gh", ["pr", "view", prUrl, "--json", "state"], root)).state
    },
  }
}

async function supabaseStore(): Promise<ApplyStore> {
  const { createClient } = await import("@supabase/supabase-js")
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed (run under run-masked)")
  const db = createClient(url, key, { auth: { persistSession: false } })
  return {
    async pending() {
      const { data, error } = await db
        .from("claim_edits")
        .select("id, slug, kind, status, pr_url, fields, created_at, claim:program_claims(domain, status, verified_at)")
        .eq("status", "pending")
        .order("created_at")
      if (error) throw new Error(`claim_edits: ${error.code ?? "read failed"}`)
      return (data ?? []) as unknown as QueuedEdit[]
    },
    async recordPr(id, prUrl) {
      const { data, error } = await db.from("claim_edits").update({ pr_url: prUrl }).eq("id", id).is("pr_url", null).select("id")
      if (error) throw new Error(`claim_edits update: ${error.code ?? "failed"}`)
      return (data ?? []).length === 1
    },
    async close(row, status, reason) {
      const { data, error } = await db.from("claim_edits").update({ status }).eq("id", row.id).eq("status", "pending").select("id")
      if (error) throw new Error(`claim_edits update: ${error.code ?? "failed"}`)
      if ((data ?? []).length !== 1) return
      const type = status === "rejected" ? "edit.rejected" : "edit.returned"
      const ev = await db.from("claim_events").insert({ type, slug: row.slug, domain: row.claim?.domain ?? null, meta: { edit_id: row.id, reason } })
      if (ev.error) throw new Error(`claim_events insert: ${ev.error.code ?? "failed"}`)
    },
    async markApplied(row) {
      const { data, error } = await db.from("claim_edits").update({ status: "applied" }).eq("id", row.id).eq("status", "pending").select("id")
      if (error) throw new Error(`claim_edits update: ${error.code ?? "failed"}`)
      if ((data ?? []).length !== 1) return
      const ev = await db.from("claim_events").insert({ type: "edit.applied", slug: row.slug, domain: row.claim?.domain ?? null, meta: { edit_id: row.id, pr_url: row.pr_url } })
      if (ev.error) throw new Error(`claim_events insert: ${ev.error.code ?? "failed"}`)
    },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const root = sh("git", ["rev-parse", "--show-toplevel"])
  const today = new Date().toISOString().slice(0, 10)
  const main = async () => {
    const store = await supabaseStore()
    if (args[0] === "--record") {
      const [, id, prUrl] = args
      if (!id || !PR_URL.test(prUrl ?? "")) throw new Error("usage: --record <edit-id> <https://github.com/Affitor/open-affiliate/pull/N>")
      console.log((await store.recordPr(id, prUrl)) ? "recorded" : "not recorded: the change already has a PR")
      return
    }
    const write = args.includes("--write")
    const r = await run({ store, forge: gitForge(root), write, today, log: (s) => console.log(s) })
    console.log(`${write ? "" : "dry run: "}${r.plans.length} planned · ${r.opened.length} PRs · ${r.recorded.length} recorded · ${r.applied.length} applied · ${r.closed.length} closed`)
  }
  main().catch((e: unknown) => {
    // Our own messages only: never a raw error that could carry a key or a row.
    console.error(e instanceof Error && /^(claim_|NEXT_PUBLIC|usage|gh pr create)/.test(e.message) ? e.message : "claims-apply failed")
    process.exit(1)
  })
}
