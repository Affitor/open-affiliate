/* eslint-disable @typescript-eslint/no-require-imports */
const { isAlias, isNode, parseDocument, visit } = require("yaml")
// Every key a listing may have, at every level the schema names keys.
const PROGRAM_SCHEMA = require("../../schema/program.schema.json")
// The sync's own settings: API, marketplace prefix, pause limit, bot, label.
const AFFITOR_SYNC = require("../../scripts/sync-affitor.config.json")
// Brands the sync must never list (OA or Affitor slug → reason).
const AFFITOR_SKIP = require("../../data/affitor-sync-skip.json")

const MAX_PROGRAM_FILES = 3
const MAX_ADDITIONS_PER_FILE = 150
const MAX_TOTAL_ADDITIONS = 300
const MAX_FILE_BYTES = 20_000
// The Affitor list measured 71 KB for 52 programs on 2026-10-12.
const MAX_API_BYTES = 2_000_000
const FETCH_TIMEOUT_MS = 10_000

const PROGRAM_PATH = /^programs\/[a-z0-9]+(?:-[a-z0-9]+)*\.yaml$/
const BLOCKING_LABELS = new Set([
  "do-not-merge",
  "needs-human-review",
  "security",
])

function parseProgramYaml(content, filename, reasons) {
  let document
  try {
    document = parseDocument(content, {
      strict: true,
      uniqueKeys: true,
    })
  } catch {
    reasons.push(`invalid YAML: ${filename}`)
    return undefined
  }

  if (document.errors.length > 0) {
    reasons.push(`invalid or duplicate YAML keys: ${filename}`)
    return undefined
  }

  let program
  try {
    program = document.toJS({ maxAliasCount: 0 })
  } catch {
    reasons.push(`invalid or aliased YAML: ${filename}`)
    return undefined
  }

  if (
    !program ||
    typeof program !== "object" ||
    Array.isArray(program)
  ) {
    reasons.push(`program YAML must be a mapping: ${filename}`)
    return undefined
  }

  return program
}

function isHttpsUrl(value) {
  if (typeof value !== "string") return false
  try {
    const url = new URL(value)
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === ""
    )
  } catch {
    return false
  }
}

async function fetchProgramContent(
  rawUrl,
  {
    fetchImpl = globalThis.fetch,
    maxBytes = MAX_FILE_BYTES,
    timeoutMs = FETCH_TIMEOUT_MS,
    accept = "text/plain",
  } = {}
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort(
      new DOMException(`timed out after ${timeoutMs}ms`, "TimeoutError")
    )
  }, timeoutMs)

  try {
    const response = await fetchImpl(rawUrl, {
      headers: { Accept: accept },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const contentLength = Number(response.headers.get("content-length"))
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new Error(`response exceeds ${maxBytes} bytes`)
    }
    if (!response.body) {
      throw new Error("response has no body")
    }

    const reader = response.body.getReader()
    const chunks = []
    let totalBytes = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        await reader.cancel()
        throw new Error(`response exceeds ${maxBytes} bytes`)
      }
      chunks.push(Buffer.from(value))
    }

    return Buffer.concat(chunks, totalBytes).toString("utf8")
  } finally {
    clearTimeout(timeout)
  }
}

