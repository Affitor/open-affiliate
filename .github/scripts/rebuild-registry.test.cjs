/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const workflow = fs.readFileSync(
  path.join(__dirname, "../workflows/rebuild-registry.yml"),
  "utf8"
)

test("rebuild registry does not push to protected main", () => {
  assert.doesNotMatch(workflow, /^ {12}git push\s*$/m)
  assert.match(workflow, /bot\/rebuild-registry/)
  assert.match(workflow, /gh pr create/)
  assert.match(workflow, /pull-requests: write/)
  assert.match(workflow, /concurrency:/)
})
