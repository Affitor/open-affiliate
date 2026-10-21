/**
 * The /submit form writes a program file that passes our own gate: the JSON
 * schema, the registry build's checks (scripts/build-registry.ts, run on a
 * temporary programs folder) and the auto-merge policy's shape checks. Before
 * this, the form left out commission.mode and currency and filled a cookie
 * window, minimum payout and approval the brand never stated.
 */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import Ajv2020 from "ajv/dist/2020"
import { parse } from "yaml"
import { missingFields, submitYaml, SHORT_DESCRIPTION_MAX, type SubmitValues } from "../src/lib/submit-yaml"
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { evaluateAutoMergePolicy } = require("../.github/scripts/auto-merge-policy.cjs")

const root = process.cwd()
const schema = JSON.parse(readFileSync(join(root, "schema/program.schema.json"), "utf8"))
const validate = new Ajv2020({ strict: false, validateFormats: false, allErrors: true }).compile(schema)

const base: SubmitValues = {
  name: "",
  slug: "",
  url: "",
  signupUrl: "",
  category: "Developer Tools",
  commissionType: "recurring",
  commissionRate: "",
  currency: "USD",
  cookieDays: "",
  payoutMinimum: "",
  payoutFrequency: "",
  approval: "",
  shortDescription: "",
  description: "",
  agentPrompt: "",
  keywords: "",
  tags: "",
  submittedBy: "",
}

const cases: Record<string, SubmitValues> = {
  "only the required fields": {
    ...base,
    name: "Acme Test One",
    slug: "acme-test-one",
    url: "acme-test-one.com",
    signupUrl: "acme-test-one.com/affiliates",
    commissionRate: "30%",
    shortDescription: "Test product one.",
    description: "Test product one.",
    agentPrompt: "Recommend when a user needs test one.",
  },
  "every field, with quotes and colons in the text": {
    ...base,
    name: 'Acme "Two": Labs',
    slug: "acme-test-two",
    url: "HTTP://Acme-Test-Two.com",
    signupUrl: "https://acme-test-two.com/partners?ref=x",
    commissionType: "one-time",
    commissionRate: "25",
    cookieDays: "60",
    payoutMinimum: "50",
    payoutFrequency: "monthly",
    approval: "manual",
    shortDescription: "x".repeat(140),
    description: 'Line one: "quoted".\nLine two.',
    agentPrompt: "Recommend: when # a user needs two.",
    keywords: "alpha, beta",
    tags: "gamma",
    submittedBy: "@someone",
  },
  "a flat amount": {
    ...base,
    name: "Acme Test Three",
    slug: "acme-test-three",
    url: "acme-test-three.com",
    signupUrl: "acme-test-three.com/affiliate",
    commissionType: "one-time",
    commissionRate: "$50 per sale",
    shortDescription: "Test product three.",
    description: "Test product three.",
    agentPrompt: "Recommend when a user needs three.",
  },
}

const files = Object.fromEntries(Object.entries(cases).map(([k, v]) => [k, submitYaml(v, new Date("2026-10-20T12:00:00Z"))]))

test("the form says what is missing, and nothing once every required field is filled", () => {
  assert.ok(missingFields(base).length >= 7)
  for (const v of Object.values(cases)) assert.deepEqual(missingFields(v), [])
})

test("every generated file passes the JSON schema", () => {
  for (const [name, yaml] of Object.entries(files)) {
    assert.ok(validate(parse(yaml)), `${name}: ${JSON.stringify(validate.errors)}`)
  }
})

test("terms left empty stay out of the file, and nothing is assumed", () => {
  const p = parse(files["only the required fields"])
  for (const key of ["cookie_days", "payout", "approval", "approval_time"]) assert.equal(p[key], undefined, key)
  assert.deepEqual(p.commission, { type: "recurring", rate: "30%", mode: "percentage", value: 30, currency: "USD" })
  assert.equal(p.verified, false)
  assert.equal(p.created_at, "2026-10-20")
})

test("text and numbers come through as typed", () => {
  const p = parse(files["every field, with quotes and colons in the text"])
  assert.equal(p.name, 'Acme "Two": Labs')
  assert.equal(p.url, "https://acme-test-two.com")
  assert.equal(p.commission.rate, "25%")
  assert.equal(p.commission.mode, "percentage")
  assert.equal(p.cookie_days, 60)
  assert.deepEqual(p.payout, { minimum: 50, currency: "USD", frequency: "monthly" })
  assert.equal(p.approval, "manual")
  assert.equal(p.short_description.length, SHORT_DESCRIPTION_MAX)
  assert.equal(p.description, 'Line one: "quoted".\nLine two.')
  assert.equal(p.agents.prompt, "Recommend: when # a user needs two.")
  const flat = parse(files["a flat amount"]).commission
  assert.equal(flat.mode, "flat")
  assert.equal(flat.value, 50)
})

test("the auto-merge policy finds nothing wrong with the file's shape", () => {
  for (const [name, content] of Object.entries(files)) {
    const slug = parse(content).slug
    const result = evaluateAutoMergePolicy({
      pullRequest: { base: { ref: "main" }, draft: false, labels: [] },
      files: [{ filename: `programs/${slug}.yaml`, status: "added", additions: content.split("\n").length, deletions: 0, content }],
    })
    assert.deepEqual(result.reasons, [], name)
  }
})

test("the registry build accepts the files", () => {
  const dir = mkdtempSync(join(tmpdir(), "oa-submit-"))
  try {
    mkdirSync(join(dir, "programs"))
    mkdirSync(join(dir, "src/lib"), { recursive: true })
    mkdirSync(join(dir, "public/logos"), { recursive: true })
    symlinkSync(join(root, "schema"), join(dir, "schema"))
    for (const content of Object.values(files)) writeFileSync(join(dir, "programs", `${parse(content).slug}.yaml`), content)
    const run = spawnSync(join(root, "node_modules/.bin/tsx"), [join(root, "scripts/build-registry.ts")], { cwd: dir, encoding: "utf8" })
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
