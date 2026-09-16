/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const repoRoot = path.join(__dirname, "../..")
const shellScript = fs.readFileSync(
  path.join(repoRoot, "scripts/daily-audit.sh"),
  "utf8"
)
const prompt = fs.readFileSync(
  path.join(repoRoot, "scripts/daily-audit-prompt.md"),
  "utf8"
)
const spec = fs.readFileSync(
  path.join(repoRoot, "docs/internal-loop-spec.md"),
  "utf8"
)

test("daily audit launcher enforces shadow mode", () => {
  assert.match(shellScript, /OA_LOOP_MODE="\$\{OA_LOOP_MODE:-shadow\}"/)
  assert.match(shellScript, /only shadow mode is allowed/i)
  assert.match(shellScript, /Never merge, never push to main/i)
  assert.match(shellScript, /no ~\/kyma-api\/\.env/i)
  assert.doesNotMatch(
    shellScript,
    /outcome 4/i,
    "preamble must not reference obsolete outcome numbering"
  )
})

test("prompt and spec forbid unattended merge and personal keys", () => {
  for (const [name, text] of [
    ["prompt", prompt],
    ["spec", spec],
  ]) {
    assert.doesNotMatch(
      text,
      /Query PostHog with the personal API key/i,
      `${name} must not instruct reading personal PostHog keys`
    )
    assert.doesNotMatch(
      text,
      /Personal API key in `~\/kyma-api\/\.env`/,
      `${name} must not reference kyma-api credential path`
    )
  }

  assert.match(prompt, /Never merge/i)
  assert.match(spec, /never merge/i)
  assert.match(spec, /found, fixed, merged.*disabled/i)
})
