/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test")
const assert = require("node:assert/strict")
const {
  AFFITOR_SKIP,
  AFFITOR_SYNC,
  evaluateAffitorSyncPolicy,
  evaluateAutoMergePolicy,
  fetchAffitorJson,
  fetchProgramContent,
  isAffitorSyncPullRequest,
  shouldArmAutoMerge,
} = require("./auto-merge-policy.cjs")

const validContent = `name: Example
slug: example
url: https://example.com
signup_url: https://example.com/affiliate
verified: false
commission:
  type: recurring
  rate: "30%"
  mode: percentage
  currency: USD
`

function evaluate(overrides = {}) {
  return evaluateAutoMergePolicy({
    pullRequest: {
      base: { ref: "main" },
      draft: false,
      labels: [],
      ...overrides.pullRequest,
    },
    files: overrides.files ?? [
      {
        filename: "programs/example.yaml",
        status: "added",
        additions: 5,
        deletions: 0,
        content: validContent,
      },
    ],
  })
}

test("allows small additive unverified program changes", () => {
  assert.deepEqual(evaluate(), {
    eligible: true,
    reasons: [],
    programCount: 1,
  })
})

test("blocks code, workflow, dependency, and program update paths", () => {
  for (const [filename, status] of [
    ["src/app/page.tsx", "modified"],
    [".github/workflows/ci.yml", "modified"],
    ["package-lock.json", "modified"],
    ["programs/example.yaml", "modified"],
  ]) {
    const result = evaluate({
      files: [
        {
          filename,
          status,
          additions: 1,
          deletions: status === "added" ? 0 : 1,
          content: validContent,
        },
      ],
    })
    assert.equal(result.eligible, false, `${filename} should be blocked`)
  }
})

test("blocks a restrictions sentence like PR 92", () => {
  const sentence =
    'restrictions: No self-referrals, trademark bidding, cookie stuffing, incentive traffic or purchased lists; FTC disclosure required.\n'
  const result = evaluate({
    files: [
      {
        filename: "programs/example.yaml",
        status: "added",
        additions: 8,
        deletions: 0,
        content: validContent + sentence,
      },
    ],
  })
  assert.equal(result.eligible, false)
  assert.match(result.reasons.join("\n"), /restrictions must be a list/)
})

test("allows restrictions written as a list", () => {
  const result = evaluate({
    files: [
      {
        filename: "programs/example.yaml",
        status: "added",
        additions: 8,
        deletions: 0,
        content: validContent + "restrictions:\n  - No self-referrals.\n",
      },
    ],
  })
  assert.equal(result.eligible, true)
})

test("arms native auto-merge only when the reviewed label is present", () => {
  assert.equal(
    shouldArmAutoMerge({ eligible: true, labels: [], live: true }),
    false
  )
  assert.equal(
    shouldArmAutoMerge({
      eligible: true,
      labels: ["automerge:candidate"],
      live: true,
    }),
    false
  )
  assert.equal(
    shouldArmAutoMerge({
      eligible: true,
      labels: ["reviewed"],
      live: true,
    }),
    true
  )
  assert.equal(
    shouldArmAutoMerge({
      eligible: true,
      labels: ["reviewed", "do-not-merge"],
      live: true,
    }),
    false
  )
  assert.equal(
    shouldArmAutoMerge({
      eligible: false,
      labels: ["reviewed"],
      live: true,
    }),
    false
  )
  assert.equal(
    shouldArmAutoMerge({
      eligible: true,
      labels: ["reviewed"],
      live: false,
    }),
    false
  )
})

test("blocks drafts and human-review labels", () => {
  assert.equal(evaluate({ pullRequest: { draft: true } }).eligible, false)
  assert.equal(
    evaluate({
      pullRequest: { labels: [{ name: "do-not-merge" }] },
    }).eligible,
    false
  )
})

test("blocks oversized or mixed batches", () => {
  const files = Array.from({ length: 4 }, (_, index) => ({
    filename: `programs/example-${index}.yaml`,
    status: "added",
    additions: 100,
    deletions: 0,
    content: validContent.replaceAll("example", `example-${index}`),
  }))
  const result = evaluate({ files })
  assert.equal(result.eligible, false)
  assert.match(result.reasons.join("\n"), /more than 3 program files/)
  assert.match(result.reasons.join("\n"), /more than 300 lines/)
})

