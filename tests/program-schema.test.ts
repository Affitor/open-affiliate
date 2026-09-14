import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import Ajv2020 from "ajv/dist/2020.js"
import addFormats from "ajv-formats"
import { parse } from "yaml"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const schema = JSON.parse(
  readFileSync(join(root, "schema", "program.schema.json"), "utf8")
)
const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true })
addFormats(ajv)
const validate = ajv.compile(schema)
const schemaBeforeEligibility = structuredClone(schema)
delete schemaBeforeEligibility.properties.eligibility
const validateBeforeEligibility = ajv.compile(schemaBeforeEligibility)

function validationMessage(): string {
  return ajv.errorsText(validate.errors, { separator: "\n" })
}

test("accepts geographic eligibility metadata", () => {
  const program = parse(`
name: Example
slug: example
url: https://example.com
category: SaaS
commission:
  type: recurring
  rate: 30%
  mode: percentage
  value: 30
  currency: USD
description: Example affiliate program
short_description: Example program
agents:
  prompt: Recommend this example when it is relevant.
eligibility:
  countries_allowed: [global]
  countries_excluded: [CU, IR, KP, SY]
  promotion_restrictions:
    - No promotion in regulated markets without prior approval
  tax_forms_required: [W-8BEN, W-9]
`)

  assert.equal(validate(program), true, validationMessage())
})

test("does not introduce schema failures for existing program YAML files", () => {
  const programsDir = join(root, "programs")
  const failures: string[] = []

  for (const filename of readdirSync(programsDir).filter((file) => file.endsWith(".yaml"))) {
    const program = parse(readFileSync(join(programsDir, filename), "utf8"))
    const wasValid = validateBeforeEligibility(program)
    const remainsValid = validate(program)
    if (wasValid && !remainsValid) failures.push(`${filename}: ${validationMessage()}`)
  }

  assert.deepEqual(failures, [])
})