function evaluateAutoMergePolicy({ pullRequest, files }) {
  const reasons = []
  const labels = new Set(
    (pullRequest.labels ?? []).map((label) =>
      typeof label === "string" ? label : label.name
    )
  )

  if (pullRequest.base?.ref !== "main") {
    reasons.push("base branch is not main")
  }
  if (pullRequest.draft) {
    reasons.push("pull request is a draft")
  }

  for (const label of BLOCKING_LABELS) {
    if (labels.has(label)) reasons.push(`blocking label: ${label}`)
  }

  if (files.length === 0) {
    reasons.push("pull request has no changed files")
  }
  if (files.length > MAX_PROGRAM_FILES) {
    reasons.push(`changes more than ${MAX_PROGRAM_FILES} program files`)
  }

  const totalAdditions = files.reduce(
    (total, file) => total + (file.additions ?? 0),
    0
  )
  if (totalAdditions > MAX_TOTAL_ADDITIONS) {
    reasons.push(`adds more than ${MAX_TOTAL_ADDITIONS} lines`)
  }

  for (const file of files) {
    if (!PROGRAM_PATH.test(file.filename)) {
      reasons.push(`sensitive or non-program path: ${file.filename}`)
      continue
    }
    if (file.status !== "added") {
      reasons.push(`program is ${file.status}, not newly added: ${file.filename}`)
    }
    if ((file.deletions ?? 0) !== 0) {
      reasons.push(`deletes lines: ${file.filename}`)
    }
    if ((file.additions ?? 0) > MAX_ADDITIONS_PER_FILE) {
      reasons.push(
        `adds more than ${MAX_ADDITIONS_PER_FILE} lines: ${file.filename}`
      )
    }

    const content = file.content
    if (typeof content !== "string") {
      reasons.push(`could not read: ${file.filename}`)
      continue
    }
    if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) {
      reasons.push(`is larger than ${MAX_FILE_BYTES} bytes: ${file.filename}`)
      continue
    }
    const program = parseProgramYaml(content, file.filename, reasons)
    if (!program) continue

    const expectedSlug = file.filename
      .slice("programs/".length)
      .replace(/\.yaml$/, "")
    if (program.slug !== expectedSlug) {
      reasons.push(`slug must match filename: ${file.filename}`)
    }
    if (program.verified !== false) {
      reasons.push(`verified must be the boolean false: ${file.filename}`)
    }
    if (!isHttpsUrl(program.url)) {
      reasons.push(`must use an HTTPS product URL: ${file.filename}`)
    }
    if (!isHttpsUrl(program.signup_url)) {
      reasons.push(`must use an HTTPS signup URL: ${file.filename}`)
    }
    const commission = program.commission
    if (!commission || typeof commission !== "object" || Array.isArray(commission)) {
      reasons.push(`commission is required: ${file.filename}`)
    } else {
      const modes = new Set([
        "percentage",
        "flat",
        "tiered",
        "hybrid",
        "unknown",
      ])
      const types = new Set(["recurring", "one-time", "tiered", "hybrid"])
      if (!types.has(commission.type)) {
        reasons.push(`commission.type is required: ${file.filename}`)
      }
      if (commission.rate == null || commission.rate === "") {
        reasons.push(`commission.rate is required: ${file.filename}`)
      }
      if (!modes.has(commission.mode)) {
        reasons.push(
          `commission.mode must be percentage, flat, tiered, hybrid, or unknown: ${file.filename}`
        )
      }
      if (typeof commission.currency !== "string" || !commission.currency) {
        reasons.push(`commission.currency is required: ${file.filename}`)
      }
    }
    if (/<\/?script\b/i.test(content)) {
      reasons.push(`contains an HTML script tag: ${file.filename}`)
    }
    // PR 92 shipped restrictions as one sentence. generate-md.ts calls
    // restrictions.map and the production build died. A list is required.
    if (
      program.restrictions != null &&
      !Array.isArray(program.restrictions)
    ) {
      reasons.push(`restrictions must be a list: ${file.filename}`)
    }
    // Affitor terms on a page come only from the Affitor API, through the sync.
    if (program.also_on !== undefined) {
      reasons.push(`also_on is linked by a maintainer and filled by the Affitor sync: ${file.filename}`)
    }
  }

  return {
    eligible: reasons.length === 0,
    reasons: [...new Set(reasons)],
    programCount: files.filter((file) => PROGRAM_PATH.test(file.filename)).length,
  }
}

function labelNames(labels) {
  return new Set(
    (labels ?? []).map((label) =>
      typeof label === "string" ? label : label.name
    )
  )
}

// Native auto-merge stays off until a person adds `reviewed` for this head.
// Eligible YAML without that label is still a candidate. `do-not-merge` never arms.
// Human lane only: the affitor-sync lane never uses native auto-merge (see
// .github/workflows/affitor-sync-merge.yml).
function shouldArmAutoMerge({ eligible, labels, live }) {
  if (!live || !eligible) return false
  const names = labelNames(labels)
  if (names.has("do-not-merge")) return false
  return names.has("reviewed")
}