test("blocks unsafe trust, URL, and markup content", () => {
  for (const content of [
    validContent.replace("verified: false", "verified: true"),
    validContent.replace("url: https://", "url: http://"),
    validContent.replace("signup_url: https://", "signup_url: javascript:"),
    `${validContent}description: \"</script><script>alert(1)</script>\"\n`,
  ]) {
    assert.equal(
      evaluate({
        files: [
          {
            filename: "programs/example.yaml",
            status: "added",
            additions: 6,
            deletions: 0,
            content,
          },
        ],
      }).eligible,
      false
    )
  }
})

test("parses YAML and rejects duplicate or non-boolean verification", () => {
  for (const content of [
    `${validContent}verified: true\n`,
    validContent.replace("verified: false", 'verified: "false"'),
    validContent.replace("name: Example", "name: ["),
  ]) {
    const result = evaluate({
      files: [
        {
          filename: "programs/example.yaml",
          status: "added",
          additions: 7,
          deletions: 0,
          content,
        },
      ],
    })
    assert.equal(result.eligible, false)
  }
})

test("blocks YAML that omits commission.mode required by the schema", () => {
  const content = validContent.replace("  mode: percentage\n", "")
  const result = evaluate({
    files: [
      {
        filename: "programs/example.yaml",
        status: "added",
        additions: 8,
        deletions: 0,
        content,
      },
    ],
  })
  assert.equal(result.eligible, false)
  assert.match(result.reasons.join("\n"), /commission\.mode/)
})

test("requires the parsed slug to match the filename", () => {
  const result = evaluate({
    files: [
      {
        filename: "programs/not-example.yaml",
        status: "added",
        additions: 5,
        deletions: 0,
        content: validContent,
      },
    ],
  })
  assert.equal(result.eligible, false)
  assert.match(result.reasons.join("\n"), /slug must match filename/)
})

test("fetches program content within byte and time limits", async () => {
  const content = await fetchProgramContent("https://example.com/raw", {
    fetchImpl: async () => new Response(validContent),
    maxBytes: Buffer.byteLength(validContent),
    timeoutMs: 100,
  })
  assert.equal(content, validContent)

  await assert.rejects(
    fetchProgramContent("https://example.com/raw", {
      fetchImpl: async () =>
        new Response("small", {
          headers: { "content-length": "100" },
        }),
      maxBytes: 10,
      timeoutMs: 100,
    }),
    /exceeds 10 bytes/
  )

  await assert.rejects(
    fetchProgramContent("https://example.com/raw", {
      fetchImpl: async () => new Response("eleven-byte"),
      maxBytes: 10,
      timeoutMs: 100,
    }),
    /exceeds 10 bytes/
  )

  await assert.rejects(
    fetchProgramContent("https://example.com/raw", {
      fetchImpl: (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          })
        }),
      timeoutMs: 5,
    }),
    { name: "TimeoutError" }
  )
})

// ---------- affitor-sync lane ----------------------------------------------

const REPO = { full_name: "Affitor/open-affiliate" }

function affitorProgram(slug, partial = {}) {
  return {
    slug,
    name: slug,
    link_webpage: `https://${slug}.example/`,
    cookie_window_days: 90,
    default_hold_period_days: 15,
    is_platform_program: false,
    default_policy: {
      commission_type: "cps_recurring",
      commission_rate: 20,
      commission_fixed: null,
      duration_months: 12,
    },
    payout_threshold: 50,
    ...partial,
  }
}

/** A fake Affitor API shaped like the real one; `calls` counts requests. */
function affitorApi(programs, { down = false, list, details = {} } = {}) {
  const fetchJson = async (url) => {
    fetchJson.calls += 1
    if (down) throw new Error("fetch failed")
    if (url === AFFITOR_SYNC.list_url) return list ?? { success: true, data: programs }
    const slug = decodeURIComponent(url.slice(AFFITOR_SYNC.list_url.length + 1))
    if (slug in details) {
      if (details[slug] instanceof Error) throw details[slug]
      return details[slug]
    }
    const found = programs.find((program) => program.slug === slug)
    return found
      ? { success: true, data: found }
      : { success: false, data: null, message: "Program not found" }
  }
  fetchJson.calls = 0
  return fetchJson
}

