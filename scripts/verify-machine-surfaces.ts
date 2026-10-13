#!/usr/bin/env tsx

import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createServer, type AddressInfo } from "node:net";
import { join } from "node:path";

import sitemap from "../src/app/sitemap";
import robots from "../src/app/robots";
import { serializeJsonLd } from "../src/lib/json-ld";
import {
  BEST_LISTS,
  MAX_ROWS,
  bestPath,
  bestListCopy,
  buildBestList,
  categoryList,
  listScore,
  listCommissionText,
  flatUsdPayout,
  type BestList,
} from "../src/lib/best-lists";
import { hasNoProgram } from "../src/lib/no-program";
import {
  commissionDisplay,
  categories,
  categoryToSlug,
  networkToSlug,
  programs,
  isLive,
  liveNetworks,
  networkHeading,
  networkName,
  IN_HOUSE,
  NETWORK_META,
  livePrograms,
  commissionUnknown,
  type Program,
} from "../src/lib/programs";

const ROOT = process.cwd();
const PUBLIC = join(ROOT, "public");
const BUILD_APP = join(ROOT, ".next", "server", "app");
const BASE_URL = "https://openaffiliate.dev";

function fail(message: string): never {
  throw new Error(`[machine-surfaces] ${message}`);
}

function requireText(file: string): string {
  const path = join(PUBLIC, file);
  if (!existsSync(path)) fail(`${file} was not generated`);
  return readFileSync(path, "utf8");
}

const llms = requireText("llms.txt");
const llmsFull = requireText("llms-full.txt");

if (!llms.startsWith("# OpenAffiliate\n")) {
  fail("llms.txt must start with the project H1");
}
// Same singular rule as generate-md's programCount(). Counts are of live
// programs: a brand with no program to join is not counted as one.
const liveCount = programs.filter(isLive).length;
const programsPhrase = `${liveCount} ${liveCount === 1 ? "program" : "programs"}`;
if (!llms.includes(programsPhrase)) {
  fail("llms.txt program count differs from the registry");
}
for (const requiredUrl of [
  `${BASE_URL}/programs`,
  `${BASE_URL}/rankings`,
  `${BASE_URL}/compare`,
  `${BASE_URL}/about`,
  `${BASE_URL}/sitemap.xml`,
]) {
  if (!llms.includes(requiredUrl)) fail(`llms.txt does not link ${requiredUrl}`);
}
if (!llmsFull.includes(`Every one of the ${programsPhrase}`)) {
  fail("llms-full.txt program count differs from the registry");
}
for (const program of programs) {
  if (!existsSync(join(PUBLIC, "programs", `${program.slug}.md`))) {
    fail(`missing Markdown twin for ${program.slug}`);
  }
}
/**
 * llms.txt is fetched once and read whole, so it is kept small.
 *
 * Calling 10240 a budget was generous to it: the file had grown to 4 bytes
 * under this number, which makes it a line the file grew into rather than a
 * figure anyone derived. It is a deliberate choice to keep the index
 * skimmable — roughly 2.5k tokens — and llmstxt.org sets no limit at all.
 *
 * What changed is that the file no longer grows with the number of verified
 * programs: the index shows a bounded sample and links verified.md for the
 * rest. Three things still grow it, and they are debt, not claims:
 *
 *   - categories and networks are enumerated in full, measured at ~96 and ~76
 *     bytes a line. With ~3600 bytes of headroom that is roughly 37 more
 *     networks before this fires again, and neither enum is enforced by
 *     validateProgram, so the registry can introduce new values.
 *   - commission strings and durations have no length limit in the schema.
 *   - program names are capped in the index only (INLINE_NAME_MAX).
 *
 * So: bounded in the number of inline programs, not in bytes. If this fires,
 * move content to a linked surface rather than raising the number.
 */
const LLMS_MAX_BYTES = 10240;
const llmsBytes = Buffer.byteLength(llms);
if (llmsBytes > LLMS_MAX_BYTES) {
  fail(
    `llms.txt is ${llmsBytes} bytes; the cap is ${LLMS_MAX_BYTES}. ` +
      `Move content to a linked surface instead of raising the cap.`
  );
}
// Nothing warned before the wall last time, which is how the file came to sit
// 4 bytes under it. This is the warning — and it is emitted as a workflow
// annotation when there is one to emit, because a console.warn goes to stderr
// and scrolls past in a job log, which is a warning nobody reads.
if (llmsBytes > LLMS_MAX_BYTES * 0.85) {
  const pct = Math.round((llmsBytes / LLMS_MAX_BYTES) * 100);
  const message =
    `llms.txt is ${llmsBytes} bytes, ${pct}% of the ${LLMS_MAX_BYTES} cap. ` +
    `Move content to a linked surface before it fails.`;
  console.warn(`[machine-surfaces] warning: ${message}`);
  if (process.env.GITHUB_ACTIONS) {
    console.log(`::warning file=public/llms.txt::${message}`);
  }
}

/**
 * The index must stay bounded in inline programs, and must describe itself
 * truthfully.
 *
 * Three different things get checked, because each earlier version was slipped
 * past in a way the next one closes:
 *
 *   - Self-consistency alone cannot validate a claim about the *registry*.
 *     "All 12 verified" while 49 are verified passed the first version.
 *     Totals now come from the registry.
 *   - Counting one serialization cannot bound the rows. Counting `- [` missed
 *     nine rows written `* [`; counting the https URL then missed
 *     `](<https://…>)` and `](/programs/…)`. Matching one more spelling only
 *     moves the gap, so this does the opposite: the generator emits one exact
 *     shape, and any line in the section that mentions a program in some other
 *     shape is rejected rather than ignored. A whitelist has no gap to find.
 *   - `.match()` returns the first hit, so a second, contradicting claim after
 *     a correct one passed. Exactly one claim is now allowed.
 */
