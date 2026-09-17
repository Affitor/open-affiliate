/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test")
const assert = require("node:assert/strict")
const {
  evaluateAutoMergePolicy,
  fetchProgramContent,
} = require("./auto-merge-policy.cjs")

const validContent = `name: Example
slug: example
url: https://example.com
signup_url: https://example.com/affiliate
verified: false
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