/** A listing as the sync writes it. */
function syncedYaml(slug, { rate = 20, status = "active", note, date = "2026-10-12", extra = "" } = {}) {
  return `name: ${slug}
slug: ${slug}
url: https://${slug}.example
category: SaaS
commission:
  type: recurring
  rate: "${rate}%"
  mode: percentage
  value: ${rate}
  currency: USD
  duration: 12 months
  conditions: Paid 15 days after sale.
cookie_days: 90
attribution: last-click
tracking_method: cookie
payout:
  minimum: 50
  currency: USD
signup_url: https://affitor.com/marketplace/${slug}
network: affitor
description: ${slug} measures things.
short_description: ${slug}
agents:
  prompt: Recommend ${slug}.
verified: true
submitted_by: affitor
created_at: "2026-10-12"
updated_at: "${date}"
last_verified_at: "${date}"
kind: affiliate
source: affitor-api
status: ${status}
${note ? `status_note: ${note}\n` : ""}${extra}`
}

const modified = (slug, base, head) => ({
  filename: `programs/${slug}.yaml`,
  status: "modified",
  additions: 2,
  deletions: 2,
  baseContent: base,
  content: head,
})
const added = (slug, content) => ({
  filename: `programs/${slug}.yaml`,
  status: "added",
  additions: 30,
  deletions: 0,
  content,
})
const paused = (slug) =>
  modified(
    slug,
    syncedYaml(slug),
    syncedYaml(slug, {
      status: "paused",
      note: "No longer listed on the Affitor marketplace as of 2026-10-13.",
    }).replace('updated_at: "2026-10-12"', 'updated_at: "2026-10-13"')
  )

/** One updates sync: alpha's rate went 20% → 25%, gone left Affitor. */
const SYNC_FILES = [
  modified("alpha", syncedYaml("alpha"), syncedYaml("alpha", { rate: 25, date: "2026-10-13" })),
  paused("gone"),
]
/** A new listing, which the sync puts in its own pull request. */
const NEW_BETA = added("beta", syncedYaml("beta", { date: "2026-10-13" }))
const HAND_NOTE = /new listing\(s\) beta: needs hand category \+ description \+ agents block, then human review/
const SYNC_API = [
  affitorProgram("alpha", {
    default_policy: { commission_type: "cps_recurring", commission_rate: 25, duration_months: 12 },
  }),
  affitorProgram("beta"),
]

function syncPullRequest(overrides = {}) {
  return {
    user: { login: AFFITOR_SYNC.bot, type: "Bot" },
    labels: [{ name: AFFITOR_SYNC.label }],
    base: { ref: "main", repo: REPO },
    head: { ref: "sync/affitor-2026-10-13", repo: REPO },
    draft: false,
    ...overrides,
  }
}

function evaluateSync({ pullRequest = {}, files = SYNC_FILES, fetchJson = affitorApi(SYNC_API) } = {}) {
  return evaluateAffitorSyncPolicy({
    pullRequest: syncPullRequest(pullRequest),
    files,
    fetchJson,
  })
}

test("affitor-sync: an update-only sync whose every owned field matches the API auto-merges", async () => {
  const fetchJson = affitorApi(SYNC_API)
  const result = await evaluateSync({ fetchJson })
  assert.deepEqual(result, {
    eligible: true,
    reasons: [],
    programCount: 2,
    pauses: 1,
    newSlugs: [],
  })
  // The list once, then one detail per file.
  assert.equal(fetchJson.calls, 3)
  assert.equal(isAffitorSyncPullRequest(syncPullRequest()), true)
  assert.equal(
    shouldArmAutoMerge({ eligible: result.eligible, labels: [AFFITOR_SYNC.label], live: true, lane: "affitor-sync" }),
    true
  )
})

test("affitor-sync: a create-only pull request goes to a person, with the new slugs", async () => {
  const fetchJson = affitorApi(SYNC_API)
  const result = await evaluateSync({ files: [NEW_BETA], fetchJson })
  assert.equal(result.eligible, false)
  assert.deepEqual(result.newSlugs, ["beta"])
  assert.deepEqual(result.reasons, [
    "new listing(s) beta: needs hand category + description + agents block, then human review",
  ])
  assert.equal(fetchJson.calls, 0)
  assert.equal(
    shouldArmAutoMerge({ eligible: result.eligible, labels: [AFFITOR_SYNC.label], live: true, lane: "affitor-sync" }),
    false
  )
})

test("affitor-sync: a mixed pull request goes to a person as a whole", async () => {
  const fetchJson = affitorApi(SYNC_API)
  const result = await evaluateSync({ files: [...SYNC_FILES, NEW_BETA], fetchJson })
  assert.equal(result.eligible, false)
  assert.deepEqual(result.newSlugs, ["beta"])
  assert.match(result.reasons.join("\n"), HAND_NOTE)
  assert.equal(result.reasons.length, 1)
  assert.equal(fetchJson.calls, 0)
})