const LLMS_MAX_INLINE_PROGRAMS = 20;
// Paused, discontinued and no_program entries are never listed as verified, even if their status was checked.
const verifiedCount = programs.filter((p) => p.verified && isLive(p)).length;
const verifiedSection = llms
  .split(/^## /m)
  .find((part) => part.startsWith("Verified programs"));
if (!verifiedSection) fail("llms.txt has no 'Verified programs' section");

// Exactly one count claim, so a later line cannot contradict an earlier one.
// Leading whitespace is insignificant in Markdown, and a single space in
// front of a second claim hid it from a column-zero anchor: the verifier saw
// only the true claim and passed at 6665 bytes. Lines are trimmed first.
const claimPattern = /^(?:Highest-scoring (\d+) of (\d+)|All (\d+)) verified\./;
const claims = verifiedSection
  .split("\n")
  .map((line) => claimPattern.exec(line.trim()))
  .filter((m): m is RegExpExecArray => m !== null);
if (claims.length === 0) {
  fail(
    "llms.txt's verified section does not state how many programs it lists; " +
      "it must, so this check can hold it to that number and to the registry"
  );
}
if (claims.length > 1) {
  fail(
    `llms.txt's verified section states its count ${claims.length} times; ` +
      `exactly one claim is allowed, or they can contradict each other`
  );
}
const [claim] = claims;
const isSample = claim[1] !== undefined;
const claimed = Number(isSample ? claim[1] : claim[3]);

/**
 * The row contract.
 *
 * The generator escapes every contributor literal before interpolating it, so
 * a row can hold exactly one link by construction and anything a contributor
 * writes renders as text. This checks that the shape it produces is the shape
 * that arrived, which is the regression this guard is actually for: these
 * bytes are generated, gitignored and overwritten by the next prebuild, so
 * nothing reaches llms.txt except through generate-md.ts.
 *
 * Earlier versions of this check counted a serialization instead, and were
 * walked past five ways — `* [`, reference-style, root-relative, bare
 * autolinks, angle-bracket destinations — then, once inverted, two more:
 * `&#47;` entity slashes and a second link riding along after the commission
 * text, because the pattern only matched a prefix. The claim that a whitelist
 * "has no gap to find" was wrong twice over, and is not made here: a reviewer
 * editing the generated file by hand can still get past this. What it does
 * cover is the generator emitting something other than its contract.
 *
 * The label admits backslash escapes, because the escaper produces them —
 * refusing them rejected the valid name `Framer [US]` and failed the build on
 * legitimate data.
 */
const ROW =
  /^- \[((?:[^[\]\\\n]|\\.)+)\]\(https:\/\/openaffiliate\.dev\/programs\/([a-z0-9]+(?:-[a-z0-9]+)*)\.md\) — (.+)$/;
// Two whole classes the generator never emits, refused as classes rather than
// as the particular spellings a reviewer happened to try. Numeric character
// references: the escaper only ever writes &amp;, &lt; and &gt;, so any `&#`
// is foreign — which closes `&#47;programs&#47;` and `&#x2F;` alike, where
// matching the one spelling would not. Link reference definitions: the
// generator writes only inline links, and definitions are document-scoped, so
// uses inside the section can be resolved by a definition placed after it —
// hence this looks at the whole file, not the section.
if (/&#/.test(verifiedSection)) {
  fail(
    "llms.txt's verified section contains a numeric character reference; the " +
      "generator never writes one, and a link destination can hide in it"
  );
}
const linkDefinition = llms.split("\n").find((line) => /^ {0,3}\[[^\]]+\]:\s/.test(line));
if (linkDefinition) {
  fail(
    `llms.txt contains a link reference definition, which the generator never ` +
      `writes and which can give the verified section links from outside it: ` +
      `${linkDefinition.slice(0, 80)}`
  );
}

const rows: string[] = [];
for (const line of verifiedSection.split("\n")) {
  const match = ROW.exec(line);
  if (match) {
    // The terms are escaped, so no unescaped bracket should survive there. One
    // that does means a second link could render in a row counted as one.
    const bare = match[3].replace(/\\./g, "");
    if (/[[\]]/.test(bare)) {
      fail(
        `llms.txt row for ${match[2]} has an unescaped bracket in its terms, ` +
          `so it could render more than one link: ${line.slice(0, 120)}`
      );
    }
    rows.push(line);
  } else if (line.includes("/programs/")) {
    fail(
      `llms.txt's verified section mentions a program in a shape this check ` +
        `cannot count, so it would not be bounded: ${line.slice(0, 120)}`
    );
  }
}
if (rows.length !== claimed) {
  fail(`llms.txt says it lists ${claimed} verified programs but lists ${rows.length}`);
}
// Parent of this ceiling is the generator's VERIFIED_SAMPLE (12) plus slack.
// It is not derived from the byte cap: bytes per row are not bounded, so a
// byte-derived ceiling would rest on a figure that does not hold. If the
// sample is raised past this, the check above fails loudly rather than
// silently permitting an unbounded block.
if (claimed > LLMS_MAX_INLINE_PROGRAMS) {
  fail(
    `llms.txt inlines ${claimed} programs; the ceiling is ${LLMS_MAX_INLINE_PROGRAMS}. ` +
      `The inline block must not grow with the registry — link verified.md instead.`
  );
}
if (isSample) {
  const statedTotal = Number(claim[2]);
  if (statedTotal !== verifiedCount) {
    fail(
      `llms.txt says ${statedTotal} programs are verified; the registry has ${verifiedCount}`
    );
  }
  // Reachable only below the ceiling, where a sample can exceed the total.
  // Not dead: do not delete it because today's registry shadows it.
  if (claimed > statedTotal) {
    fail(`llms.txt claims to list ${claimed} of only ${statedTotal} verified programs`);
  }
} else if (claimed !== verifiedCount) {
  fail(
    `llms.txt claims to list all ${claimed} verified programs; the registry has ${verifiedCount}`
  );
}

