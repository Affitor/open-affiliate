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
import { directoryGroups, homepageSets, HUB_ROWS, programsHub } from "../src/lib/programs-directory"
import { buildBoard, oasScores } from "../src/lib/oas"
import { verifiedDate } from "../src/lib/best-lists"
import type { OasScore } from "../src/lib/oas"
import { commissionDisplay as commissionDisplayServer, commissionUnknown, confirmedTerms, getProgram, IN_HOUSE, isLive, liveNetworks, networkName, networksByName, networkToSlug, programs, type Program } from "../src/lib/programs"
import { commissionFigure } from "../src/lib/program-page"
import { hasNoProgram } from "../src/lib/no-program"
import { commissionChip, cookieChip, programs as clientPrograms, searchPrograms } from "../src/lib/client-programs"
import { BEST_LISTS, buildBestList } from "../src/lib/best-lists"
import type { PayoutMethodFilter } from "../src/lib/payout-filters"
import { llmsTxt } from "./generate-md"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import NetworksPage from "../src/app/networks/page"
import CategoryPage from "../src/app/categories/[slug]/page"
import ProgramPage from "../src/app/programs/[slug]/page"
import { BestPostView } from "../src/components/best-post-view"
import { FaqAccordion } from "../src/components/faq-accordion"
import { buildFaq, programJsonLd } from "../src/lib/program-seo"
import { POSTS, postList, postSelection } from "../src/lib/best-posts"

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

test("homepage networks: every live network once, A to Z by display name ignoring case, in-house last (the /networks grid)", () => {
  const list = networksByName()
  assert.deepEqual(list.map((n) => n.network).sort(), [...liveNetworks].sort())
  assert.equal(list.at(-1)!.network, IN_HOUSE)
  const names = list.slice(0, -1).map((n) => networkName(n.network).toLowerCase())
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, "en")))
  assert.equal(list[0].network, "affitor")
  assert.equal(list.reduce((a, n) => a + n.programs.length, 0), programs.filter(isLive).length)
})

test("homepage Rankings: the OAS top 5 once scores exist, commission order before", () => {
  assert.equal(homepageSets(programs, []).by, "commission")
  const live = programs.filter((p) => isLive(p) && p.verified).slice(0, 7)
  const scores: OasScore[] = live.map((p, i) => ({
    slug: p.slug, version: "v1", oas: 90 - i, transparency: 60, partner_value: 30 - i, checked_at: "2026-10-13", page_url: "https://x.example/a",
    checks: [{ id: "T1", state: "met", max: 12, points: 12 }],
  }))
  const sets = homepageSets(programs, scores, new Date("2026-10-20T00:00:00Z"))
  assert.equal(sets.by, "oas")
  assert.deepEqual(sets.rankings.map((p) => p.slug), live.slice(0, 5).map((p) => p.slug))
  assert.deepEqual(sets.ranks, [1, 2, 3, 4, 5])
  // Each OAS row carries its score's verified date (the tie-break's date); the commission fallback has none.
  assert.deepEqual(sets.verified, sets.rankings.map((p) => scores.find((x) => x.slug === p.slug)!.checked_at))
  assert.deepEqual(homepageSets(programs, []).verified, [null, null, null, null, null])
  const tied = homepageSets(programs, scores.map((s) => ({ ...s, oas: 100 })), new Date("2026-10-20T00:00:00Z"))
  assert.deepEqual(tied.ranks, [1, 2, 3, 4, 5], "equal OAS still get their own positions, as on the leaderboard")
  // The top program's review reaches 90 days tomorrow: the leaderboard still ranks it, the homepage
  // already leaves it out, and the others keep the leaderboard's ranks (2-6).
  const expiring = scores.map((s, i) => (i === 0 ? { ...s, checked_at: "2026-07-23" } : s))
  const near = homepageSets(programs, expiring, new Date("2026-10-20T00:00:00Z"))
  assert.deepEqual(near.rankings.map((p) => p.slug), live.slice(1, 6).map((p) => p.slug))
  assert.deepEqual(near.ranks, [2, 3, 4, 5, 6])
  const all = [...sets.rankings, ...sets.featured].map((p) => p.slug)
  assert.equal(new Set(all).size, all.length, "none shown twice")
})