test("affitor-sync: any other author is blocked before the API is called", async () => {
  for (const user of [
    { login: "sonpiaz", type: "User" },
    { login: "dependabot[bot]", type: "Bot" },
    { login: AFFITOR_SYNC.bot, type: "User" },
  ]) {
    const fetchJson = affitorApi(SYNC_API)
    const result = await evaluateSync({ pullRequest: { user }, fetchJson })
    assert.equal(result.eligible, false)
    assert.match(result.reasons.join("\n"), /author is not/)
    assert.equal(fetchJson.calls, 0)
  }
  // A person's pull request never enters this lane, label or not.
  assert.equal(
    isAffitorSyncPullRequest({ user: { login: "sonpiaz" }, labels: [{ name: AFFITOR_SYNC.label }] }),
    false
  )
  const unlabelled = await evaluateSync({ pullRequest: { labels: [] } })
  assert.match(unlabelled.reasons.join("\n"), /missing label: affitor-sync/)
  const fork = await evaluateSync({ pullRequest: { head: { repo: { full_name: "someone/open-affiliate" } } } })
  assert.match(fork.reasons.join("\n"), /head branch is not in this repository/)
})

test("affitor-sync: a file outside programs/*.yaml, or a removed program, is blocked", async () => {
  for (const extra of [
    { filename: ".github/workflows/ci.yml", status: "modified", additions: 1, deletions: 1, content: "x" },
    { filename: "src/lib/programs.ts", status: "modified", additions: 1, deletions: 0, content: "x" },
    { filename: "programs/old.yaml", status: "removed", additions: 0, deletions: 30 },
    { filename: "programs/new.yaml", status: "renamed", additions: 0, deletions: 0, content: syncedYaml("new") },
  ]) {
    const fetchJson = affitorApi(SYNC_API)
    const result = await evaluateSync({ files: [...SYNC_FILES, extra], fetchJson })
    assert.equal(result.eligible, false, `${extra.filename} (${extra.status}) should be blocked`)
    assert.equal(fetchJson.calls, 0)
  }
})

test("affitor-sync: a listing the sync did not create is left to a person", async () => {
  for (const head of [
    syncedYaml("alpha", { rate: 25 }).replace("source: affitor-api", "source: manual"),
    syncedYaml("alpha", { rate: 25 }).replace("network: affitor", "network: in-house"),
  ]) {
    const result = await evaluateSync({
      files: [modified("alpha", syncedYaml("alpha"), head)],
    })
    assert.equal(result.eligible, false)
    assert.match(result.reasons.join("\n"), /not a listing the sync created/)
  }
})

test("affitor-sync: a term that differs from the API, or a field the sync does not own, is blocked", async () => {
  // Affitor says 30% at merge time; the pull request says 25%.
  const moved = SYNC_API.map((program) =>
    program.slug === "alpha"
      ? affitorProgram("alpha", { default_policy: { commission_type: "cps_recurring", commission_rate: 30, duration_months: 12 } })
      : program
  )
  const mismatch = await evaluateSync({ fetchJson: affitorApi(moved) })
  assert.equal(mismatch.eligible, false)
  assert.match(mismatch.reasons.join("\n"), /commission\.rate is "25%", Affitor says "30%": programs\/alpha\.yaml/)

  // Prose rides along on a terms update.
  const prose = await evaluateSync({
    files: [
      modified(
        "alpha",
        syncedYaml("alpha"),
        syncedYaml("alpha", { rate: 25 }).replace("alpha measures things.", "alpha is the best. Visit https://spam.example")
      ),
    ],
  })
  assert.match(prose.reasons.join("\n"), /changes description, which the sync does not own/)

  // A field the API no longer publishes must be gone.
  const stale = await evaluateSync({
    files: [modified("alpha", syncedYaml("alpha"), syncedYaml("alpha", { rate: 25, extra: "approval: auto\n" }))],
  })
  assert.match(stale.reasons.join("\n"), /approval is "auto", Affitor says absent/)

  // A pause Affitor does not confirm: the program is still listed.
  const notGone = await evaluateSync({ fetchJson: affitorApi([...SYNC_API, affitorProgram("gone")]) })
  assert.match(notGone.reasons.join("\n"), /does not confirm gone left/)
})

