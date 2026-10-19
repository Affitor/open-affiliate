import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { parse } from "yaml"

/** Emit both discovery and the served bytes from the canonical repository skill. */
export function generateSkills(root: string): void {
  const bytes = readFileSync(join(root, "skills/openaffiliate/SKILL.md"))
  const frontmatter = bytes.toString("utf8").match(/^---\n([\s\S]*?)\n---\n/)
  if (!frontmatter) throw new Error("OpenAffiliate skill needs YAML frontmatter")
  const { name, description } = parse(frontmatter[1])
  if (name !== "openaffiliate" || typeof description !== "string" || !description.trim() || description.length > 1024) {
    throw new Error("Invalid OpenAffiliate skill name or description")
  }
  const output = join(root, "public")
  const skill = join(output, "skill/SKILL.md")
  const index = join(output, ".well-known/agent-skills/index.json")
  mkdirSync(dirname(skill), { recursive: true })
  mkdirSync(dirname(index), { recursive: true })
  writeFileSync(skill, bytes)
  const served = readFileSync(skill)
  writeFileSync(index, JSON.stringify({
    $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    skills: [{
      name,
      type: "skill-md",
      description,
      url: "https://openaffiliate.dev/skill/SKILL.md",
      digest: `sha256:${createHash("sha256").update(served).digest("hex")}`,
    }],
  }, null, 2) + "\n")
}