// ---------- affitor-sync lane ----------------------------------------------
//
// A pull request opened by the sync's GitHub App, from
// .github/workflows/sync-affitor.yml. It passes only updates to listings the
// sync already created: every file must be modified (never new, removed or
// renamed), keep the Affitor program it is linked to, hold only schema keys
// and no anchors, not be on the skip list, have every field the sync owns
// equal to what the Affitor API says now, and change nothing else. A brand's
// own listing that a person linked to an Affitor program under
// also_on.affitor passes the same way: the sync owns only the commission
// there, and removing the entry once Affitor confirms the program left. A pull
// request with a new listing always goes to a person, who sets its category,
// description and agents block. Anything this lane cannot confirm leaves the
// pull request to a person. auto-merge.yml runs it for the comment; the merge
// itself is affitor-sync-merge.yml's, on the exact head CI passed.

/** The bot's pull requests go through this lane; every other author through the human lane. */
function isAffitorSyncPullRequest(pullRequest, config = AFFITOR_SYNC) {
  return pullRequest.user?.login === config.bot
}

/** The Affitor API, read like a program file: time-bounded, size-capped. */
async function fetchAffitorJson(url, options = {}) {
  return JSON.parse(
    await fetchProgramContent(url, {
      maxBytes: MAX_API_BYTES,
      accept: "application/json",
      ...options,
    })
  )
}

const ABSENT = Symbol("absent")
const UNPUBLISHED = [
  "approval",
  "approval_time",
  "restrictions",
  "marketing_materials",
  "api_available",
  "dedicated_manager",
  "dashboard_url",
  "program_age",
]
const WHOLE = new Set([
  "duration_months",
  "cookie_window_days",
  "default_hold_period_days",
])
// Keys that would make the list one page of several (see fetchList in the sync).
const PAGING = ["meta", "pagination", "next", "next_cursor", "total"]
const PAUSE_NOTE = /^No longer listed on the Affitor marketplace as of \d{4}-\d{2}-\d{2}\.$/

const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * Every field the sync owns, keyed by dotted path, at the value the sync
 * writes for this program's detail (ABSENT: the sync deletes it), or why the
 * detail gives no terms. Mirrors affitorTerms() and ownedFields() in
 * scripts/sync-affitor.ts. scripts/sync-affitor.test.ts runs this lane on
 * the sync's own output, so a drift between the two fails a test.
 */
function affitorOwnedFields(program, marketplace) {
  const policy = program.default_policy ?? {}
  const numbers = {
    commission_rate: policy.commission_rate,
    commission_fixed: policy.commission_fixed,
    duration_months: policy.duration_months,
    cookie_window_days: program.cookie_window_days,
    default_hold_period_days: program.default_hold_period_days,
    payout_threshold: program.payout_threshold,
  }
  for (const [field, value] of Object.entries(numbers)) {
    if (value == null) continue
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      return `${field} is not a non-negative number`
    }
    if (WHOLE.has(field) && !Number.isInteger(value)) {
      return `${field} is not a whole number`
    }
  }
  const rate = policy.commission_rate ?? 0
  const fixed = policy.commission_fixed ?? 0
  if (rate > 0 && fixed > 0) return "both a rate and a fixed amount"
  if (!(rate > 0) && !(fixed > 0)) return "no commission rate or fixed amount"
  const months = policy.duration_months ?? 0
  const kinds = {
    cps_recurring: [
      "recurring",
      months > 0 ? `${months} ${months === 1 ? "month" : "months"}` : null,
    ],
    cps_lifetime: ["recurring", "lifetime"],
    cps_one_time: ["one-time", null],
  }
  if (!Object.hasOwn(kinds, policy.commission_type)) {
    return "unknown commission type"
  }
  const [type, duration] = kinds[policy.commission_type]
  const hold = program.default_hold_period_days ?? 0
  return {
    "commission.type": type,
    "commission.rate": rate > 0 ? `${rate}%` : `$${fixed}`,
    "commission.mode": rate > 0 ? "percentage" : "flat",
    "commission.value": rate > 0 ? rate : fixed,
    "commission.currency": "USD",
    "commission.duration": duration,
    "commission.conditions":
      hold > 0 ? `Paid ${hold} ${hold === 1 ? "day" : "days"} after sale.` : null,
    cookie_days: program.cookie_window_days ?? ABSENT,
    attribution: "last-click",
    tracking_method: "cookie",
    "payout.minimum": program.payout_threshold ?? ABSENT,
    "payout.currency": "USD",
    "payout.frequency": ABSENT,
    "payout.methods": ABSENT,
    signup_url: marketplace + program.slug,
    network: "affitor",
    verified: true,
    status: "active",
    status_note: ABSENT,
    ...Object.fromEntries(UNPUBLISHED.map((key) => [key, ABSENT])),
  }
}

