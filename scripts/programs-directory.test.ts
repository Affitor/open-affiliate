/**
 * The /programs A–Z directory and the homepage program sets
 * (src/lib/programs-directory.ts). Reads the registry, so run after
 * `npm run build` in CI: `npx tsx --test scripts/programs-directory.test.ts`.
 */
import assert from "node:assert/strict"
import { execSync, spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { directoryGroups, homepageSets } from "../src/lib/programs-directory"
import { isLive, programs, type Program } from "../src/lib/programs"
import { programs as clientPrograms } from "../src/lib/client-programs"

const root = join(__dirname, "..")
const flat = (groups: ReturnType<typeof directoryGroups>) => groups.flatMap((g) => g.programs.map((p) => p.slug))

test("every live program exactly once, no other", () => {
  const slugs = flat(directoryGroups(programs))
  assert.equal(new Set(slugs).size, slugs.length, "a slug twice")
  const live = programs.filter(isLive).map((p) => p.slug).sort()
  assert.deepEqual([...slugs].sort(), live)
  // client-programs filters on !status: the same set, or the two pages disagree.
  assert.deepEqual(clientPrograms.map((p) => p.slug).sort(), live)
  assert.ok(slugs.length >= 100)
})

test("accents fold to their letter, digits go last, ties break on slug", () => {
  const rows = [
    { slug: "zeta", name: "Zeta" },
    { slug: "ecrit", name: "Écrit" },
    { slug: "1password", name: "1Password" },
    { slug: "oko", name: "Öko" },
    { slug: "airtable-b", name: "Airtable" },
    { slug: "airtable-a", name: "airtable" },
    { slug: "gone", name: "Gone", status: "discontinued" as const },
  ]
  const groups = directoryGroups(rows)
  assert.deepEqual(groups.map((g) => g.letter), ["a", "e", "o", "z", "#"])
  assert.deepEqual(flat(groups), ["airtable-a", "airtable-b", "ecrit", "oko", "zeta", "1password"])
})

test("the order is the same under another locale", () => {
  const script = `const { directoryGroups } = require("./src/lib/programs-directory"); const { programs } = require("./src/lib/programs"); console.log(JSON.stringify(directoryGroups(programs)))`
  const run = (lang: string) =>
    spawnSync(process.execPath, ["--import", "tsx", "-e", script], {
      cwd: root,
      env: { ...process.env, LANG: lang, LC_ALL: lang },
      encoding: "utf8",
    })
  const tr = run("tr_TR.UTF-8")
  const en = run("en_US.UTF-8")
  assert.equal(tr.status, 0, tr.stderr)
  assert.ok(tr.stdout.length > 1000)
  assert.equal(tr.stdout, en.stdout)
})

test("homepage sets: 5, 6 and 30, disjoint, featured and row verified and live", () => {
  const { rankings, featured, row } = homepageSets(programs)
  assert.deepEqual([rankings.length, featured.length, row.length], [5, 6, 30])
  const all = [...rankings, ...featured, ...row].map((p) => p.slug)
  assert.equal(new Set(all).size, all.length)
  for (const p of [...featured, ...row] as Program[]) assert.ok(p.verified && isLive(p), p.slug)
})

// CI keeps "typing and paging make no RSC request": the list syncs the URL
// with history.replaceState, never through the router.
test("programs-view never navigates through the router", () => {
  const view = readFileSync(join(root, "src/app/programs/programs-view.tsx"), "utf8")
  assert.doesNotMatch(view, /router\.(replace|push)|useRouter/)
  assert.match(view, /window\.history\.replaceState\(/)
})

// /programs carries the A–Z directory (~120 KB RSC): a <Link> to it must not
// prefetch it from the viewport on every page (measured on the preview: the
// homepage prefetch grew from 4.4 KB to 121 KB decoded).
test("every <Link> to /programs opts out of prefetch", () => {
  const files = ["src/components/nav.tsx", "src/app/layout.tsx", "src/app/page.tsx", "src/app/programs/[slug]/page.tsx", "src/app/compare/compare-view.tsx", "src/app/docs/features/page.tsx"]
  let links = 0
  for (const file of files) {
    const text = readFileSync(join(root, file), "utf8")
    for (const m of text.matchAll(/<Link\b[^>]*>/g)) {
      const tag = m[0]
      if (tag.includes('href="/programs"')) {
        links++
        assert.match(tag, /prefetch=\{false\}/, `${file}: ${tag.slice(0, 80)}`)
      } else if (/href=\{(href|f\.href)\}/.test(tag) && /href: "\/programs"/.test(text)) {
        // A mapped link in a file whose list has /programs.
        links++
        assert.match(tag, /prefetch=\{(href|f\.href) === "\/programs" \? false : undefined\}/, `${file}: mapped link without the /programs opt-out`)
      }
    }
  }
  assert.ok(links >= 8, `found ${links} links`)
  // Any other file linking /programs with a literal href must be listed above.
  const all = execSync("grep -rl 'href=\"/programs\"' src", { cwd: root, encoding: "utf8" }).trim().split("\n")
  for (const f of all) assert.ok(files.includes(f) || !/<Link\b[^>]*href="\/programs"/.test(readFileSync(join(root, f), "utf8")), `${f} links /programs and is not checked`)
})