// CI keeps "typing and paging make no RSC request": the list syncs the URL
// with history.replaceState, never through the router.
test("programs-view never navigates through the router", () => {
  const view = readFileSync(join(root, "src/app/programs/programs-view.tsx"), "utf8")
  assert.doesNotMatch(view, /router\.(replace|push)|useRouter/)
  assert.match(view, /window\.history\.replaceState\(/)
})

// /programs carried the A–Z directory (~120 KB RSC) until redesign r3 moved it
// to /programs/a-z: a <Link> to /programs, with any query or hash, still must
// not prefetch it from the viewport (measured on the preview: the homepage
// prefetch grew from 4.4 KB to 121 KB decoded). Links to /programs/a-z opt out too.
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
      // Either the inline test, or a NO_PREFETCH set declared in the same file that holds "/programs".
      const inline = new RegExp(`prefetch=\\{${v} === "/programs" \\? false : undefined\\}`).test(tag)
      const viaSet = new RegExp(`prefetch=\\{NO_PREFETCH\\.has\\(${v}\\) \\? false : undefined\\}`).test(tag) && /const NO_PREFETCH = new Set\(\[[^\]]*"\/programs"/.test(text)
      if (!inline && !viaSet) problems.push(`mapped ${href[3]} without the /programs opt-out`)
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
  assert.equal(programsLinkProblems('const a = [{ href: "/programs" }]; <Link href={href} prefetch={NO_PREFETCH.has(href) ? false : undefined}>').problems.length, 1, "a set that is not declared")
  assert.equal(programsLinkProblems('const NO_PREFETCH = new Set(["/programs"]); const a = [{ href: "/programs" }]; <Link href={href} prefetch={NO_PREFETCH.has(href) ? false : undefined}>').problems.length, 0)
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


// "Filter all programs the same way": every list that links a /programs
// query gets back its own verified, rated programs and no others.
test("every list's /programs filter matches the list's verified programs", () => {
  for (const list of BEST_LISTS.filter((l) => l.filter)) {
    const q = new URLSearchParams(list.filter)
    const client = searchPrograms({
      category: q.get("category") ?? undefined,
      commissionType: q.get("type") ?? undefined,
      payout: (q.get("payout") ?? undefined) as PayoutMethodFilter | undefined,
      noMinimum: q.get("minpayout") === "0" || undefined,
      longCookie: q.has("cookie") || undefined,
      verified: true,
    })
    const rated = new Set(client.map((p) => getProgram(p.slug)!).filter((p) => !commissionUnknown(p.commission)).map((p) => p.slug))
    const hub = new Set(buildBestList(list).verified.map((p) => p.slug))
    assert.deepEqual([...hub].sort(), [...rated].sort(), `${list.slug} vs /programs?${list.filter}`)
  }
})

test("program row and card chips: no type after an unpublished rate, cookie only once terms are checked", () => {
  const c = (mode: string, value: number | null, rate: string | number, type = "recurring", duration: string | null = "12 months") =>
    commissionChip({ type, rate, mode, value, duration })
  assert.equal(c("unknown", null, "none"), "Rate not published")
  assert.equal(c("percentage", null, "varies"), "Rate varies")
  assert.equal(c("flat", null, "Varies", "one-time", null), "Rate varies")
  assert.equal(c("unknown", null, "25"), "Rate not published")
  assert.equal(c("unknown", null, "N/A"), "Rate not published")
  // A reward with no figure to parse reads as written, as on the program page (Vanta, Attio).
  assert.equal(c("unknown", null, "$500 Visa gift card per referral", "one-time", null), "$500 Visa gift card per referral")
  assert.equal(c("percentage", null, "up to 20% revenue share"), "up to 20% revenue share")
  assert.equal(c("percentage", 30, "30%", "recurring", "lifetime"), "30% recurring/lifetime")
  assert.equal(commissionChip({ type: "recurring", rate: "30%", mode: "percentage", value: 30, duration: "lifetime" }, true), "30% rec/lifetime")
  assert.equal(c("percentage", 30, "30%"), "30% recurring/12mo")
  assert.equal(c("flat", 50, "$50", "one-time", null), "$50 one-time")
  assert.equal(c("tiered", null, "10-30%", "tiered", null), "10-30%")
  assert.equal(c("tiered", 30, "10-30%", "tiered", null), "10-30% tiered")
  // Tiered or hybrid with nothing to read falls back too, as on the program page.
  assert.equal(c("tiered", null, "none", "one-time", null), "Rate not published")
  assert.equal(c("hybrid", null, "25", "one-time", null), "Rate not published")
  assert.equal(c("hybrid", null, "varies", "one-time", null), "Rate varies")
  for (const cookieDays of [undefined, 0, 30]) assert.equal(cookieChip({ verified: false, cookieDays }), "Unconfirmed")
  assert.equal(cookieChip({ verified: true, cookieDays: undefined }), "Cookie not published")
  assert.equal(cookieChip({ verified: true, cookieDays: 0 }), "Code-based, no cookie")
  assert.equal(cookieChip({ verified: true, cookieDays: 30 }), "30d cookie")
  // Every live row: no "Not published" followed by a commission type.
  for (const p of clientPrograms) assert.doesNotMatch(commissionChip(p.commission), /^Not published/, p.slug)
})

test("a chip makes the program page's choice for every program, verified or not: the figure, the rate as written, Rate varies or Rate not published", () => {
  for (const stored of programs) {
    const p = confirmedTerms(stored)
    const figure = commissionFigure(p)
    if (!figure) continue // no_program: no page figure, and never listed
    const chip = commissionChip(p.commission)
    if (figure.kind === "varies") assert.equal(chip, "Rate varies", p.slug)
    // No figure to read: the rate as written, word for word.
    else if (commissionUnknown(p.commission)) assert.equal(chip, figure.big, p.slug)
    // A figure: the same figure. The page may write the stored qualifier out ("$75 per qualified lead"); the chip keeps it short.
    else assert.ok(chip.startsWith(commissionDisplayServer(p.commission)) && !chip.startsWith("Rate "), `${p.slug}: chip "${chip}", page "${figure.big}"`)
  }
  for (const p of programs.filter((x) => !hasNoProgram(x) && !commissionFigure(confirmedTerms(x)))) assert.equal(commissionChip(p.commission), "Rate not published", p.slug)
})

test("llms.txt lists networks A to Z by display name, in-house last, as the homepage band", () => {
  const listed = [...llmsTxt().matchAll(/\]\(https:\/\/openaffiliate\.dev\/networks\/([a-z0-9-]+)\.md\)/g)].map((m) => m[1])
  const expected = [...liveNetworks]
    .sort((a, b) => Number(a === IN_HOUSE) - Number(b === IN_HOUSE) || networkName(a).localeCompare(networkName(b), "en", { sensitivity: "base" }))
    .map(networkToSlug)
  assert.deepEqual(listed, expected)
})

// Compare server-rendered FAQ text with the page's own machine-readable answers.
function assertFaqAccordion(html: string) {
  const nodes = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .flatMap((m) => {
      const data = JSON.parse(m[1])
      return data["@graph"] ?? [data]
    })
  const faq = nodes.find((node) => node["@type"] === "FAQPage")
  assert.ok(faq?.mainEntity.length > 0, "a real FAQ must be present")
  const escaped = (text: string) => renderToStaticMarkup(createElement("span", null, text)).slice(6, -7)
  const details = [...html.matchAll(/<details\b([^>]*)>([\s\S]*?)<\/details>/g)]
    .filter(([, , body]) => faq.mainEntity.some((item: { name: string }) => body.includes(`<span>${escaped(item.name)}</span>`)))
  assert.equal(details.length, faq.mainEntity.length)
  details.forEach(([, attrs, body], i) => {
    assert.doesNotMatch(attrs, /\bopen(?:\s|=|$)/, "every FAQ starts closed")
    assert.match(body, /^<summary\b/, "native summary is the first child")
    assert.equal(/<summary[^>]*><span>([\s\S]*?)<\/span>/.exec(body)?.[1], escaped(faq.mainEntity[i].name))
    assert.equal(/<\/summary><p[^>]*>([\s\S]*?)<\/p>/.exec(body)?.[1], escaped(faq.mainEntity[i].acceptedAnswer.text))
  })
}

test("networks keeps cards, in-house link and FAQ JSON-LD, without the visible intro", () => {
  const html = renderToStaticMarkup(createElement(NetworksPage))
  assertFaqAccordion(html)
  const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "")
  assert.doesNotMatch(visible, /An affiliate network connects brands/)
  assert.match(visible, /<h1[^>]*>Affiliate Networks<\/h1>/)
  assert.match(visible, /href="\/networks\/in-house"/)
  assert.match(visible, /href="\/networks\/affitor"/)
  assert.match(html, /An affiliate network connects brands/, "accurate JSON-LD description is preserved")
})