/**
 * What the sync owns on a brand's own listing linked under also_on.affitor:
 * Affitor's commission there without its conditions, or none at all when
 * Affitor publishes no commission. Keyed like affitorOwnedFields, from its
 * result. Mirrors alsoOnFields() in scripts/sync-affitor.ts.
 */
function alsoOnOwnedFields(expected) {
  const at = "also_on.affitor.commission"
  if (expected === "no commission rate or fixed amount") return { [at]: ABSENT }
  if (typeof expected === "string") return expected
  return {
    ...Object.fromEntries(
      ["type", "rate", "mode", "value", "currency", "duration"].map((key) => [`${at}.${key}`, expected[`commission.${key}`]])
    ),
    [`${at}.conditions`]: ABSENT,
  }
}

// Paths are arrays of keys, never joined strings: a root key "agents.prompt"
// and the nested agents → prompt are different paths. The dotted keys of
// affitorOwnedFields are this file's own constants, split once by ownedPath.
const ownedPath = (dotted) => dotted.split(".")
const showPath = (path) =>
  path.map((key) => (/^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key))).join(".")
const isUnder = (path, prefix) =>
  prefix.length <= path.length && prefix.every((key, i) => key === path[i])

function valueAt(object, path) {
  let value = object
  for (const key of path) {
    if (!isRecord(value) || !Object.hasOwn(value, key)) return ABSENT
    value = value[key]
  }
  return value
}

const show = (value) => (value === ABSENT ? "absent" : JSON.stringify(value))

/** Paths of every scalar or list that differs between two listings. */
function changedPaths(before, after) {
  const flat = (value, path, out) => {
    if (isRecord(value) && Object.keys(value).length > 0) {
      for (const [key, child] of Object.entries(value)) flat(child, [...path, key], out)
    } else {
      out.set(JSON.stringify(path), { path, json: JSON.stringify(value) })
    }
    return out
  }
  const a = flat(before, [], new Map())
  const b = flat(after, [], new Map())
  return [...new Set([...a.keys(), ...b.keys()])]
    .filter((key) => a.get(key)?.json !== b.get(key)?.json)
    .map((key) => (a.get(key) ?? b.get(key)).path)
}

/** A rule, or the top-level property its `$ref` names (also_on reuses commission). */
const deref = (rule) =>
  typeof rule?.$ref === "string" && rule.$ref.startsWith("#/properties/")
    ? PROGRAM_SCHEMA.properties[rule.$ref.slice("#/properties/".length)]
    : rule

/** Keys the schema does not name, at every level where it names keys (additionalProperties: false). */
function unknownKeys(value, rule = PROGRAM_SCHEMA, path = [], out = []) {
  if (rule?.properties && isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (Object.hasOwn(rule.properties, key)) unknownKeys(child, deref(rule.properties[key]), [...path, key], out)
      else out.push([...path, key])
    }
  } else if (rule?.items && Array.isArray(value)) {
    value.forEach((item, i) => unknownKeys(item, rule.items, [...path, String(i)], out))
  }
  return out
}

/** Whether the YAML uses an anchor or an alias anywhere. */
function hasAnchors(content) {
  let found = false
  visit(parseDocument(content), (_, node) => {
    if (isAlias(node) || (isNode(node) && node.anchor)) {
      found = true
      return visit.BREAK
    }
  })
  return found
}

/** The Affitor program a signup_url links to, or "" when it is no marketplace page. */
function marketplaceSlug(signupUrl, marketplace) {
  const url = typeof signupUrl === "string" ? signupUrl : ""
  const slug = url.startsWith(marketplace) ? url.slice(marketplace.length) : ""
  return /^[A-Za-z0-9_-]+$/.test(slug) ? slug : ""
}

/**
 * The affitor-sync lane. `files` carry `content` (head) and, for a modified
 * file, `baseContent`. `fetchJson` reads the Affitor API; any failure blocks.
 */