/**
 * And the data the index stopped carrying has to be somewhere complete:
 * a bounded index is only acceptable because verified.md holds all of it.
 */
const verifiedPage = requireText("verified.md");
if (!verifiedPage.startsWith("# ")) fail("verified.md must start with an H1");
const verifiedLines = verifiedPage.split("\n");
for (const program of programs.filter((p) => p.verified && isLive(p))) {
  const marker = `/programs/${program.slug}.md`;
  const entry = verifiedLines.find((line) => line.includes(marker));
  if (!entry) fail(`verified.md is missing verified program ${program.slug}`);
  // Per entry, not page-wide. There are only four distinct dates across 49
  // programs, so a page-wide `includes` was satisfied for every program by
  // four surviving rows: stripping the date from the other 45 passed.
  const expected = program.lastVerifiedAt
    ? `checked ${program.lastVerifiedAt.slice(0, 10)}`
    : "date not recorded";
  if (!entry.includes(expected)) {
    fail(
      `verified.md's entry for ${program.slug} should say "${expected}" ` +
        `and says: ${entry.slice(-60)}`
    );
  }
}
if (!llms.includes(`${BASE_URL}/verified.md`)) {
  fail("llms.txt does not link verified.md, where the full verified list now lives");
}
for (const file of ["index.md", "programs.md", "rankings.md", "changelog.md"]) {
  const text = requireText(file);
  if (!text.startsWith("# ")) fail(`${file} must start with an H1`);
}
if (!requireText("index.md").includes(`${BASE_URL}/llms.txt`)) {
  fail("index.md does not point at llms.txt");
}
if (!requireText("rankings.md").includes(`${BASE_URL}/programs/`)) {
  fail("rankings.md does not link program pages");
}
if (!requireText("changelog.md").includes("April 18, 2026")) {
  fail("changelog.md is missing the latest entry");
}

const sitemapEntries = sitemap();
const sitemapUrls = sitemapEntries.map((entry) => entry.url);
const sitemapUrlSet = new Set(sitemapUrls);
if (sitemapUrlSet.size !== sitemapUrls.length) {
  fail("sitemap contains duplicate URLs");
}
let datedProgramPages = 0;
for (const program of programs) {
  const url = `${BASE_URL}/programs/${program.slug}`;
  const entry = sitemapEntries.find((item) => item.url === url);
  if (!entry) fail(`sitemap is missing ${url}`);
  if (entry.lastModified) datedProgramPages += 1;
}
if (datedProgramPages < programs.length * 0.9) {
  fail(
    `only ${datedProgramPages}/${programs.length} program URLs have registry-derived lastModified`
  );
}
for (const category of categories) {
  const url = `${BASE_URL}/categories/${categoryToSlug(category)}`;
  if (!sitemapUrlSet.has(url)) fail(`sitemap is missing ${url}`);
}
// Live networks only: a network whose programs are all paused or discontinued
// gets no page, so it must not be in the sitemap either.
const networks = new Set(liveNetworks);
for (const network of networks) {
  const url = `${BASE_URL}/networks/${networkToSlug(network)}`;
  if (!sitemapUrlSet.has(url)) fail(`sitemap is missing ${url}`);
}

/**
 * Best-of lists: each is a config entry, so these hold every entry to what the
 * page promises. The <title> carries the layout's " | OpenAffiliate" suffix.
 */
if (!llms.includes(`${BASE_URL}/best.md`)) fail("llms.txt does not link best.md");
if (!requireText("best.md").startsWith("# ")) fail("best.md must start with an H1");

/**
 * Contributor text reaches a list page in its rows, intro and FAQ answers, and
 * every piece is escaped. The generator itself writes links only as
 * `[label](https://openaffiliate.dev/…)`, so any unescaped `]` not opening such
 * a destination came from contributor text: an inline link, a reference link,
 * or a link definition. A bracket is escaped when an odd number of backslashes
 * precedes it. `<` (raw HTML, autolinks) and `&#` (entity-encoded URLs) never
 * survive the escaper either, and neither does a carriage return: the generator
 * writes LF only, and a contributor CR would start a new line (a heading, a
 * list item) in CommonMark. This guards the generator's output; it is not a
 * Markdown parser.
 */
function foreignMarkup(md: string): string | null {
  for (let i = md.indexOf("]"); i !== -1; i = md.indexOf("]", i + 1)) {
    let slashes = 0;
    for (let j = i - 1; j >= 0 && md[j] === "\\"; j--) slashes += 1;
    if (slashes % 2 === 0 && !md.startsWith(`](${BASE_URL}/`, i)) {
      return md.slice(Math.max(0, i - 60), i + 40);
    }
  }
  const raw = /<|&#|\r/.exec(md);
  return raw ? JSON.stringify(md.slice(Math.max(0, raw.index - 60), raw.index + 40)) : null;
}

/** JSON-LD nodes of a prerendered page, with any @graph flattened. */
function jsonLdNodes(html: string): Record<string, unknown>[] {
  return [...html.matchAll(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]) as Record<string, unknown> & { "@graph"?: Record<string, unknown>[] })
    .flatMap((block) => block["@graph"] ?? [block]);
}

/**
 * Each surface must list the builder's rows, the same programs in the same
 * order. Checking the builder alone let an artifact with no rows pass: a
 * markdown file holding only its H1, or an ItemList with zero items.
 *
 * Element by element, never by joining: one item whose URL is all fifty
 * expected URLs joined by spaces equals the joined list.
 */
function sameRows(surface: string, got: string[], want: string[]): void {
  if (got.length !== want.length || got.some((value, i) => value !== want[i])) {
    const first = got.findIndex((slug, i) => slug !== want[i]);
    fail(
      `${surface} lists ${got.length} programs and the builder ${want.length}; ` +
        `first difference at row ${(first === -1 ? Math.min(got.length, want.length) : first) + 1}`
    );
  }
}