test("category pages use closed native FAQ accordions matching JSON-LD", async () => {
  assertFaqAccordion(renderToStaticMarkup(await CategoryPage({ params: Promise.resolve({ slug: "ai" }) })))
})

test("program FAQs use the shared accordion and preserve JSON-LD answers", async () => {
  const program = programs.find((p) => p.verified && isLive(p))!
  assert.ok(program)
  assertFaqAccordion(renderToStaticMarkup(await ProgramPage({ params: Promise.resolve({ slug: program.slug }) })))
})

test("best-of post FAQs use the shared accordion and preserve JSON-LD answers", () => {
  const post = POSTS[0]
  const list = postList(post)!
  assert.ok(list)
  assertFaqAccordion(renderToStaticMarkup(createElement(BestPostView, {
    post, list, selection: postSelection(post), path: `/best/${post.slug}`,
    parent: { name: "Categories", href: "/categories" },
  })))
})

// A post page shows its list's /programs filter link, as the plain list does.
test("a post links its list's /programs filter, and a post whose list has none shows no link", () => {
  for (const post of POSTS) {
    const list = postList(post)!
    const html = renderToStaticMarkup(createElement(BestPostView, {
      post, list, selection: postSelection(post), path: `/best/${post.slug}`,
      parent: { name: "Categories", href: "/categories" },
    }))
    const links = [...html.matchAll(/href="\/programs\?([^"]*)"/g)].map((m) => m[1].replaceAll("&amp;", "&"))
    assert.deepEqual(links, list.filter ? [list.filter] : [], post.slug)
  }
  assert.ok(POSTS.some((p) => postList(p)!.filter) && POSTS.some((p) => !postList(p)!.filter))
})

