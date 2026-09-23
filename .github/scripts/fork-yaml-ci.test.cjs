/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const workflow = fs.readFileSync(
  path.join(__dirname, "../workflows/fork-yaml-ci.yml"),
  "utf8"
)

test("fork YAML CI uses pull_request_target and never checkouts the PR head", () => {
  assert.match(workflow, /pull_request_target/)
  assert.match(workflow, /persist-credentials: false/)
  assert.match(workflow, /github\.event\.pull_request\.head\.repo\.fork/)
  assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/)
  assert.doesNotMatch(workflow, /github\.event\.pull_request\.head\.sha/)
  assert.doesNotMatch(workflow, /ref: \$\{\{ github\.event\.pull_request\.head/)
})

test("required check job names match branch protection", () => {
  assert.match(workflow, /name: Validate Programs/)
  assert.match(workflow, /name: Validate\n/)
})