/**
 * One list page, whichever route serves it: the /best hub, a /best/<slug>
 * list, or a category page (a directory on the same builder, so no row cap).
 * Checks the page, its JSON-LD and its markdown twin against the builder.
 */
function checkListPage(list: BestList, path: string): void {
  const url = `${BASE_URL}${path}`;
  if (!sitemapUrlSet.has(url)) fail(`sitemap is missing ${url}`);
  const title = `${list.title} | OpenAffiliate`;
  if (title.length > 60 || /[–—]/.test(title)) {
    fail(`${path} title must be 60 characters or fewer with no en or em dash: ${title}`);
  }
  if (list.description.length < 120 || list.description.length > 155) {
    fail(`${path} description is ${list.description.length} characters; keep it 120 to 155`);
  }
  const { rows } = buildBestList(list);
  if (rows.length === 0 || (!list.directory && rows.length > MAX_ROWS)) fail(`${path} has ${rows.length} rows`);
  const firstUnverified = rows.findIndex((p) => !p.verified);
  if (firstUnverified !== -1 && rows.slice(firstUnverified).some((p) => p.verified)) {
    fail(`${path} lists an unverified program above a verified one`);
  }
  if (rows.some((p) => !isLive(p))) {
    fail(`${path} lists a program that is not live`);
  }
  // "Programs that do not publish a rate are listed last": within the verified
  // and the unverified group, no published rate follows an unpublished one.
  rows.forEach((p, i) => {
    const prev = rows[i - 1];
    if (prev && prev.verified === p.verified && commissionUnknown(prev.commission) && !commissionUnknown(p.commission)) {
      fail(`${path} lists ${p.slug}, which publishes a rate, after ${prev.slug}, which does not`);
    }
  });
  const want = rows.map((p) => p.slug);

  // Prerendered page: the table's program links, and the JSON-LD ItemList.
  const htmlFile = `${path.slice(1)}.html`;
  if (!existsSync(join(BUILD_APP, htmlFile))) fail(`${htmlFile} was not prerendered`);
  const html = readFileSync(join(BUILD_APP, htmlFile), "utf8");
  const tbodyStart = html.indexOf("<tbody>");
  const tbodyEnd = html.indexOf("</tbody>", tbodyStart);
  if (tbodyStart === -1 || tbodyEnd === -1) fail(`${htmlFile} has no table body`);
  const tableRows = [...html.slice(tbodyStart, tbodyEnd).matchAll(/href="\/programs\/([a-z0-9-]+)"/g)];
  sameRows(`${htmlFile} table`, tableRows.map((m) => m[1]), want);
  const itemList = jsonLdNodes(html).find((node) => node["@type"] === "ItemList") as
    | { numberOfItems?: number; itemListElement?: { position?: number; url?: string }[] }
    | undefined;
  const items = itemList?.itemListElement ?? [];
  if (itemList?.numberOfItems !== items.length || items.some((item, i) => item.position !== i + 1)) {
    fail(`${htmlFile} ItemList numberOfItems or positions disagree with its items`);
  }
  // Whole URLs, position by position: a bare slug is a relative URL that
  // resolves under the page's own path, not to the program page.
  sameRows(
    `${htmlFile} ItemList`,
    items.map((item) => item.url ?? ""),
    want.map((slug) => `${BASE_URL}/programs/${slug}`)
  );

  // Markdown twin, from the same builder: its H1, the intro, the builder's
  // rows in order, and the FAQ the page shows. A twin holding only its H1, or
  // one written by another generator, fails here.
  const mdFile = `${path.slice(1)}.md`;
  const md = requireText(mdFile);
  const h1 = /^# (.*)\n/.exec(md)?.[1] ?? "";
  // The generator escapes an H1 because a category name can carry markup.
  if (h1.replace(/\\(.)/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&") !== list.h1) {
    fail(`${mdFile} must start with its H1, "${list.h1}"`);
  }
  // Intro and every FAQ question and answer, against the builder's own text.
  // The twin's copy is escaped, so it is unescaped before comparing; the
  // builder's copy has its line breaks collapsed, as the escaper does.
  const unescape = (s: string) =>
    s.replace(/\\(.)/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const oneLine = (s: string) => s.replace(/\s*[\r\n]+\s*/g, " ");
  const copy = bestListCopy(buildBestList(list));
  const intro = /^# .*\n\n> (.*)\n/.exec(md)?.[1];
  if (intro === undefined || unescape(intro) !== oneLine(copy.intro)) {
    fail(`${mdFile} intro differs from the page's: ${JSON.stringify((intro ?? "").slice(0, 80))}`);
  }
  const faqSection = /\n## FAQ\n\n([\s\S]*?)(?=\n## |$)/.exec(md)?.[1] ?? "";
  const pairs = faqSection
    .split(/^### /m)
    .slice(1)
    .map((chunk) => {
      const [q, ...rest] = chunk.split("\n");
      return { q: unescape(q), a: unescape(rest.join("\n").trim()) };
    });
  if (
    pairs.length !== copy.faq.length ||
    pairs.some((pair, i) => pair.q !== oneLine(copy.faq[i].q) || pair.a !== oneLine(copy.faq[i].a))
  ) {
    fail(`${mdFile} FAQ differs from the page's (${pairs.length} pairs, the page has ${copy.faq.length})`);
  }
  const foreign = foreignMarkup(md);
  if (foreign) fail(`${mdFile} has markup the generator did not write: ${foreign}`);
  // Numbered rows, numbered from 1, each linking its program twin.
  const mdRows = [
    ...md.matchAll(/^(\d+)\. \[(?:[^\]\\\n]|\\.)+\]\(https:\/\/openaffiliate\.dev\/programs\/([a-z0-9-]+)\.md\) — /gm),
  ];
  if (mdRows.some((m, i) => Number(m[1]) !== i + 1)) fail(`${mdFile} numbers its rows out of order`);
  sameRows(mdFile, mdRows.map((m) => m[2]), want);
}

for (const list of BEST_LISTS) checkListPage(list, bestPath(list));
for (const category of categories) {
  checkListPage(categoryList(category), `/categories/${categoryToSlug(category)}`);
}

/**
 * listScore, and so high-paying qualification, reads structured fields only.
 * The rate text in these fixtures is deliberately misleading: it must make no
 * difference. The first two are the inputs that got a text parser to score 60
 * ("-$150 adjustment", "$150 customer credits").
 */
const highPaying = BEST_LISTS.find((list) => list.slug === "high-paying-affiliate-programs");
if (!highPaying) fail("the high-paying list is missing");
for (const [mode, value, currency, kind, rate, want] of [
  ["hybrid", 20, "USD", "affiliate", "20% per sale; -$150 adjustment", 0],
  ["hybrid", 20, "USD", "affiliate", "20% per sale; $150 customer credits", 0],
  ["tiered", 75, "USD", "affiliate", "$50-75 per sale", 0],
  ["unknown", null, "USD", "affiliate", "$500 per sale", 0],
  ["flat", 200, "EUR", "affiliate", "$200", 0],
  ["flat", 200, null, "affiliate", "$200", 0], // currency must be set explicitly
  ["flat", 150, "USD", "referral", "$150 per referral", 0], // credit or a gift card
  ["percentage", 30, "USD", "affiliate", "$900 per sale", 30], // the typed percentage, not the text
  ["percentage", 25, "EUR", "affiliate", "25%", 25], // a percentage carries no currency
  ["flat", 200, "USD", "affiliate", "up to $5,000", 65], // the typed dollars, not the text
  ["percentage", Infinity, "USD", "affiliate", "", 0],
] as const) {
  const commission = { type: "one-time", mode, value, currency, rate } as unknown as Program["commission"];
  const got = listScore({ commission, kind });
  // NaN fails every comparison, so it would slip past the tolerance check alone.
  if (!Number.isFinite(got) || Math.abs(got - want) > 1e-9) {
    fail(`listScore(${mode} ${value} ${currency} ${kind} ${JSON.stringify(rate)}) is ${got}, expected ${want}`);
  }
  const qualifies = highPaying.qualifies({ ...livePrograms[0], commission, kind });
  if (qualifies !== want >= 30) {
    fail(`high-paying ${qualifies ? "takes" : "refuses"} ${mode} ${value} ${currency} ${kind} ${JSON.stringify(rate)}`);
  }
}

/**
 * A referral reward (credit or a gift card) shows its published wording in
 * list and category tables, never the bare number, and scores 0.
 */
{
  const rate = "$100-$200 Amazon gift card per referral";
  const commission = { type: "one-time", mode: "flat", value: 200, currency: "USD", rate } as Program["commission"];
  const shown = listCommissionText({ commission, kind: "referral" });
  if (shown !== rate) fail(`a referral reward shows ${JSON.stringify(shown)} instead of its own wording`);
  if (listScore({ commission, kind: "referral" }) !== 0) fail("a referral reward has a commission score");
  if (listCommissionText({ commission, kind: "affiliate" }) !== "$200") {
    fail("an affiliate flat payout no longer shows its figure");
  }
}

/**
 * flatUsdPayout, the filter a high-ticket list will use, reads structured
 * fields only. The rate text is deliberately misleading in these fixtures: it
 * must make no difference.
 */
for (const [mode, value, currency, rate, want] of [
  ["flat", 300, "USD", "anything", 300],
  ["flat", 150, "EUR", "$150 per sale", 0],
  ["flat", 150, "", "$150 per sale", 0], // currency must be set explicitly
  ["tiered", 550, "USD", "$550 per sale", 0],
  ["hybrid", 550, "USD", "$550 per sale", 0],
  ["percentage", 150, "USD", "$150 per sale", 0],
  ["flat", null, "USD", "$150 per sale", 0],
] as const) {
  const got = flatUsdPayout({ type: "one-time", mode, value, rate, currency });
  if (got !== want) fail(`flatUsdPayout(${mode} ${value} ${JSON.stringify(currency)}) is ${got}, expected ${want}`);
}

/**
 * A brand with no program (no_program, or discontinued) gets a page that
 * answers "no" and shows no terms, on the HTML page and in its .md twin.
 *
 * The .md twins are generated files and are read here. Program pages are not
 * prerendered: SocialListenLoader awaits connection(), so /programs/[slug] is
 * dynamic and the build writes no HTML for it. checkNoProgramPages, at the end
 * of this file, boots this build with `next start` and fetches each page, which
 * is the HTML a reader and a crawler receive.
 */
const noProgramPages = programs.filter(hasNoProgram);
for (const program of noProgramPages) {
  const md = requireText(join("programs", `${program.slug}.md`));
  for (const line of ["## Terms", "Commission:", "Cookie window:", "Payout:", "Sign up:", "## Restrictions"]) {
    if (md.includes(line)) fail(`programs/${program.slug}.md shows "${line}" for a brand with no program`);
  }
  if (!md.includes(`have an affiliate program? ${noAnswerStart(program)}`)) {
    fail(`programs/${program.slug}.md does not answer "${noAnswerStart(program)}"`);
  }
}

function noAnswerStart(program: { lastVerifiedAt?: string | null }): string {
  return program.lastVerifiedAt ? `No (checked ${program.lastVerifiedAt}).` : "No.";
}

const robotsText = JSON.stringify(robots());
for (const userAgent of [
  "OAI-SearchBot",
  "GPTBot",
  "Claude-SearchBot",
  "ClaudeBot",
  "PerplexityBot",
  "Google-Extended",
]) {
  if (!robotsText.includes(userAgent)) {
    fail(`robots policy does not name ${userAgent}`);
  }
}
for (const blockedPath of ["/api/", "/_ph/"]) {
  if (!robotsText.includes(blockedPath)) {
    fail(`robots policy does not block ${blockedPath}`);
  }
}

const dangerousValue = { text: "</script><script>alert(1)</script>\u2028" };
const serialized = serializeJsonLd(dangerousValue);
if (serialized.includes("<") || serialized.includes(">")) {
  fail("JSON-LD serializer emitted an HTML-significant character");
}
if (JSON.stringify(JSON.parse(serialized)) !== JSON.stringify(dangerousValue)) {
  fail("JSON-LD serializer changed the source data");
}

for (const [file, expectedType] of [
  ["rankings.html", "CollectionPage"],
  [join("categories", "ai.html"), "CollectionPage"],
  [join("categories", "ai.html"), "FAQPage"],
  ["compare.html", "WebPage"],
  ["networks.html", "FAQPage"],
  ["networks.html", "BreadcrumbList"],
  ...BEST_LISTS.map((list) => [`${bestPath(list).slice(1)}.html`, "ItemList"] as const),
]) {
  const htmlPath = join(BUILD_APP, file);
  if (!existsSync(htmlPath)) fail(`${file} was not prerendered`);
  const html = readFileSync(htmlPath, "utf8");
  if (!html.includes('rel="describedby" href="/llms.txt"')) {
    fail(`${file} does not advertise llms.txt`);
  }
  if (html.includes("AggregateRating")) {
    fail(`${file} contains unsupported AggregateRating markup`);
  }
  if (!jsonLdNodes(html).some((block) => block["@type"] === expectedType)) {
    fail(`${file} has no ${expectedType} JSON-LD block`);
  }
}

/**
 * Network pages target "<Network> affiliate programs" and /networks targets
 * "affiliate networks". Production once shipped the stored slug as the name
 * on every one of them: "partnerstack Affiliate Programs — 408 Programs |
 * OpenAffiliate", with an em dash, at 62 characters (measured 2026-10-12).
 * These read the prerendered HTML, so they hold what a reader and a crawler
 * receive, not what the code meant to send.
 */
function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
function htmlTitle(html: string): string {
  return decodeEntities(/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "");
}
function htmlDescription(html: string): string {
  return decodeEntities(/<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? "");
}
function htmlH1(html: string): string {
  const inner = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? "";
  return decodeEntities(inner.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, "")).trim();
}
/** The text a reader sees: no scripts (the RSC payload carries raw values), styles, comments or tags. */
function visibleText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/g, " ")
      .replace(/<style[\s\S]*?<\/style>/g, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
  );
}
function readBuilt(file: string): string {
  if (!existsSync(join(BUILD_APP, file))) fail(`${file} was not prerendered`);
  return readFileSync(join(BUILD_APP, file), "utf8");
}