test("the shared FAQ renders text safely without client JavaScript", () => {
  const html = renderToStaticMarkup(createElement(FaqAccordion, { items: [{ q: "A & B <script>?", a: '<img src=x onerror="alert(1)">' }] }))
  assert.match(html, /A &amp; B &lt;script&gt;\?/)
  assert.match(html, /&lt;img/)
  assert.doesNotMatch(html, /<script|<img|\bopen=/)
  assert.doesNotMatch(readFileSync(join(root, "src/components/faq-accordion.tsx"), "utf8"), /use client|onClick|onKeyDown/)
})

test("Cal.com FAQ states earnings once and keeps the customer discount", async () => {
  const program = getProgram("cal-com")!
  assert.ok(program)
  const faq = buildFaq(program)
  const answer = faq.find((item) => item.q === "How much does the Cal.com affiliate program pay?")!.a
  assert.equal(answer, "20% recurring for 12 months. Referred customers also get 20% off for 12 months.")
  const schema = programJsonLd(program, faq)["@graph"].find((item) => item["@type"] === "FAQPage")!
  assert.equal(schema.mainEntity![0].acceptedAnswer.text, answer)
  const html = renderToStaticMarkup(await ProgramPage({ params: Promise.resolve({ slug: program.slug }) }))
  assertFaqAccordion(html)
  assert.doesNotMatch(html, /20% recurring for 12 months\. 20% recurring for 12 months\.|usually within instant/)
})