async function evaluateAffitorSyncPolicy({
  pullRequest,
  files,
  fetchJson = fetchAffitorJson,
  config = AFFITOR_SYNC,
  skip = AFFITOR_SKIP,
}) {
  const reasons = []
  const labels = labelNames(pullRequest.labels)
  const newSlugs = []
  const result = (programs, pauses) => ({
    eligible: reasons.length === 0,
    reasons: [...new Set(reasons)],
    programCount: programs.length,
    pauses,
    newSlugs,
  })

  if (
    pullRequest.user?.login !== config.bot ||
    pullRequest.user?.type !== "Bot"
  ) {
    reasons.push(`author is not ${config.bot}`)
  }
  if (!labels.has(config.label)) reasons.push(`missing label: ${config.label}`)
  if (pullRequest.base?.ref !== "main") reasons.push("base branch is not main")
  if (pullRequest.draft) reasons.push("pull request is a draft")
  if (
    !pullRequest.head?.repo?.full_name ||
    pullRequest.head.repo.full_name !== pullRequest.base?.repo?.full_name
  ) {
    reasons.push("head branch is not in this repository")
  }
  for (const label of BLOCKING_LABELS) {
    if (labels.has(label)) reasons.push(`blocking label: ${label}`)
  }
  if (files.length === 0) reasons.push("pull request has no changed files")

  const programs = []
  for (const file of files) {
    const name = file.filename
    if (!PROGRAM_PATH.test(name)) {
      reasons.push(`not a program file: ${name}`)
      continue
    }
    if (file.status !== "added" && file.status !== "modified") {
      reasons.push(`program is ${file.status}: ${name}`)
      continue
    }
    if (typeof file.content !== "string") {
      reasons.push(`could not read: ${name}`)
      continue
    }
    const fileSlug = name.slice("programs/".length, -".yaml".length)
    // A new listing's prose is the brand's own Affitor text: a person sets
    // its category, description and agents block before it ships. The checks
    // below still run on it, for that person to read.
    if (file.status === "added") newSlugs.push(fileSlug)
    const program = parseProgramYaml(file.content, name, reasons)
    if (!program) continue
    let base = null
    if (file.status === "modified") {
      if (typeof file.baseContent !== "string") {
        reasons.push(`could not read the base version: ${name}`)
        continue
      }
      base = parseProgramYaml(file.baseContent, name, reasons)
      if (!base) continue
    }

    // A brand's own listing (not network affitor) that a person linked to an
    // Affitor program under also_on.affitor, in the base version: that link is
    // its identity here, as signup_url is for a listing the sync created.
    const alsoSlug = base === null ? "" : marketplaceSlug(valueAt(base, ["also_on", "affitor", "url"]), config.marketplace)
    const alsoOn = alsoSlug !== "" && base.network !== "affitor"
    if (!alsoOn && (program.network !== "affitor" || program.source !== "affitor-api")) {
      reasons.push(`not a listing the sync created (network affitor, source affitor-api): ${name}`)
    }
    if (program.slug !== fileSlug) {
      reasons.push(`slug must match filename: ${name}`)
    }
    if (/<\/?script\b/i.test(file.content)) {
      reasons.push(`contains an HTML script tag: ${name}`)
    }
    for (const path of unknownKeys(program)) {
      reasons.push(`key ${showPath(path)} is not in schema/program.schema.json: ${name}`)
    }
    if (hasAnchors(file.content)) {
      reasons.push(`uses a YAML anchor or alias: ${name}`)
    }
    let slug, baseSlug, pause
    if (alsoOn) {
      // The link is the person's: the sync keeps it, or removes the whole
      // entry (an unlink, which counts as a pause) once the program left.
      slug = baseSlug = alsoSlug
      pause = valueAt(program, ["also_on"]) === ABSENT
      const headSlug = marketplaceSlug(valueAt(program, ["also_on", "affitor", "url"]), config.marketplace)
      if (!pause && headSlug !== alsoSlug) {
        reasons.push(`also_on Affitor link changed (base ${alsoSlug}, head ${headSlug || "none"}), a person must confirm: ${name}`)
      }
    } else {
      slug = marketplaceSlug(program.signup_url, config.marketplace)
      if (!slug) {
        reasons.push(`signup_url is not an Affitor marketplace page: ${name}`)
      }
      // The Affitor program a listing is linked to is its identity, reviewed when
      // the listing was created. The sync may refresh its terms, never re-link it.
      baseSlug = base === null ? "" : marketplaceSlug(base.signup_url, config.marketplace)
      if (
        base !== null &&
        (!baseSlug || baseSlug !== slug || base.network !== "affitor" || base.source !== "affitor-api")
      ) {
        reasons.push(
          `Affitor identity changed (base ${baseSlug || "none"}, head ${slug || "none"}), a person must confirm: ${name}`
        )
      }
      pause = program.status === "paused" && base !== null && base.status !== "paused"
      if (program.status === "paused" && base === null) {
        reasons.push(`a new listing cannot be paused: ${name}`)
      }
    }
    const skipped = [fileSlug, slug, baseSlug].find((s) => s && Object.hasOwn(skip, s))
    if (skipped) {
      reasons.push(`${skipped} is on the skip list (data/affitor-sync-skip.json): ${name}`)
    }
    programs.push({ name, program, base, slug, pause, alsoOn })
  }

  if (newSlugs.length > 0) {
    reasons.push(
      `new listing(s) ${newSlugs.join(", ")}: needs hand category + description + agents block, then human review`
    )
  }
  const pauses = programs.filter((p) => p.pause).length
  if (pauses > config.max_pauses) {
    reasons.push(`pauses ${pauses} listings, more than the ${config.max_pauses} one sync may pause`)
  }
  // Structure first: no API call for a pull request that is already blocked.
  // Past this line every file is a modified listing with a base version.
  if (reasons.length > 0) return result(programs, pauses)

  let list
  try {
    list = await fetchJson(config.list_url)
  } catch (error) {
    reasons.push(`could not read the Affitor list (${error.message})`)
    return result(programs, pauses)
  }
  if (
    !isRecord(list) ||
    list.success !== true ||
    !Array.isArray(list.data) ||
    list.data.length === 0 ||
    PAGING.some((key) => key in list)
  ) {
    reasons.push("the Affitor list came back failed, empty, malformed or paged")
    return result(programs, pauses)
  }
  const listed = new Set(list.data.map((row) => (isRecord(row) ? row.slug : null)))

  for (const { name, program, base, slug, pause, alsoOn } of programs) {
    let detail
    try {
      detail = await fetchJson(`${config.list_url}/${encodeURIComponent(slug)}`)
    } catch (error) {
      reasons.push(`could not read Affitor's detail for ${slug} (${error.message}): ${name}`)
      continue
    }

    let allowed
    if (pause) {
      // Same evidence the sync needs: gone from the list, and the detail's not-found shape.
      const gone = isRecord(detail) && detail.success === false && detail.data === null
      if (listed.has(slug) || !gone) {
        reasons.push(`Affitor does not confirm ${slug} left the marketplace: ${name}`)
        continue
      }
      if (alsoOn) {
        allowed = [["also_on"], ["updated_at"]]
      } else {
        if (!PAUSE_NOTE.test(String(program.status_note ?? ""))) {
          reasons.push(`status_note is not the sync's pause note: ${name}`)
        }
        allowed = [["status"], ["status_note"], ["updated_at"]]
      }
    } else {
      const data = isRecord(detail) && detail.success === true ? detail.data : null
      if (!isRecord(data) || data.slug !== slug || !listed.has(slug)) {
        reasons.push(`Affitor does not list ${slug}: ${name}`)
        continue
      }
      if (data.is_platform_program) {
        reasons.push(`${slug} is Affitor's own platform program: ${name}`)
      }
      const owned = affitorOwnedFields(data, config.marketplace)
      const expected = alsoOn ? alsoOnOwnedFields(owned) : owned
      if (typeof expected === "string") {
        reasons.push(`Affitor's terms for ${slug} are unusable (${expected}): ${name}`)
        continue
      }
      for (const [path, value] of Object.entries(expected)) {
        const actual = valueAt(program, ownedPath(path))
        if (actual !== value) {
          reasons.push(`${path} is ${show(actual)}, Affitor says ${show(value)}: ${name}`)
        }
      }
      // The brand's own terms were not re-verified: no last_verified_at under also_on.
      allowed = [...Object.keys(expected).map(ownedPath), ["updated_at"], ...(alsoOn ? [] : [["last_verified_at"]])]
    }

    for (const path of changedPaths(base, program)) {
      if (!allowed.some((owned) => isUnder(path, owned))) {
        reasons.push(`changes ${showPath(path)}, which the sync does not own: ${name}`)
      }
    }
  }

  return result(programs, pauses)
}