const TITLE_MAX = 60;
const DESCRIPTION_RANGE = [120, 155] as const;
/** networks/[slug]/page.tsx puts the first 20 table rows in its ItemList. */
const NETWORK_ITEMLIST_MAX = 20;
function checkHead(file: string, html: string, mustInclude: string): void {
  const title = htmlTitle(html);
  if (title.length > TITLE_MAX || /[–—]/.test(title) || !title.includes(mustInclude)) {
    fail(`${file} title must be ${TITLE_MAX} characters or fewer, with no en or em dash, and name "${mustInclude}": ${title}`);
  }
  const description = htmlDescription(html);
  if (description.length < DESCRIPTION_RANGE[0] || description.length > DESCRIPTION_RANGE[1]) {
    fail(`${file} meta description is ${description.length} characters; keep it 120 to 155: ${description}`);
  }
}

for (const network of liveNetworks) {
  const meta = NETWORK_META[network];
  if (!meta) {
    fail(`network "${network}" has live programs but no NETWORK_META entry, so its name would be guessed`);
  }
  const words = meta.description.trim().split(/\s+/).length;
  if (words > 20) fail(`NETWORK_META.${network}.description is ${words} words; the limit is 20`);
  if (meta.logo && !existsSync(join(PUBLIC, meta.logo))) {
    fail(`NETWORK_META.${network}.logo points at ${meta.logo}, which is not in public/`);
  }

  // "CJ Affiliate Programs", never "CJ Affiliate Affiliate Programs".
  const heading = networkHeading(network);
  if (/\bAffiliate Affiliate\b/i.test(heading)) {
    fail(`NETWORK_META.${network} needs a shortName: its heading reads "${heading}"`);
  }
  const slug = networkToSlug(network);
  const file = join("networks", `${slug}.html`);
  const html = readBuilt(file);
  checkHead(file, html, heading);
  if (htmlH1(html) !== heading) {
    fail(`${file} H1 should be "${heading}" and is "${htmlH1(html)}"`);
  }
  const nodes = jsonLdNodes(html);
  if (!nodes.some((node) => node["@type"] === "CollectionPage" && node.name === heading)) {
    fail(`${file} CollectionPage JSON-LD must be named "${heading}"`);
  }
  if (!nodes.some((node) => node["@type"] === "BreadcrumbList")) fail(`${file} has no BreadcrumbList JSON-LD`);

  // The rows, not only the shell around them: a table with no rows, an
  // ItemList with no items or a twin holding only its H1 kept a correct title
  // and H1, and every check above passed. Expected sets come from the registry.
  const inNetwork = (p: { network?: string | null }) => (p.network ?? IN_HOUSE) === network;
  const want = programs.filter((p) => inNetwork(p) && isLive(p)).map((p) => p.slug);
  const tbody = /<tbody>([\s\S]*?)<\/tbody>/.exec(html)?.[1] ?? "";
  const htmlRows = [...tbody.matchAll(/href="\/programs\/([a-z0-9-]+)"/g)].map((m) => m[1]);
  sameRows(`${file} table`, [...htmlRows].sort(), [...want].sort());
  const itemList = (
    nodes.find((node) => node["@type"] === "CollectionPage") as
      | { mainEntity?: { numberOfItems?: number; itemListElement?: { position?: number; url?: string }[] } }
      | undefined
  )?.mainEntity;
  const items = itemList?.itemListElement ?? [];
  if (itemList?.numberOfItems !== want.length) {
    fail(`${file} ItemList says ${itemList?.numberOfItems} programs; the network has ${want.length} live`);
  }
  if (items.some((item, i) => item.position !== i + 1)) fail(`${file} ItemList positions are not 1..n`);
  // The page lists its first NETWORK_ITEMLIST_MAX table rows, in table order.
  sameRows(
    `${file} ItemList`,
    items.map((item) => item.url ?? ""),
    htmlRows.slice(0, NETWORK_ITEMLIST_MAX).map((s) => `${BASE_URL}/programs/${s}`)
  );

  const md = requireText(join("networks", `${slug}.md`));
  if (!md.startsWith(`# ${heading}\n`)) {
    fail(`networks/${slug}.md must start with "# ${heading}": ${md.split("\n")[0]}`);
  }
  const foreign = foreignMarkup(md);
  if (foreign) fail(`networks/${slug}.md has markup the generator did not write: ${foreign}`);
  // The twin lists the network's live programs, the same set as the HTML table
  // and the category twins: a brand with no program, or a status nobody could
  // confirm, keeps its own .md and is neither listed nor counted here.
  const mdWant = programs.filter((p) => inNetwork(p) && isLive(p)).map((p) => p.slug);
  const mdSection = md.split(/^## /m).find((part) => part.startsWith("Programs\n")) ?? "";
  const mdRows = [
    ...mdSection.matchAll(/^- \[(?:[^\]\\\n]|\\.)+\]\(https:\/\/openaffiliate\.dev\/programs\/([a-z0-9-]+)\.md\) — /gm),
  ].map((m) => m[1]);
  sameRows(`networks/${slug}.md`, [...mdRows].sort(), [...mdWant].sort());
  const mdVerified = programs.filter((p) => inNetwork(p) && p.verified && isLive(p)).length;
  const mdClaim = `> ${mdWant.length} ${mdWant.length === 1 ? "program" : "programs"}, ${mdVerified} verified by OpenAffiliate.`;
  if (!md.split("\n").includes(mdClaim)) fail(`networks/${slug}.md should state "${mdClaim}"`);
}