test("instant approval has its own sentence in the join FAQ", () => {
  const base = getProgram("cal-com")!
  assert.ok(base)
  for (const approval of ["auto", "manual", undefined] as const) {
    const program = { ...base, approval, approvalTime: "instant" }
    const answer = buildFaq(program).find((item) => item.q.startsWith("How do I join"))!.a
    assert.ok(answer.endsWith("Approval is instant."), answer)
    assert.doesNotMatch(answer, /usually within instant/)
  }
})

test("numeric approval times and distinct commission conditions stay in the FAQ", () => {
  const base = getProgram("cal-com")!
  assert.ok(base)
  const program = { ...base, approval: "manual" as const, approvalTime: "1-2 business days", commissionConditions: "Only new paid customers qualify." }
  const faq = buildFaq(program)
  assert.ok(faq.find((item) => item.q.startsWith("How do I join"))!.a.endsWith("Applications are reviewed by hand, usually within 1-2 business days."))
  assert.equal(faq[0].a, "20% recurring for 12 months. Only new paid customers qualify.")
})

// /programs hub (top-1 wave 1, PR-A): every number and date comes from the registry, the rows are
// the OAS leaderboard's first HUB_ROWS, and the FAQ asks nothing the structured fields cannot answer.
test("/programs hub: counts and date computed, rows in leaderboard order, FAQ from structured fields", () => {
  const today = new Date()
  const hub = programsHub(programs, oasScores, today)
  const live = programs.filter(isLive)
  const verified = live.filter((p) => p.verified)
  assert.equal(hub.total, live.length)
  assert.equal(hub.verified, verified.length)
  assert.equal(hub.checked, verifiedDate(live))
  const n = (x: number) => x.toLocaleString("en-US")
  assert.match(hub.title, new RegExp(`^Affiliate Program Directory: ${n(live.length)} Programs, ${n(verified.length)} Verified \\([A-Z][a-z]{2} \\d{4}\\)$`))
  assert.ok(hub.sentence.startsWith(`OpenAffiliate is an open database of ${n(live.length)} affiliate programs; ${n(verified.length)} have`))
  assert.ok(hub.sentence.endsWith(`last checked ${hub.checked}.`))
  const ranked = buildBoard(oasScores, live, today).filter((r) => r.rank != null && r.oas != null)
  assert.deepEqual(hub.top.map((r) => r.program.slug), ranked.slice(0, HUB_ROWS).map((r) => r.program.slug))
  assert.deepEqual(hub.top.map((r) => r.rank), hub.top.map((_, i) => i + 1))
  for (const r of hub.top) assert.ok(isLive(r.program), r.program.slug)
  // No "highest paying" question: percentages and flat payouts do not compare.
  assert.ok(hub.faq.every((f) => !/highest paying|pays? the most/i.test(f.q + f.a)))
  const auto = verified.filter((p) => p.approval === "auto").length
  const easiest = hub.faq.find((f) => f.q.startsWith("What are the easiest"))
  if (auto) assert.ok(easiest!.a.includes(`${n(auto)} approve automatically`))
  else assert.equal(easiest, undefined)
  // With no scores the hub still renders, with no rows.
  assert.deepEqual(programsHub(programs, [], today).top, [])
})
