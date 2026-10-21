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
import { fieldErrors, GITHUB_URL_MAX, githubNewFileUrl, missingFields, submitYaml, SHORT_DESCRIPTION_MAX, type SubmitValues } from "../src/lib/submit-yaml"
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
  for (const v of Object.values(cases)) {
    assert.deepEqual(missingFields(v), [])
    assert.deepEqual(fieldErrors(v), {})
  }
})

/** One registry build over the given files in a temp programs folder; returns its exit code and output. */
function buildRegistry(contents: string[]): { status: number | null; out: string } {
  const dir = mkdtempSync(join(tmpdir(), "oa-submit-"))
  try {
    mkdirSync(join(dir, "programs"))
    mkdirSync(join(dir, "src/lib"), { recursive: true })
    mkdirSync(join(dir, "public/logos"), { recursive: true })
    symlinkSync(join(root, "schema"), join(dir, "schema"))
    for (const content of contents) writeFileSync(join(dir, "programs", `${parse(content).slug}.yaml`), content)
    const run = spawnSync(join(root, "node_modules/.bin/tsx"), [join(root, "scripts/build-registry.ts")], { cwd: dir, encoding: "utf8" })
    return { status: run.status, out: `${run.stdout}\n${run.stderr}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// Inputs a person really types that the registry gate rejects (PR #367 review r1).
// Each must be flagged on its field, and the registry must agree that the file would fail.
const ok = cases["only the required fields"]
const rejected: [string, Partial<SubmitValues>, keyof SubmitValues, RegExp | null][] = [
  ["program page on a bare subdomain", { signupUrl: "partners.acme-test-one.com" }, "signupUrl", /bare homepage/],
  ["program page equal to the website", { signupUrl: "acme-test-one.com" }, "signupUrl", /identical to url|bare homepage/],
  ["rate that states a payout term", { commissionRate: "30% commission, paid monthly" }, "commissionRate", /withholds/],
  ["rate paid in store credit", { commissionRate: "$20 store credit" }, "commissionRate", /gift card, voucher or credit/],
  ["currency that is not a code", { currency: "USD: foo" }, "currency", null],
  ["cookie days that are not a number", { cookieDays: "thirty" }, "cookieDays", null],
]

for (const [name, change, field, gate] of rejected) {
  test(`flagged before GitHub: ${name}`, () => {
    const v = { ...ok, ...change }
    assert.ok(fieldErrors(v)[field], JSON.stringify(fieldErrors(v)))
    if (gate) {
      const run = buildRegistry([submitYaml(v, new Date("2026-10-20T12:00:00Z"))])
      assert.equal(run.status, 1, run.out)
      assert.match(run.out, gate)
    }
  })
}

test("a currency is always written as a quoted string", () => {
  const p = parse(submitYaml({ ...ok, currency: "null", payoutMinimum: "10" }))
  assert.equal(p.commission.currency, "NULL")
  assert.equal(p.payout.currency, "NULL")
})

test("a file too long for a GitHub link opens the empty file page instead of failing with 414", () => {
  const short = githubNewFileUrl(ok, submitYaml(ok))
  assert.equal(short.withContent, true)
  assert.ok(short.url.length <= GITHUB_URL_MAX)
  assert.match(short.url, /&value=/)
  // The review's case: 8,360 characters of description, a valid 8.7 KB file, an 11,718-character URL.
  const long = { ...ok, description: "A typical product helps developers build and publish reliable applications. ".repeat(110) }
  const yaml = submitYaml(long)
  assert.ok(Buffer.byteLength(yaml) < 20_000)
  const fallback = githubNewFileUrl(long, yaml)
  assert.equal(fallback.withContent, false)
  assert.equal(fallback.url, "https://github.com/Affitor/open-affiliate/new/main?filename=programs%2Facme-test-one.yaml")
  // Characters that grow when percent-encoded: decided on the encoded length, at the boundary.
  for (let n = 1; n < 2000; n += 37) {
    const v = { ...ok, description: "é—\"#&".repeat(n) }
    const r = githubNewFileUrl(v, submitYaml(v))
    assert.ok(r.url.length <= GITHUB_URL_MAX, `${n}: ${r.url.length}`)
    assert.equal(r.withContent, r.url.includes("&value="))
  }
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
  const run = buildRegistry(Object.values(files))
  assert.equal(run.status, 0, run.out)
})
