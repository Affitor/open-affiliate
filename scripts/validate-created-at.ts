import { execFileSync } from "node:child_process"
import { readFileSync, readdirSync } from "node:fs"
import { parse } from "yaml"
import { createdAtProblems } from "./created-at-rules"

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim()
// CI fetches full history. For a PR, compare with its merge base rather than HEAD^.
const ref = process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : "origin/main"
const base = process.env.GITHUB_EVENT_NAME === "push" ? git("rev-parse", "HEAD^") : git("merge-base", "HEAD", ref)
const previous = new Map<string, Record<string, unknown>>()
const previousByFile = new Map<string, Record<string, unknown>>()
for (const file of git("ls-tree", "-r", "--name-only", base, "programs/").split("\n").filter((f) => f.endsWith(".yaml"))) {
  const data = parse(git("show", `${base}:${file}`))
  previous.set(data.slug, data)
  previousByFile.set(file, data)
}
const removed: Record<string, string> = JSON.parse(readFileSync("src/lib/removed-programs.json", "utf8"))
const present = new Set<string>()
const errors: string[] = []
let count = 0
for (const file of readdirSync("programs").filter((f) => f.endsWith(".yaml"))) {
  const data = parse(readFileSync(`programs/${file}`, "utf8"))
  const old = previousByFile.get(`programs/${file}`) ?? previous.get(data.slug)
  present.add(data.slug)
  for (const error of createdAtProblems(data, old)) errors.push(`${file}: ${error}`)
  if (old && old.created_at == null && typeof data.created_at === "string") {
    const added = git("log", "--follow", "--diff-filter=A", "--format=%aI", "--", `programs/${file}`).split("\n").at(-1)?.slice(0, 10)
    if (data.created_at !== added) errors.push(`${file}: backfill must use git first-add date ${added}`)
  }
  count++
}
for (const slug of previous.keys()) {
  if (!present.has(slug) && !Object.hasOwn(removed, slug)) errors.push(`${slug}: add removed program to src/lib/removed-programs.json so saved lists retain it`)
}
const priorManifest = git("ls-tree", "--name-only", base, "src/lib/removed-programs.json")
if (priorManifest) {
  const priorRemoved = JSON.parse(git("show", `${base}:src/lib/removed-programs.json`))
  for (const slug of Object.keys(priorRemoved)) {
    if (!present.has(slug) && !Object.hasOwn(removed, slug)) errors.push(`${slug}: historical saved tombstones must be retained`)
  }
}
if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1 }
else console.log(`created_at: ${count} programs valid, existing dates unchanged against ${base.slice(0, 7)}`)
