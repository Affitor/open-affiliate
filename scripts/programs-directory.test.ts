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
import { commissionUnknown, getProgram, IN_HOUSE, isLive, liveNetworks, networksByProgramCount, programs, type Program } from "../src/lib/programs"
import { programs as clientPrograms, searchPrograms } from "../src/lib/client-programs"
import { BEST_LISTS, buildBestList } from "../src/lib/best-lists"

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

test("homepage sets: 5 and 6, disjoint, featured verified and live", () => {
  const { rankings, featured } = homepageSets(programs)
  assert.deepEqual([rankings.length, featured.length], [5, 6])
  const all = [...rankings, ...featured].map((p) => p.slug)
  assert.equal(new Set(all).size, all.length)
  for (const p of featured as Program[]) assert.ok(p.verified && isLive(p), p.slug)
})

test("homepage networks: every live network once, most programs first, in-house last (as on /networks)", () => {
  const list = networksByProgramCount()
  assert.deepEqual(list.map((n) => n.network).sort(), [...liveNetworks].sort())
  assert.equal(list.at(-1)!.network, IN_HOUSE)
  const counts = list.slice(0, -1).map((n) => n.programs.length)
  assert.deepEqual(counts, [...counts].sort((a, b) => b - a))
  assert.equal(list.reduce((a, n) => a + n.programs.length, 0), programs.filter(isLive).length)
})

// CI keeps "typing and paging make no RSC request": the list syncs the URL
// with history.replaceState, never through the router.
test("programs-view never navigates through the router", () => {
  const view = readFileSync(join(root, "src/app/programs/programs-view.tsx"), "utf8")
  assert.doesNotMatch(view, /router\.(replace|push)|useRouter/)
  assert.match(view, /window\.history\.replaceState\(/)
})

// /programs carries the A–Z directory (~120 KB RSC): a <Link> to it, with any
// query or hash, must not prefetch it from the viewport (measured on the
// preview: the homepage prefetch grew from 4.4 KB to 121 KB decoded).
// Problems in one file's source: Links to /programs without the opt-out.
function programsLinkProblems(text: string): { links: number; problems: string[] } {
  const problems: string[] = []
  let links = 0
  const listsPrograms = /href: "\/programs"/.test(text)
  // `=>` inside an attribute (onClick) is not the end of the tag.
  for (const m of text.matchAll(/<Link\b(?:=>|[^>])*>/g)) {
    const tag = m[0]
    const href = /href=(?:"([^"]*)"|\{`([^`]*)`\}|\{([\w.]+)\})/.exec(tag)
    if (!href) continue
    const literal = href[1] ?? href[2]
    if (literal !== undefined) {
      if (!/^\/programs(?:$|[?#])/.test(literal)) continue
      links++
      if (!/prefetch=\{false\}/.test(tag)) problems.push(tag.replace(/\s+/g, " ").slice(0, 90))
    } else if (listsPrograms) {
      // A mapped link (href={href}) in a file whose list has /programs.
      links++
      const v = href[3].replace(".", "\\.")
      if (!new RegExp(`prefetch=\\{${v} === "/programs" \\? false : undefined\\}`).test(tag)) problems.push(`mapped ${href[3]} without the /programs opt-out`)
    }
  }
  return { links, problems }
}

test("every <Link> to /programs, in every source file, opts out of prefetch", () => {
  const files = execSync("git ls-files 'src/*.tsx'", { cwd: root, encoding: "utf8" }).trim().split("\n")
  let links = 0
  for (const file of files) {
    const r = programsLinkProblems(readFileSync(join(root, file), "utf8"))
    links += r.links
    assert.deepEqual(r.problems, [], file)
  }
  // nav ×2, footer ×2, homepage ×2, breadcrumb, compare, docs/features, rankings categories.
  assert.ok(links >= 10, `found ${links} links`)
  // The checker itself catches each shape it claims to.
  for (const bad of [
    '<Link href="/programs" className="x">',
    '<Link href="/programs#all-programs">',
    "<Link href={`/programs?category=${c}`} className=\"x\">",
    '<Link onClick={() => go()} href="/programs?q=a">',
  ]) assert.equal(programsLinkProblems(bad).problems.length, 1, bad)
  assert.equal(programsLinkProblems('<Link href="/programs/vercel">').links, 0)
  assert.equal(programsLinkProblems('const a = [{ href: "/programs" }]; <Link href={href} className="x">').problems.length, 1)
})

// The /programs payout and cookie filters and the hub lists read the same
// facts (payout-filters.ts), so a hub and the filter it links to agree.
test("each hub's /programs filter returns the hub's programs and only confirmed terms", () => {
  const options: Record<string, Parameters<typeof searchPrograms>[0]> = {
    "payout=paypal": { payout: "paypal" },
    "payout=bank": { payout: "bank" },
    "minpayout=0": { noMinimum: true },
    "cookie=90": { longCookie: true },
  }
  const hubs = BEST_LISTS.filter((l) => l.filter && options[l.filter])
  assert.equal(hubs.length, Object.keys(options).length)
  for (const list of hubs) {
    const client = new Set(searchPrograms(options[list.filter!]).map((p) => p.slug))
    const hub = buildBestList(list).verified.map((p) => p.slug)
    for (const slug of hub) assert.ok(client.has(slug), `${list.slug}: ${slug} missing from /programs?${list.filter}`)
    for (const slug of client) {
      const p = getProgram(slug)!
      assert.ok(p.verified, `${list.filter}: unverified ${slug}`)
      // The hub ranks only programs that publish a commission; the filter lists them all.
      assert.ok(hub.includes(slug) || commissionUnknown(p.commission), `${list.filter}: ${slug} is not on ${list.slug}`)
    }
  }
})