const PASSING = new Set(["success", "neutral", "skipped"])

/**
 * For the merge job: whether every check main requires has passed on exactly
 * `headSha`, run by the app main names for it, and no finished check on that
 * head failed. `required` is branch protection's required_status_checks.checks
 * ({context, app_id}); none listed means no merge. GitHub enforces the same
 * checks again when the merge is made.
 */
function requiredChecksPass({ headSha, required, checkRuns }) {
  const reasons = []
  const head = String(headSha).slice(0, 7)
  if (!Array.isArray(required) || required.length === 0) {
    reasons.push("main lists no required checks, so nothing proves this head")
  }
  const runs = checkRuns.filter((run) => run.head_sha === headSha)
  for (const { context, app_id: appId } of required ?? []) {
    const passed = runs.some(
      (run) =>
        run.name === context &&
        run.status === "completed" &&
        run.conclusion === "success" &&
        (appId == null || run.app?.id === appId)
    )
    if (!passed) reasons.push(`required check ${context} has not passed on ${head}`)
  }
  for (const run of runs) {
    if (run.status === "completed" && !PASSING.has(run.conclusion)) {
      reasons.push(`check ${run.name} concluded ${run.conclusion} on ${head}`)
    }
  }
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] }
}

/**
 * For the merge job, right before it merges: a fresh read of the pull request
 * (still the App's, open, at the judged head, no stop label) and of the head
 * against main's current tip (nothing on main the head lacks). Then the
 * squash result is exactly the head the lane checked. Precondition, not read
 * here: main's protection keeps strict up-to-date checks on, so GitHub also
 * refuses the merge if main moves after this read.
 */