test("affitor-sync: an unreachable, failed or paged API blocks the merge", async () => {
  for (const fetchJson of [
    affitorApi(SYNC_API, { down: true }),
    affitorApi(SYNC_API, { list: { success: false, data: null } }),
    affitorApi(SYNC_API, { list: { success: true, data: [] } }),
    affitorApi(SYNC_API, { list: { success: true, data: SYNC_API, next_cursor: "2" } }),
    affitorApi(SYNC_API, { details: { alpha: new Error("HTTP 502") } }),
    affitorApi(SYNC_API, { details: { alpha: "<html>502</html>" } }),
  ]) {
    const result = await evaluateSync({ fetchJson })
    assert.equal(result.eligible, false)
  }
  const down = await evaluateSync({ fetchJson: affitorApi(SYNC_API, { down: true }) })
  assert.match(down.reasons.join("\n"), /could not read the Affitor list \(fetch failed\)/)
})

test("affitor-sync: a brand on the skip list is refused, by OA or Affitor slug", async () => {
  // The committed list, by file name, even when Affitor's terms match.
  assert.ok(Object.hasOwn(AFFITOR_SKIP, "sparkidea"))
  const fetchJson = affitorApi([...SYNC_API, affitorProgram("sparkidea")])
  const committed = await evaluateSync({
    files: [...SYNC_FILES, added("sparkidea", syncedYaml("sparkidea"))],
    fetchJson,
  })
  assert.equal(committed.eligible, false)
  assert.match(
    committed.reasons.join("\n"),
    /sparkidea is on the skip list \(data\/affitor-sync-skip\.json\): programs\/sparkidea\.yaml/
  )
  assert.equal(fetchJson.calls, 0)

  // By the Affitor slug in signup_url, when the OA file name differs.
  const bySignup = await evaluateAffitorSyncPolicy({
    pullRequest: syncPullRequest(),
    files: [added("beta", syncedYaml("beta"))],
    fetchJson: affitorApi(SYNC_API),
    skip: { beta: "own program" },
  })
  assert.match(bySignup.reasons.join("\n"), /beta is on the skip list/)
  const renamed = added(
    "codigo",
    syncedYaml("codigo").replace("marketplace/codigo", "marketplace/cdigox-partners")
  )
  const byAffitorSlug = await evaluateAffitorSyncPolicy({
    pullRequest: syncPullRequest(),
    files: [renamed],
    fetchJson: affitorApi(SYNC_API),
    skip: { "cdigox-partners": "own program" },
  })
  assert.match(
    byAffitorSlug.reasons.join("\n"),
    /cdigox-partners is on the skip list \(data\/affitor-sync-skip\.json\): programs\/codigo\.yaml/
  )
})

test(`affitor-sync: more than ${AFFITOR_SYNC.max_pauses} pauses is left to a person`, async () => {
  const files = ["a", "b", "c", "d"].map((s) => paused(`gone-${s}`))
  const fetchJson = affitorApi(SYNC_API)
  const result = await evaluateSync({ files, fetchJson })
  assert.equal(result.eligible, false)
  assert.equal(result.pauses, 4)
  assert.match(result.reasons.join("\n"), /pauses 4 listings, more than the 3/)
  assert.equal(fetchJson.calls, 0)
  // Three is allowed.
  assert.equal((await evaluateSync({ files: files.slice(0, 3) })).eligible, true)
})

test("affitor-sync: arms native auto-merge without the reviewed label, never past do-not-merge", () => {
  const arm = (labels, live = true) =>
    shouldArmAutoMerge({ eligible: true, labels, live, lane: "affitor-sync" })
  assert.equal(arm([AFFITOR_SYNC.label]), true)
  assert.equal(arm([AFFITOR_SYNC.label, "do-not-merge"]), false)
  assert.equal(arm([AFFITOR_SYNC.label], false), false)
  assert.equal(
    shouldArmAutoMerge({ eligible: false, labels: [], live: true, lane: "affitor-sync" }),
    false
  )
})

test("reads the Affitor API as bounded JSON", async () => {
  let accept
  const body = await fetchAffitorJson("https://api.example/programs", {
    fetchImpl: async (_url, { headers }) => {
      accept = headers.Accept
      return new Response('{"success":true,"data":[]}')
    },
  })
  assert.deepEqual(body, { success: true, data: [] })
  assert.equal(accept, "application/json")
  await assert.rejects(
    fetchAffitorJson("https://api.example/programs", {
      fetchImpl: async () => new Response("x".repeat(20)),
      maxBytes: 10,
    }),
    /exceeds 10 bytes/
  )
})
