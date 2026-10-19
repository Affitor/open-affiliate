import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { parse } from "yaml"
import { generateSkills } from "./generate-skills"
import { llmsTxt } from "./generate-md"

test("discovery describes the exact canonical skill bytes served after generation", () => {
  const root = mkdtempSync(join(process.cwd(), ".skills-test-"))
  try {
    mkdirSync(join(root, "skills/openaffiliate"), { recursive: true })
    const source = readFileSync("skills/openaffiliate/SKILL.md")
    const check = (bytes: Buffer) => {
      writeFileSync(join(root, "skills/openaffiliate/SKILL.md"), bytes)
      generateSkills(root)
      const served = readFileSync(join(root, "public/skill/SKILL.md"))
      assert.deepEqual(served, bytes)
      const index = JSON.parse(readFileSync(join(root, "public/.well-known/agent-skills/index.json"), "utf8"))
      const meta = parse(bytes.toString().split("---\n")[1])
      assert.deepEqual(index, {
        $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
        skills: [{ name: meta.name, description: meta.description, type: "skill-md",
          url: "https://openaffiliate.dev/skill/SKILL.md",
          digest: `sha256:${createHash("sha256").update(served).digest("hex")}` }],
      })
      return index.skills[0].digest
    }
    const before = check(source)
    assert.notEqual(check(Buffer.concat([source, Buffer.from("\nUpdated terms guidance.\n")])), before)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("built skill and discovery are current and linked from llms.txt", () => {
  const canonical = readFileSync("skills/openaffiliate/SKILL.md")
  assert.deepEqual(readFileSync("public/skill/SKILL.md"), canonical)
  const index = JSON.parse(readFileSync("public/.well-known/agent-skills/index.json", "utf8"))
  assert.equal(index.skills[0].digest, `sha256:${createHash("sha256").update(canonical).digest("hex")}`)
  for (const path of ["/skill/SKILL.md", "/.well-known/agent-skills/index.json"]) {
    assert.ok(llmsTxt().includes(`https://openaffiliate.dev${path}`))
    assert.ok(readFileSync("public/llms.txt", "utf8").includes(`https://openaffiliate.dev${path}`))
  }
})