function finalMergeCheck({ pullRequest, headSha, behindBy, config = AFFITOR_SYNC }) {
  const reasons = []
  const head = String(headSha).slice(0, 7)
  if (!isAffitorSyncPullRequest(pullRequest, config)) reasons.push(`author is not ${config.bot}`)
  if (pullRequest.state !== "open") reasons.push("pull request is no longer open")
  if (pullRequest.head?.sha !== headSha) reasons.push(`head moved past ${head}`)
  const labels = labelNames(pullRequest.labels)
  for (const label of BLOCKING_LABELS) {
    if (labels.has(label)) reasons.push(`blocking label: ${label}`)
  }
  if (behindBy !== 0) {
    reasons.push(`behind main (${behindBy ?? "unknown"} commit(s)), waiting for the next sync`)
  }
  return { ok: reasons.length === 0, reasons }
}

/** The merge job's one comment on a pull request: created once, then updated. */
const MERGE_MARKER = "<!-- openaffiliate-affitor-sync-merge -->"
async function reportMerge(github, { owner, repo, number, sha, text }) {
  const body = `${MERGE_MARKER}\n### affitor-sync merge — ${String(sha).slice(0, 7)}\n\n${text}`
  const comments = await github.paginate(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number: number,
    per_page: 100,
  })
  const previous = comments.find((comment) => comment.body?.includes(MERGE_MARKER))
  if (previous) {
    await github.rest.issues.updateComment({ owner, repo, comment_id: previous.id, body })
  } else {
    await github.rest.issues.createComment({ owner, repo, issue_number: number, body })
  }
}

module.exports = {
  AFFITOR_SKIP,
  AFFITOR_SYNC,
  BLOCKING_LABELS,
  FETCH_TIMEOUT_MS,
  changedPaths,
  MAX_ADDITIONS_PER_FILE,
  MAX_FILE_BYTES,
  MAX_PROGRAM_FILES,
  MAX_TOTAL_ADDITIONS,
  PROGRAM_PATH,
  evaluateAffitorSyncPolicy,
  evaluateAutoMergePolicy,
  fetchAffitorJson,
  fetchProgramContent,
  finalMergeCheck,
  isAffitorSyncPullRequest,
  reportMerge,
  requiredChecksPass,
  shouldArmAutoMerge,
}
