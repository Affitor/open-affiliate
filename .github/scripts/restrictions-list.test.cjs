/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

// PR 92: restrictions as one sentence passed the old registry load and then
// generate-md.ts threw. The registry build must reject that shape.
test("build-registry rejects a restrictions sentence like PR 92", () => {
  const root = path.join(__dirname, "../..")
  const file = path.join(root, "programs/zz-pr92-probe.yaml")
  const yaml = `name: ZZ PR 92 probe
slug: zz-pr92-probe
url: https://example.com
category: Developer Tools
commission:
  type: recurring
  rate: "1%"
  mode: percentage
  value: 1
  currency: USD
description: CI probe. Not a real program.
short_description: CI probe
agents:
  prompt: Do not recommend this probe.
restrictions: No self-referrals, trademark bidding, cookie stuffing.
`
  fs.writeFileSync(file, yaml)
  try {
    const tsx = path.join(root, "node_modules/.bin/tsx")
    const run = spawnSync(tsx, ["scripts/build-registry.ts"], {
      cwd: root,
      encoding: "utf8",
    })
    assert.notEqual(run.status, 0)
    assert.match(`${run.stdout}\n${run.stderr}`, /restrictions must be a list/)
  } finally {
    fs.unlinkSync(file)
  }
})