/**
 * A count agrees with its noun on every generated surface: "1 program". The
 * network twins and llms.txt printed "1 programs" for five networks. Reads
 * every Markdown file and llms*.txt under public/.
 */
for (const file of readdirSync(PUBLIC, { recursive: true }) as string[]) {
  if (!file.endsWith(".md") && !/(^|\/)llms[^/]*\.txt$/.test(file)) continue;
  const hit = /\b1 programs\b/.exec(readFileSync(join(PUBLIC, file), "utf8"));
  if (hit) fail(`public/${file} says "1 programs"; a count of one takes the singular`);
}

const networksIndex = readBuilt("networks.html");
checkHead("networks.html", networksIndex, "Affiliate Networks");
if (htmlH1(networksIndex) !== "Affiliate Networks") {
  fail(`networks.html H1 should be "Affiliate Networks" and is "${htmlH1(networksIndex)}"`);
}
/**
 * /networks against the registry: one card per network with its counts, the
 * ItemList, and FAQ answers whose numbers are recomputed here rather than read
 * back from the page. Order is the page's rule: most live programs first, ties
 * by stored value.
 */
const liveList = programs.filter(isLive);
const networkRows = liveNetworks
  .map((network) => {
    const list = liveList.filter((p) => (p.network ?? IN_HOUSE) === network);
    return { network, count: list.length, verified: list.filter((p) => p.verified).length };
  })
  .sort((a, b) => b.count - a.count || a.network.localeCompare(b.network));
const cardRows = networkRows.filter((row) => row.network !== IN_HOUSE);
const inHouseCount = networkRows.find((row) => row.network === IN_HOUSE)?.count ?? 0;
const plural = (n: number) => `${n} ${n === 1 ? "program" : "programs"}`;

const anchors = [...networksIndex.matchAll(/<a [^>]*href="\/networks\/([a-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/g)];
sameRows(
  "networks.html cards",
  anchors.map((m) => m[1]),
  [...cardRows.map((row) => networkToSlug(row.network)), ...(inHouseCount > 0 ? [networkToSlug(IN_HOUSE)] : [])]
);
cardRows.forEach((row, i) => {
  const want = `${plural(row.count)} · ${row.verified} verified`;
  const text = visibleText(anchors[i][2]).replace(/\s+/g, " ");
  if (!text.includes(want)) fail(`networks.html card for ${row.network} should say "${want}": ${text.trim().slice(0, 120)}`);
});

const indexNodes = jsonLdNodes(networksIndex);
const indexList = (
  indexNodes.find((node) => node["@type"] === "CollectionPage") as
    | { mainEntity?: { numberOfItems?: number; itemListElement?: { position?: number; url?: string }[] } }
    | undefined
)?.mainEntity;
if (indexList?.numberOfItems !== cardRows.length) {
  fail(`networks.html ItemList says ${indexList?.numberOfItems} networks; the registry has ${cardRows.length}`);
}
sameRows(
  "networks.html ItemList",
  (indexList?.itemListElement ?? []).map((item) => item.url ?? ""),
  cardRows.map((row) => `${BASE_URL}/networks/${networkToSlug(row.network)}`)
);

const faq = (
  (indexNodes.find((node) => node["@type"] === "FAQPage") as
    | { mainEntity?: { name?: string; acceptedAnswer?: { text?: string } }[] }
    | undefined)?.mainEntity ?? []
).map((q) => ({ q: q.name ?? "", a: q.acceptedAnswer?.text ?? "" }));
const [top1, top2, top3] = cardRows;
const faqWant: [string, string[]][] = [
  ["What is an affiliate network?", cardRows.map((row) => networkName(row.network))],
  [
    "Which affiliate network has the most programs?",
    top1
      ? [
          `${networkName(top1.network)}, with ${top1.count} of the ${liveList.length} live programs listed here.`,
          ...[top2, top3].filter(Boolean).map((row) => `${networkName(row.network)} (${row.count})`),
        ]
      : [],
  ],
  [
    "Do you need an affiliate network to join a program?",
    [`${inHouseCount} of the ${liveList.length} programs here (${Math.round((inHouseCount / liveList.length) * 100)}%)`],
  ],
];
if (faq.length !== faqWant.length) fail(`networks.html FAQPage has ${faq.length} questions; expected ${faqWant.length}`);
const indexText = visibleText(networksIndex).replace(/\s+/g, " ");
faqWant.forEach(([q, parts], i) => {
  if (faq[i].q !== q) fail(`networks.html FAQ question ${i + 1} should be "${q}" and is "${faq[i].q}"`);
  const missing = parts.find((part) => !faq[i].a.includes(part));
  if (missing) fail(`networks.html FAQ answer to "${q}" should include "${missing}": ${faq[i].a}`);
  // What the crawler reads is what the reader sees.
  if (!indexText.includes(faq[i].q) || !indexText.includes(faq[i].a)) {
    fail(`networks.html shows a different FAQ from its FAQPage JSON-LD: "${q}"`);
  }
});

/**
 * The pilot pages must never show a stored slug where the display name
 * belongs. Case-sensitive on purpose: "Impact" is right, "impact" is the raw
 * value. "in-house" is skipped because it is also an ordinary English word,
 * and a slug followed by ".com" is a domain, not a name.
 */
for (const file of ["networks.html", join("networks", "impact.html"), join("networks", "affitor.html")]) {
  const text = visibleText(readBuilt(file));
  for (const network of liveNetworks) {
    if (network === IN_HOUSE || networkName(network) === network) continue;
    const raw = new RegExp(`(?<![\\w./-])${network}(?![\\w-]|\\.\\w)`);
    const hit = raw.exec(text);
    if (hit) {
      fail(
        `${file} shows the raw network value "${network}" where a reader should see "${networkName(network)}": ` +
          JSON.stringify(text.slice(Math.max(0, hit.index - 40), hit.index + 40))
      );
    }
  }
}

console.log(
  `[machine-surfaces] verified ${programs.length} programs, ${categories.length} categories, ${networks.size} networks, and ${sitemapEntries.length} sitemap URLs`
);

/**
 * The page checks. The alternatives on a no-program page are other programs'
 * cards and do show their terms; each is one `<a href="/programs/…">`, so those
 * anchors are cut before looking for this program's own.
 */
const TERM_LABELS = ["How to Join", "Min payout", "Payment methods", "Approval time", "Score:", "Cookie not published", "Code-based, no cookie"];
const JOIN_LABELS = ["Apply &amp; earn", "Apply & earn", "Check terms on", "Check program terms", "Apply on Affitor"];

function checkNoProgramHtml(program: (typeof programs)[number], page: string, html: string): void {
  const own = html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<a [^>]*href="\/programs\/[a-z0-9-]+"[^>]*>[\s\S]*?<\/a>/g, " ");
  for (const label of JOIN_LABELS) {
    if (own.includes(label)) fail(`${page} shows a join button ("${label}") for a brand with no program`);
  }
  if (program.signupUrl && own.includes(`href="${program.signupUrl}"`)) {
    fail(`${page} links the signup URL of a brand with no program`);
  }
  if (/>Commission<\/h3>/.test(own)) fail(`${page} shows a Commission card for a brand with no program`);
  for (const label of TERM_LABELS) {
    if (own.includes(label)) fail(`${page} shows "${label}" for a brand with no program`);
  }
  if (/\b\d+d cookie\b/.test(own)) fail(`${page} shows a cookie window for a brand with no program`);
  if (program.commission.value != null) {
    const figure = commissionDisplay(program.commission);
    if (own.includes(figure)) fail(`${page} shows its stored commission (${figure}) for a brand with no program`);
  }

  const faqPage = jsonLdNodes(html).find((node) => node["@type"] === "FAQPage") as
    | { mainEntity?: { name?: string; acceptedAnswer?: { text?: string } }[] }
    | undefined;
  const first = faqPage?.mainEntity?.[0];
  const answer = first?.acceptedAnswer?.text ?? "";
  const start = noAnswerStart(program);
  if (first?.name !== `Does ${program.name} have an affiliate program?` || !answer.startsWith(start)) {
    fail(`${page} FAQ JSON-LD must answer "Does ${program.name} have an affiliate program?" with "${start}"; got ${JSON.stringify(answer.slice(0, 80))}`);
  }
}

async function checkNoProgramPages(): Promise<number> {
  if (noProgramPages.length === 0) return 0;
  const port = await new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
  const base = `http://127.0.0.1:${port}`;
  const server = spawn(
    process.execPath,
    [join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port), "-H", "127.0.0.1"],
    { cwd: ROOT, stdio: "ignore" }
  );
  let exited = false;
  server.once("exit", () => {
    exited = true;
  });
  try {
    for (let waited = 0; ; waited += 250) {
      if (exited) fail("next start exited before serving; the no-program page checks need `npm run build` first");
      if (waited > 30_000) fail("next start did not answer within 30 seconds");
      if (await fetch(`${base}/robots.txt`).then((r) => r.ok, () => false)) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    for (const program of noProgramPages) {
      const page = `/programs/${program.slug}`;
      const res = await fetch(`${base}${page}`);
      if (res.status !== 200) fail(`${page} answered ${res.status}`);
      checkNoProgramHtml(program, page, await res.text());
    }
  } finally {
    server.kill();
  }
  return noProgramPages.length;
}

checkNoProgramPages().then(
  (count) => console.log(`[machine-surfaces] verified ${count} no-program pages as served by next start`),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
