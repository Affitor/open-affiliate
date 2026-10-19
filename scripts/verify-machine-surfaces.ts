#!/usr/bin/env tsx

import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createServer, type AddressInfo } from "node:net";
import { join } from "node:path";

import sitemap from "../src/app/sitemap";
import robots from "../src/app/robots";
import { serializeJsonLd } from "../src/lib/json-ld";
import registryData from "../src/lib/registry.json";
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
  verifiedDate,
  indexable,
  type BestList,
} from "../src/lib/best-lists";
import { hasNoProgram } from "../src/lib/no-program";
import { LLMS_MAX_BYTES } from "./llms-budget";
import { namesTerm, termsConfirmed } from "../src/lib/confirmed-terms";
import { chunkScan, droppedSentences, termsApiProblems, termsHtmlProblems, termsMdProblems } from "./unconfirmed-checks";
import { alsoOnAffitor, applyButton } from "../src/lib/apply-cta";
import { outboundUrl } from "../src/lib/outbound-link";
import { changelog } from "../src/lib/changelog";
import { blogApplyHref } from "../src/lib/apply-cta";
import { getPost, postReady, postSelection, postTitle, type BestPost, type PostSelection } from "../src/lib/best-posts";
import { programMd } from "./generate-md";
import { affitorAnchorProblems } from "./affitor-checks";
import { sectionProblems } from "./directory-checks";
import { directoryGroups, homepageSets } from "../src/lib/programs-directory";
import { gzipSync } from "node:zlib";
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
  searchPrograms,
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
// The cap and why it is 10240: scripts/llms-budget.ts.
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
if (!requireText("changelog.md").includes(changelog[0].title)) {
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
 *
 * The one `<` the generator writes is mdUrl's autolink around a signup URL:
 * `<http(s)://host…>`. An autolink is set aside only when the URL inside it
 * passes the schema's own URL allow-list (SCHEMA_URL: lowercase ASCII domain
 * of two or more labels with an alphabetic last label, no xn--, no port, no
 * user@, at most 253 characters, no character reference). Anything else in
 * angle brackets stays, and its `<` fails the check.
 */
const SCHEMA_URL = new RegExp(
  (JSON.parse(readFileSync(join(process.cwd(), "schema", "program.schema.json"), "utf8")) as {
    properties: { signup_url: { pattern: string } };
  }).properties.signup_url.pattern
);
function foreignMarkup(md: string): string | null {
  for (let i = md.indexOf("]"); i !== -1; i = md.indexOf("]", i + 1)) {
    let slashes = 0;
    for (let j = i - 1; j >= 0 && md[j] === "\\"; j--) slashes += 1;
    if (slashes % 2 === 0 && !md.startsWith(`](${BASE_URL}/`, i)) {
      return md.slice(Math.max(0, i - 60), i + 40);
    }
  }
  const text = md.replace(/<(https?:\/\/[^\s<>]*)>/g, (autolink, url: string) => (SCHEMA_URL.test(url) ? "" : autolink));
  const raw = /<|&#|\r/.exec(text);
  return raw ? JSON.stringify(text.slice(Math.max(0, raw.index - 60), raw.index + 40)) : null;
}
for (const [autolink, allowed] of [
  ["<https://example.com/partners?ref=1>", true],
  ["<https://user@evil.example/>", false],
  ["<https://example.com:8080/>", false],
  ["<https://xn--pple-43d.com/>", false],
  ["<https://example.com/&#47;x>", false],
] as const) {
  if ((foreignMarkup(`x ${autolink}`) === null) !== allowed) {
    fail(`the markup guard ${allowed ? "refuses" : "accepts"} the autolink ${autolink}`);
  }
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
  // A hub below HUB_MIN_INDEXED verified programs is noindex, so it stays out of the sitemap.
  const indexed = indexable(list);
  if (indexed && !sitemapUrlSet.has(url)) fail(`sitemap is missing ${url}`);
  if (!indexed && sitemapUrlSet.has(url)) fail(`sitemap lists ${url}, a noindex hub`);
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
  if (html.includes('<meta name="robots" content="noindex') === indexed) {
    fail(`${htmlFile} must ${indexed ? "not carry" : "carry"} a noindex robots meta`);
  }
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

  // A referral reward (credit or a gift card) shows its rate as published in
  // the table's commission cell and in its twin row, never the bare number:
  // Attio is "$200 gift card per referral", not "$200".
  const tableTrs = html.slice(tbodyStart, tbodyEnd).match(/<tr[\s\S]*?<\/tr>/g) ?? [];
  const mdLines = md.split("\n");
  rows.forEach((p, i) => {
    if (p.kind !== "referral") return;
    const rate = String(p.commission.rate);
    const cells = tableTrs[i]?.match(/<td[\s\S]*?<\/td>/g) ?? [];
    const shown = decodeEntities((cells[2] ?? "").replace(/<[^>]*>/g, "")).trim();
    if (shown !== rate) fail(`${htmlFile} shows ${p.slug}'s reward as ${JSON.stringify(shown)}, not ${JSON.stringify(rate)}`);
    const line = mdLines.find((l) => l.includes(`/programs/${p.slug}.md) — `)) ?? "";
    const terms = unescape(line.slice(line.indexOf(" — ") + 3));
    if (!terms.startsWith(`${rate} `)) fail(`${mdFile} shows ${p.slug}'s reward as ${JSON.stringify(terms.slice(0, 60))}`);
  });

  // "Verified <date>" appears exactly when a shown row is verified, with the
  // date verifiedDate gives over those rows, on the page and in the twin.
  // React splits the text around {date} with comments, so those go first.
  const expectedDate = verifiedDate(rows) ?? "";
  const pageText = visibleText(html.replace(/<!--[\s\S]*?-->/g, "")).replace(/\s+/g, " ");
  const pageDates = [...pageText.matchAll(/Verified (\d{4}-\d{2}-\d{2}):/g)].map((m) => m[1]).join();
  const mdDates = [...md.matchAll(/^Verified (\d{4}-\d{2}-\d{2}): /gm)].map((m) => m[1]).join();
  if (pageDates !== expectedDate) fail(`${htmlFile} says "Verified ${pageDates}"; the verified rows give "${expectedDate}"`);
  if (mdDates !== expectedDate) fail(`${mdFile} says "Verified ${mdDates}"; the verified rows give "${expectedDate}"`);

  // Each row's signup link is the apply link with the list UTM, on both surfaces.
  // The twin prints it as mdUrl does: an autolink with the few characters
  // Markdown would read as structure percent-encoded.
  rows.forEach((p, i) => {
    const href = applyButton(p, "list").href;
    const shownHref = decodeEntities(/<a href="([^"]*)"[^>]*>Sign up<\/a>/.exec(tableTrs[i] ?? "")?.[1] ?? "");
    if (shownHref !== href) fail(`${htmlFile} links ${p.slug} to ${JSON.stringify(shownHref)}, not ${href}`);
    const line = mdLines.find((l) => l.includes(`/programs/${p.slug}.md) — `)) ?? "";
    const autolink = `<${href.replace(/[\s<>[\]\\`]/g, encodeURIComponent)}>`;
    if (!line.endsWith(`, sign up: ${autolink}`)) fail(`${mdFile} row for ${p.slug} does not end with "sign up: ${autolink}"`);
  });
}

/**
 * An editorial post on a list URL: the blocks, in order, are postSelection's
 * programs as of this build; the title counts them; the disclosure is there;
 * every Apply link is blogApplyHref with the post's UTM; the twin carries the
 * same programs and links.
 */
function checkPostPage(post: BestPost, selection: PostSelection, path: string): void {
  const url = `${BASE_URL}${path}`;
  if (!sitemapUrlSet.has(url)) fail(`sitemap is missing ${url}`);
  const title = postTitle(post, selection);
  if (`${title} | OpenAffiliate`.length > 60 || /[–—]/.test(title)) fail(`${path} title must be 60 characters or fewer with no en or em dash: ${title}`);
  if (post.description.length < 120 || post.description.length > 155) fail(`${path} description is ${post.description.length} characters; keep it 120 to 155`);
  const htmlFile = `${path.slice(1)}.html`;
  if (!existsSync(join(BUILD_APP, htmlFile))) fail(`${htmlFile} was not prerendered`);
  const html = readFileSync(join(BUILD_APP, htmlFile), "utf8");
  const want = selection.shown.map(({ program }) => program.slug);
  const blocks = [...html.matchAll(/data-post-program="([a-z0-9-]+)"/g)].map((m) => m[1]);
  if (blocks.join() !== want.join()) fail(`${path} shows blocks ${JSON.stringify(blocks)}, not postSelection's ${JSON.stringify(want)}`);
  if (!new RegExp(`<h1[^>]*>${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</h1>`).test(html)) fail(`${path} H1 is not "${title}"`);
  if (!html.includes("data-post-disclosure")) fail(`${path} has no disclosure`);
  for (const { program } of selection.shown) {
    const href = blogApplyHref(program, post.slug).replaceAll("&", "&amp;");
    const tag = [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]).find((t) => t.includes(`href="${href}"`));
    if (!tag) fail(`${path} has no Apply link for ${program.slug} with the blog UTM`);
    if (!tag.includes('rel="sponsored nofollow noopener"')) fail(`${path} Apply link for ${program.slug} is not rel="sponsored nofollow noopener"`);
  }
  if (post.category) {
    const catFile = `categories/${categoryToSlug(post.category)}.html`;
    const cat = existsSync(join(BUILD_APP, catFile)) ? readFileSync(join(BUILD_APP, catFile), "utf8") : "";
    if (!cat.includes("data-list-picks") || !cat.includes(`href="${path}"`)) fail(`${catFile} does not link its post ${path} in its "Posts about" block`);
  }
  const mdFile = join(ROOT, "public", `${path.slice(1)}.md`);
  const md = readFileSync(mdFile, "utf8");
  if (!md.startsWith(`# ${title}\n`)) fail(`${mdFile} does not start with the post title`);
  const twinOrder = [...md.matchAll(/^\d+\. \[[^\]\n]*\]\(https:\/\/openaffiliate\.dev\/programs\/([a-z0-9-]+)\.md\)/gm)].map((m) => m[1]);
  if (twinOrder.join() !== want.join()) fail(`${mdFile} lists ${JSON.stringify(twinOrder)}, not postSelection's ${JSON.stringify(want)}`);
  for (const { program } of selection.shown) {
    const autolink = `<${blogApplyHref(program, post.slug).replace(/[\s<>[\]\\`]/g, encodeURIComponent)}>`;
    if (!md.includes(`/programs/${program.slug}.md)`) || !md.includes(autolink)) fail(`${mdFile} is missing ${program.slug} or its Apply link`);
  }
}

for (const list of BEST_LISTS) {
  const post = getPost(list.slug);
  const selection = post ? postSelection(post) : null;
  if (post && selection && postReady(selection)) checkPostPage(post, selection, bestPath(list));
  else checkListPage(list, bestPath(list));
}
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
 * verifiedDate counts verified rows only. An unverified row with a date of
 * its own gave a "Verified" line to a list with no verified row, and a later
 * date than the real verification when both were present.
 */
for (const [rows, want] of [
  [[{ verified: false, lastVerifiedAt: "2026-10-12" }], null],
  [[{ verified: false, lastVerifiedAt: "2026-10-12" }, { verified: true, lastVerifiedAt: "2026-09-01" }], "2026-09-01"],
  [[{ verified: true, lastVerifiedAt: "2026-09-01 19:51:47.799000+00:00" }, { verified: true, lastVerifiedAt: null }], "2026-09-01"],
] as const) {
  const got = verifiedDate(rows.map((r) => ({ ...r })));
  if (got !== want) fail(`verifiedDate(${JSON.stringify(rows)}) is ${got}, expected ${want}`);
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

/**
 * An unverified program shows no cookie window, payout or approval, and its
 * commission is marked unconfirmed; a verified one shows all three
 * (src/lib/confirmed-terms.ts). Every program with a terms page is checked:
 * its .md twin here, its HTML page and the API in checkServedPages below.
 */
const termsPages = programs.filter((p) => !hasNoProgram(p));
const unconfirmedCount = termsPages.filter((p) => !termsConfirmed(p)).length;
if (unconfirmedCount === 0 || unconfirmedCount === termsPages.length) {
  fail(`${unconfirmedCount} of ${termsPages.length} programs are unverified; the terms checks need both kinds to mean anything`);
}
for (const program of termsPages) {
  const problems = termsMdProblems(program, requireText(join("programs", `${program.slug}.md`)));
  if (problems.length) fail(`programs/${program.slug}.md ${problems.join("; ")}`);
}
// A brand on Affitor too (also_on.affitor): exactly one line in its twin's
// terms, with the stored figure (none when Affitor publishes none) and the
// marketplace link; no such line on any other twin. The registry may hold no
// link at all (the sync removes one when its program leaves Affitor), so the
// fixture below, not the data, proves these checks read something.
function alsoOnMdProblem(program: Program, md: string): string | null {
  const lines = md.split("\n").filter((l) => l.startsWith("Also on Affitor"));
  const a = program.alsoOn?.affitor;
  if (!a) return lines.length ? `shows "${lines[0]}" with no also_on` : null;
  const figure = a.commission && !commissionUnknown(a.commission) ? `: ${commissionDisplay(a.commission)} ` : ", ";
  if (lines.length === 1 && lines[0].startsWith(`Also on Affitor${figure}`) && lines[0].endsWith(`sign up: <${a.url}>`)) return null;
  return `does not show its Affitor line once, with ${figure.trim() || "no figure"} and ${a.url}: ${JSON.stringify(lines)}`;
}
function alsoOnHtmlProblem(program: Program, html: string): string | null {
  const also = alsoOnAffitor(program);
  if (!also) return html.includes("Also on Affitor") ? "shows an Affitor line with no also_on" : null;
  const shown = html.includes(`>${also.line}</p>`) && html.includes(`href="${also.href.replaceAll("&", "&amp;")}"`);
  return shown ? null : `does not show "${also.line}" with its Affitor button`;
}
for (const program of termsPages) {
  const problem = alsoOnMdProblem(program, requireText(join("programs", `${program.slug}.md`)));
  if (problem) fail(`programs/${program.slug}.md ${problem}`);
}
// The fixture: a synthetic link on a real entry, rendered by generate-md's own
// programMd, must pass; the same twin broken any way, or a line on a program
// with no link, must fail.
const ALSO_ON_URL = "https://affitor.com/marketplace/fixture";
const ALSO_ON_COMMISSION = { type: "recurring", rate: "20%", mode: "percentage", value: 20, currency: "USD", duration: "12 months" } as const;
const alsoOnBase = termsPages.find((p) => !p.alsoOn?.affitor)!;
const alsoOnFixture: Program = { ...alsoOnBase, alsoOn: { affitor: { url: ALSO_ON_URL, commission: ALSO_ON_COMMISSION } } };
{
  const entry = (registryData.programs as unknown as Parameters<typeof programMd>[0][]).find((e) => e.slug === alsoOnBase.slug)!;
  const linkedMd = programMd({ ...entry, also_on: { affitor: { url: ALSO_ON_URL, commission: ALSO_ON_COMMISSION } } });
  const bareMd = programMd({ ...entry, also_on: { affitor: { url: ALSO_ON_URL } } });
  const bare: Program = { ...alsoOnBase, alsoOn: { affitor: { url: ALSO_ON_URL } } };
  if (alsoOnMdProblem(alsoOnFixture, linkedMd)) fail(`the Affitor line check refused the fixture's own twin: ${alsoOnMdProblem(alsoOnFixture, linkedMd)}`);
  if (alsoOnMdProblem(bare, bareMd)) fail(`the Affitor line check refused the fixture's twin with no figure: ${alsoOnMdProblem(bare, bareMd)}`);
  for (const [what, md] of [
    ["no line", programMd(entry)],
    ["another figure", linkedMd.replace(": 20% ", ": 25% ")],
    ["another url", linkedMd.replace(ALSO_ON_URL, "https://affitor.com/marketplace/other")],
    ["the line twice", linkedMd.replace(/^(Also on Affitor.*)$/m, "$1\n$1")],
    ["no figure", bareMd],
  ] as const) {
    if (!alsoOnMdProblem(alsoOnFixture, md)) fail(`the Affitor line check passed a fixture twin with ${what}`);
  }
  if (!alsoOnMdProblem(alsoOnBase, linkedMd)) fail("the Affitor line check passed a line on a program with no also_on");
}
// llms-full.txt is every live twin verbatim, so it holds when the twins do.
for (const program of livePrograms) {
  if (!llmsFull.includes(requireText(join("programs", `${program.slug}.md`)))) {
    fail(`llms-full.txt does not carry programs/${program.slug}.md verbatim`);
  }
}
// A row naming an unverified program, in any index or list twin, gives no cookie window.
const unconfirmedSlugs = new Set(termsPages.filter((p) => !termsConfirmed(p)).map((p) => p.slug));
function unconfirmedCookieRow(line: string): string | null {
  const slug = /\]\(https:\/\/openaffiliate\.dev\/programs\/([a-z0-9-]+)\.md\)/.exec(line)?.[1];
  return slug && unconfirmedSlugs.has(slug) && /\b\d+d cookie\b/.test(line) ? slug : null;
}
for (const file of readdirSync(PUBLIC, { recursive: true }) as string[]) {
  if (!file.endsWith(".md") && !/(^|\/)llms[^/]*\.txt$/.test(file)) continue;
  for (const line of readFileSync(join(PUBLIC, file), "utf8").split("\n")) {
    const slug = unconfirmedCookieRow(line);
    if (slug) fail(`public/${file} gives a cookie window for unverified ${slug}: ${line}`);
  }
}
// Non-vacuity: each md check must fail on a twin that breaks the rule.
{
  const off = termsPages.find((p) => !termsConfirmed(p) && p.cookieDays != null)!;
  const offMd = requireText(join("programs", `${off.slug}.md`));
  const leaked = offMd.replace(/^(Commission: .*)$/m, `$1\nCookie window: ${off.cookieDays} days`);
  if (termsMdProblems(off, leaked).length === 0) fail("the .md terms check passed a twin showing an unverified cookie window");
  const on = termsPages.find((p) => termsConfirmed(p) && p.cookieDays != null)!;
  const onMd = requireText(join("programs", `${on.slug}.md`));
  if (termsMdProblems(on, onMd.replace(/^Cookie window: .*\n/m, "")).length === 0) {
    fail("the .md terms check passed a verified twin with its cookie window removed");
  }
  if (termsMdProblems(on, onMd.replace(/^Cookie window: \d+ days$/m, `Cookie window: ${(on.cookieDays ?? 0) + 1} days`)).length === 0) {
    fail("the .md terms check passed a verified twin with a different cookie window");
  }
  // VideoGen's description stated these, in prose, before confirmedProse.
  const prose = offMd.replace(/^## About\n\n/m, "## About\n\nPayouts are monthly with a $50 minimum. Applications are reviewed by hand.\n\n");
  if (termsMdProblems(off, prose).length === 0) fail("the .md terms check passed a twin stating payout and approval in prose");
  // A sentence the filter drops from a program's own prose, put back into its twin.
  const dropped = termsPages
    .filter((p) => !termsConfirmed(p))
    .flatMap((p) => droppedSentences(p).filter((s) => !namesTerm(s)).map((s) => ({ p, s })))[0];
  if (!dropped) fail("no unverified program has a dropped sentence to probe the .md prose check with");
  const droppedMd = `${requireText(join("programs", `${dropped.p.slug}.md`))}\n${dropped.s}\n`;
  if (termsMdProblems(dropped.p, droppedMd).length === 0) fail(`the .md terms check passed ${dropped.p.slug} carrying a dropped sentence`);
  // An optional field printed empty instead of left out.
  if (termsMdProblems(off, offMd.replace(/^(Category: .*)$/m, "Commission conditions: \n$1")).length === 0) {
    fail("the .md terms check passed an empty Commission conditions line");
  }
  if (termsMdProblems(off, `${offMd}\n## Restrictions\n\n`).length === 0) fail("the .md terms check passed an empty Restrictions section");
  const row = `- [${off.name}](${BASE_URL}/programs/${off.slug}.md) — 20% recurring, ${off.cookieDays}d cookie (unverified, terms unconfirmed)`;
  if (unconfirmedCookieRow(row) !== off.slug) fail("the index row check passed an unverified row with a cookie window");
}

/**
 * What ships to the browser as JavaScript: no chunk may carry a cookie window,
 * payout methods or approval time as data for an unverified program. /compare
 * once bundled the whole registry, and the client registry every cookie window.
 */
const STATIC = join(ROOT, ".next", "static");
if (!existsSync(STATIC)) fail(".next/static is missing; the chunk check needs `npm run build` first");
const shownBySlug = new Map(programs.map((p) => [p.slug, termsConfirmed(p)]));
const shown = (slug: string) => shownBySlug.get(slug);
let chunkCount = 0;
let confirmedRecords = 0;
for (const file of readdirSync(STATIC, { recursive: true }) as string[]) {
  if (!file.endsWith(".js")) continue;
  chunkCount++;
  const scan = chunkScan(readFileSync(join(STATIC, file), "utf8"), shown);
  if (scan.problems.length) fail(`.next/static/${file} ships unconfirmed terms: ${scan.problems.join("; ")}`);
  confirmedRecords += scan.confirmedRecords;
}
if (chunkCount === 0) fail(".next/static has no JavaScript chunks to check");
// The client registry ships verified cookie windows: a scan that finds none
// is reading the chunks wrong, not proving them clean.
if (confirmedRecords === 0) fail("the chunk check found no verified program's terms in any chunk; it cannot be reading the client registry");
// Prerendered pages carry their client props in the RSC payload. /compare
// passes every program's comparable terms that way; it is also fetched from
// next start below, in case it is not prerendered.
for (const file of readdirSync(BUILD_APP, { recursive: true }) as string[]) {
  if (!file.endsWith(".html") && !file.endsWith(".rsc")) continue;
  const scan = chunkScan(readFileSync(join(BUILD_APP, file), "utf8").replace(/\\"/g, '"'), shown);
  if (scan.problems.length) fail(`.next/server/app/${file} ships unconfirmed terms: ${scan.problems.join("; ")}`);
}
// Non-vacuity: the record's slug before or after its terms, and escaped JSON.
{
  const off = termsPages.find((p) => !termsConfirmed(p) && p.cookieDays != null)!;
  const on = termsPages.find((p) => termsConfirmed(p) && p.cookieDays != null)!;
  for (const [what, probe, want] of [
    ["slug before, two records", `[{"slug":"${on.slug}","cookieDays":${on.cookieDays}},{"slug":"${off.slug}","cookie_days":${off.cookieDays}}]`, 1],
    ["slug after the term", `[{"cookieDays":${on.cookieDays},"slug":"${on.slug}"},{"cookieDays":${off.cookieDays},"slug":"${off.slug}"}]`, 1],
    ["an object literal", `{slug:"${off.slug}",name:"x",cookieDays:${off.cookieDays}}`, 1],
    ["escaped JSON", `const r=JSON.parse("{\\"cookieDays\\":${off.cookieDays},\\"slug\\":\\"${off.slug}\\"}")`, 1],
    ["a nested commission object before the term", `{"slug":"${off.slug}","commission":{"rate":"20%"},"cookieDays":${off.cookieDays}}`, 1],
    ["a brace inside a string", `{"slug":"${off.slug}","description":"example {","cookieDays":${off.cookieDays}}`, 1],
    ["a closing brace inside a string, verified", `{"slug":"${on.slug}","description":"} example","cookieDays":${on.cookieDays}}`, 0],
  ] as const) {
    const scan = chunkScan(probe, shown);
    if (scan.problems.length !== want) fail(`the chunk check found ${scan.problems.length} problems in a probe with ${what}; expected ${want}`);
  }
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
  // Table order is the commission order every surface shares
  // (commission-order.ts): exactly what the REST API's commission_desc returns
  // for the same network, ties included.
  sameRows(
    `${file} table order vs /api/programs?network=…&sort=commission_desc`,
    htmlRows,
    searchPrograms({ network, sort: "commission_desc" }).map((p) => p.slug)
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
 * back from the page. Two orders, as on the page: cards and the ItemList go A
 * to Z by display name, ignoring case; the FAQ ranks by live program count,
 * ties by stored value.
 */
const liveList = programs.filter(isLive);
const networkRows = liveNetworks
  .map((network) => {
    const list = liveList.filter((p) => (p.network ?? IN_HOUSE) === network);
    return { network, count: list.length, verified: list.filter((p) => p.verified).length };
  })
  .sort((a, b) => b.count - a.count || a.network.localeCompare(b.network));
const byCount = networkRows.filter((row) => row.network !== IN_HOUSE);
const cardRows = [...byCount].sort((a, b) =>
  networkName(a.network).localeCompare(networkName(b.network), "en", { sensitivity: "base" })
);
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
const [top1, top2, top3] = byCount;
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

/** A join button on a paused page: its own markup, other programs' cards cut out. */
function pausedJoinLabel(html: string): string | null {
  const own = html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<a [^>]*href="\/programs\/[a-z0-9-]+"[^>]*>[\s\S]*?<\/a>/g, " ");
  return JOIN_LABELS.find((label) => own.includes(label)) ?? null;
}

/** What a no-program page must not show: problems, so the check can also be fed a mutated page. */
function noProgramHtmlProblems(program: (typeof programs)[number], html: string): string[] {
  const problems: string[] = [];
  // Only other programs' names (links) are cut; the comparison table's other cells stay checked.
  const own = html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<a [^>]*href="\/programs\/[a-z0-9-]+"[^>]*>[\s\S]*?<\/a>/g, " ");
  for (const label of JOIN_LABELS) {
    if (own.includes(label)) problems.push(`shows a join button ("${label}") for a brand with no program`);
  }
  // Prefix match: a rendered signup link may carry the outbound UTM after the stored URL.
  if (program.signupUrl && own.includes(`href="${program.signupUrl.replaceAll("&", "&amp;")}`)) problems.push("links the signup URL of a brand with no program");
  if (/>Commission<\/h3>/.test(own)) problems.push("shows a Commission card for a brand with no program");
  if (/data-term="/.test(own)) problems.push("shows an earnings-card term row for a brand with no program");
  for (const label of TERM_LABELS) {
    if (own.includes(label)) problems.push(`shows "${label}" for a brand with no program`);
  }
  if (/\b\d+d cookie\b|\b\d+-day cookie\b/.test(own)) problems.push("shows a cookie window for a brand with no program");
  // A no-program file stores the placeholder commission (value null, schema), so this rarely runs.
  if (program.commission.value != null) {
    const figure = commissionDisplay(program.commission);
    if (own.includes(figure)) problems.push(`shows its stored commission (${figure}) for a brand with no program`);
  }

  const faqPage = jsonLdNodes(html).find((node) => node["@type"] === "FAQPage") as
    | { mainEntity?: { name?: string; acceptedAnswer?: { text?: string } }[] }
    | undefined;
  const first = faqPage?.mainEntity?.[0];
  const answer = first?.acceptedAnswer?.text ?? "";
  const start = noAnswerStart(program);
  if (first?.name !== `Does ${program.name} have an affiliate program?` || !answer.startsWith(start)) {
    problems.push(`FAQ JSON-LD must answer "Does ${program.name} have an affiliate program?" with "${start}"; got ${JSON.stringify(answer.slice(0, 80))}`);
  }
  return problems;
}

function checkNoProgramHtml(program: (typeof programs)[number], page: string, html: string): void {
  const problems = noProgramHtmlProblems(program, html);
  if (problems.length) fail(`${page} ${problems.join("; ")}`);
}

/**
 * Program aliases as next start serves them, probed inside the same server
 * session as the no-program pages: /programs/<alias> and its .md answer 308
 * with Location /programs/<slug> (and .md); that target answers 200, so there
 * is one hop and no loop, and a real slug that has aliases is not itself
 * redirected; /api/programs/<alias> answers the canonical program's exact
 * body. scripts/program-aliases.test.ts checks every alias in the config; this
 * checks a few over HTTP.
 */
const ALIAS_PROBES = 3;
async function checkAliasRedirects(base: string): Promise<number> {
  const aliases = Object.entries((registryData as { aliases?: Record<string, string> }).aliases ?? {}).slice(0, ALIAS_PROBES);
  if (aliases.length === 0) fail("registry.json has no alias routes to probe; run `npm run build` first");
  for (const [alias, slug] of aliases) {
    for (const ext of ["", ".md"]) {
      const from = `/programs/${alias}${ext}`;
      const to = `/programs/${slug}${ext}`;
      const res = await fetch(`${base}${from}`, { redirect: "manual" });
      const location = res.headers.get("location");
      if (res.status !== 308 || !location || new URL(location, base).pathname !== to) {
        fail(`${from} answered ${res.status} with Location ${location}; expected 308 to ${to}`);
      }
      const target = await fetch(new URL(location, base), { redirect: "manual" });
      if (target.status !== 200) fail(`${to}, where ${from} redirects, answered ${target.status}`);
    }
    const viaAlias = await fetch(`${base}/api/programs/${alias}`);
    const canonical = await fetch(`${base}/api/programs/${slug}`);
    if (viaAlias.status !== 200 || canonical.status !== 200 || (await viaAlias.text()) !== (await canonical.text())) {
      fail(`/api/programs/${alias} (${viaAlias.status}) does not answer with the body of /api/programs/${slug}`);
    }
  }
  return aliases.length;
}

/** Fetches each path with a few requests in flight; a dynamic page renders per request. */
async function fetchAll(base: string, paths: string[], each: (path: string, body: string) => void): Promise<void> {
  const queue = [...paths];
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (let path = queue.shift(); path; path = queue.shift()) {
        const res = await fetch(`${base}${path}`);
        if (res.status !== 200) fail(`${path} answered ${res.status}`);
        each(path, await res.text());
      }
    })
  );
}

/**
 * gzip size cap for the /programs/a-z HTML, the A–Z directory (N-2,
 * 2026-10-16; moved off /programs in redesign r3, 2026-10-19). Measured on next
 * start in CI when it lived on /programs: 37,592 bytes gzip for 1,038 live
 * programs, about 30 bytes gzip per program. 60,000 leaves room for ~700 more
 * programs. Past it, split the directory into per-letter pages rather than
 * raising the cap.
 */
const PROGRAMS_HTML_GZIP_BUDGET = 60_000;

async function checkServedPages(): Promise<string> {
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
      if (exited) fail("next start exited before serving; the served page checks need `npm run build` first");
      if (waited > 30_000) fail("next start did not answer within 30 seconds");
      if (await fetch(`${base}/robots.txt`).then((r) => r.ok, () => false)) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const noProgramHtml = new Map<(typeof programs)[number], string>();
    for (const program of noProgramPages) {
      const page = `/programs/${program.slug}`;
      const res = await fetch(`${base}${page}`);
      if (res.status !== 200) fail(`${page} answered ${res.status}`);
      const html = await res.text();
      checkNoProgramHtml(program, page, html);
      noProgramHtml.set(program, html);
    }
    // Non-vacuity: what the comparison table could carry, put inside it, still fails.
    {
      const [np, html] = [...noProgramHtml][0];
      const inTable = (extra: string) => html.replace(/(<table data-compare[^>]*>)/, `$1<tbody><tr><td>${extra}</td></tr></tbody>`);
      if (!/<table data-compare/.test(html)) fail(`${np.slug}: no comparison table to probe the no-program check with`);
      for (const [what, extra] of [
        ["a join button", "Apply &amp; earn 20%"],
        ["the signup URL", `<a href="${np.signupUrl ?? "https://example.com/signup"}">x</a>`],
        // A rendered link carries the outbound UTM after the stored URL; the prefix match must still catch it.
        ["the tagged signup URL", `<a href="${outboundUrl(np.signupUrl ?? "https://example.com/signup", "list", np.slug).replaceAll("&", "&amp;")}">x</a>`],
        ["a cookie window", "60-day cookie"],
        ["a term row", `<span data-term="approval">Automatic</span>`],
      ] as const) {
        const mutated = inTable(extra);
        const fixture = what.endsWith("signup URL") && !np.signupUrl ? { ...np, signupUrl: "https://example.com/signup" } : np;
        if (noProgramHtmlProblems(fixture, mutated).length === 0) fail(`the no-program check passed ${np.slug} with ${what} inside its comparison table`);
      }
    }
    const probed = await checkAliasRedirects(base);
    console.log(`[machine-surfaces] verified ${probed} aliases (page, .md and API) as served by next start`);

    // Terms pages: every program with terms, verified or not.
    const storesAll = (p: Program) => (p.cookieDays ?? 0) > 0 && p.payout.minimum != null && Boolean(p.approval);
    const off = termsPages.find((p) => !termsConfirmed(p) && storesAll(p));
    const on = termsPages.find((p) => termsConfirmed(p) && storesAll(p));
    // A verified program with an approval time, and a paused one, for the checks below.
    const onTime = termsPages.find((p) => termsConfirmed(p) && p.approval && p.approvalTime && p.payout.frequency);
    const pausedPage = termsPages.find((p) => p.status === "paused");
    const withConditions = termsPages.find((p) => termsConfirmed(p) && p.payout.conditions);
    if (!withConditions) fail("the page checks need a verified program with payout conditions");
    if (!onTime || !pausedPage) fail("the page checks need a verified program with approval, approval time and payout frequency, and a paused program");
    if (!off || !on) fail("the terms checks need a verified and an unverified program that store cookie, payout and approval");
    const bySlug = new Map(termsPages.map((p) => [`/programs/${p.slug}`, p]));
    // An unverified program whose stored prose has a sentence the filter drops
    // and namesTerm alone would not catch: the probe for the dropped-sentence check.
    const dropped = termsPages
      .filter((p) => !termsConfirmed(p))
      .flatMap((p) => droppedSentences(p).filter((s) => !namesTerm(s)).map((s) => ({ p, s })))[0];
    if (!dropped) fail("no unverified program has a dropped sentence to probe the prose check with");
    const kept = new Map<Program, string>();
    let affitorOnProgramPages = 0;
    await fetchAll(base, [...bySlug.keys()], (page, html) => {
      const program = bySlug.get(page)!;
      const problems = termsHtmlProblems(program, html);
      if (problems.length) fail(`${page} ${problems.join("; ")}`);
      // The Affitor line and its secondary button, only where also_on says so.
      const also = alsoOnHtmlProblem(program, html);
      if (also) fail(`${page} ${also}`);
      // Every affitor.com link is tracked (oa_to_affitor_click) and carries the UTM.
      const affitor = affitorAnchorProblems(html);
      if (affitor.problems.length) fail(`${page} ${affitor.problems.join("; ")}`);
      affitorOnProgramPages += affitor.tracked;
      // A paused program shows its last known terms but no join button.
      if (program.status === "paused") {
        const join = pausedJoinLabel(html);
        if (join) fail(`${page} shows a join button ("${join}") for a paused program`);
      }
      if (program === off || program === on || program === dropped.p || program === alsoOnBase || program === onTime || program === pausedPage || program === withConditions) kept.set(program, html);
    });
    // Non-vacuity: the page check fails on a page that breaks the rule either way.
    const offHtml = kept.get(off)!;
    for (const [leak, extra] of [
      ["a cookie badge", `<div><svg></svg>${off.cookieDays}d cookie</div>`],
      ["a cookie row", `<div data-term="cookie" class="x"><dt class="y">Cookie</dt><dd class="z">${off.cookieDays} days</dd></div>`],
      ["a payout row", `<div data-term="payout" class="x"><dt class="y">Payout</dt><dd class="z">Monthly, from a $${off.payout.minimum} minimum</dd></div>`],
      ["an approval row", `<div data-term="approval" class="x"><dt class="y">Approval</dt><dd class="z">Reviewed by hand</dd></div>`],
      ["a cookie window in its flow", `<span>${off.cookieDays}-day cookie</span>`],
      ["an approval step in its flow", `<span data-term="step-approval" class="x">Reviewed by hand approval on PartnerStack</span>`],
      ["a payout step in its flow", `<span data-term="step-payout" class="x">Monthly</span>`],
      ["an untagged approval step in its flow", `<span class="x">Reviewed by hand approval on PartnerStack</span>`],
      ["a payout step in its RSC payload", `<script>self.__next_f.push([1,${JSON.stringify(JSON.stringify({ "data-term": "step-payout", children: "Monthly" }))}])</script>`],
      ["a minimum payout row", `<span><svg></svg>Min payout</span><span class="text-sm font-semibold">$${off.payout.minimum}</span>`],
      ["payout and approval in prose", `<p>Payouts are monthly with a $50 minimum. Applications are reviewed by hand.</p>`],
      ["a cookie window in its JSON-LD", `<script type="application/ld+json">{"description":"Earn 30% with a 60-day cookie."}</script>`],
      ["a cookie window in its RSC payload", `<script>self.__next_f.push([1,"{\\"cookieDays\\":${off.cookieDays}}"])</script>`],
      ["a payout sentence in its RSC payload", `<script>self.__next_f.push([1,${JSON.stringify(`5:${JSON.stringify(["$", "p", null, { children: "Payouts are monthly with a $50 minimum." }])}\n`)}])</script>`],
    ]) {
      if (termsHtmlProblems(off, offHtml + extra).length === 0) fail(`the page terms check passed an unverified page showing ${leak}`);
    }
    // A sentence the filter drops from this program's own prose, put back into the RSC payload.
    const flight = `<script>self.__next_f.push([1,${JSON.stringify(JSON.stringify({ children: dropped.s }))}])</script>`;
    if (termsHtmlProblems(dropped.p, kept.get(dropped.p)! + flight).length === 0) {
      fail(`the page terms check passed ${dropped.p.slug} carrying a dropped sentence in its RSC payload`);
    }
    // An optional field rendered empty instead of left out.
    const emptyConditions = `<p class="text-[11px] text-muted-foreground/70 leading-relaxed border-t border-border/30 pt-2"></p>`;
    if (termsHtmlProblems(off, offHtml + emptyConditions).length === 0) fail("the page terms check passed empty commission conditions");
    // On a verified page a conditions row is allowed, so only the empty-row rule can catch this one.
    if (termsHtmlProblems(on, kept.get(on)! + `<p data-term="conditions" class="x"></p>`).length === 0) fail("the page terms check passed a verified page with empty commission conditions");
    const onHtml = kept.get(on)!;
    if (termsHtmlProblems(on, onHtml.replaceAll(`>${on.cookieDays} days</dd>`, "></dd>")).length === 0) {
      fail("the page terms check passed a verified page with its cookie window removed");
    }
    if (termsHtmlProblems(on, onHtml.replaceAll(`$${on.payout.minimum} minimum`, `$${(on.payout.minimum ?? 0) + 1} minimum`)).length === 0) {
      fail("the page terms check passed a verified page showing a different minimum payout");
    }
    if (termsHtmlProblems(on, onHtml.replace(/data-term="approval"/g, 'data-term="gone"')).length === 0) {
      fail("the page terms check passed a verified page with its approval row removed");
    }
    // Rows that say more, or other, than the stored fields: the comparison is exact, not a prefix.
    const rowValue = (html: string, term: string, edit: (v: string) => string) =>
      html.replace(new RegExp(`(data-term="${term}"[^>]*><dt[^>]*>[^<]*</dt><dd[^>]*>)([^<]*)(</dd>)`), (_m, a, v, b) => a + edit(v) + b);
    const timeHtml = kept.get(onTime)!;
    for (const [what, html] of [
      ["extra words after its payout", rowValue(timeHtml, "payout", (v) => `${v} or later`)],
      ["a different payout frequency", rowValue(timeHtml, "payout", (v) => `${v.charAt(0)}x${v.slice(1)}`)],
      ["extra words after its approval", rowValue(timeHtml, "approval", (v) => `${v} or automatically`)],
      ["its approval time removed", rowValue(timeHtml, "approval", (v) => v.replace(` (${onTime.approvalTime})`, ""))],
    ] as const) {
      if (termsHtmlProblems(onTime, html).length === 0) fail(`the page terms check passed a verified page with ${what}`);
    }
    // Payout conditions: required as stored on a verified page, found anywhere on an unverified one.
    const conditionsHtml = kept.get(withConditions)!.replace(/<p data-term="payout-conditions"[^>]*>[\s\S]*?<\/p>/, "");
    if (termsHtmlProblems(withConditions, conditionsHtml).length === 0) fail("the page terms check passed a verified page with its payout conditions removed");
    const offConditions = { ...off, payout: { ...off.payout, conditions: withConditions.payout.conditions } };
    const conditionsFlight = `<script>self.__next_f.push([1,${JSON.stringify(JSON.stringify({ payout: { conditions: withConditions.payout.conditions } }))}])</script>`;
    if (termsHtmlProblems(offConditions, offHtml + conditionsFlight).length === 0) fail("the page terms check passed an unverified page carrying its payout conditions in its RSC payload");
    if (pausedJoinLabel(kept.get(pausedPage)! + `<a href="https://example.com">Apply &amp; earn 20%</a>`) === null) {
      fail("the paused-page check passed a paused page with a join button");
    }
    // The also_on fixture on a served page: the page's markup for its line and
    // button passes; a page without them, or that markup on a program with no
    // link, fails. No real link is needed.
    {
      const baseHtml = kept.get(alsoOnBase)!;
      const also = alsoOnAffitor(alsoOnFixture)!;
      const markup = `<p class="text-xs text-muted-foreground">${also.line}</p><a href="${also.href.replaceAll("&", "&amp;")}" target="_blank">`;
      if (alsoOnHtmlProblem(alsoOnFixture, baseHtml + markup)) fail("the page Affitor check refused the fixture's line and button");
      if (!alsoOnHtmlProblem(alsoOnFixture, baseHtml)) fail("the page Affitor check passed a page missing the fixture's line");
      if (!alsoOnHtmlProblem(alsoOnBase, baseHtml + markup)) fail("the page Affitor check passed an Affitor line on a program with no also_on");
    }

    // /compare as served: its props carry every program's comparable terms.
    {
      const res = await fetch(`${base}/compare?p=${off.slug},${on.slug}`);
      if (res.status !== 200) fail(`/compare answered ${res.status}`);
      const compare = (await res.text()).replace(/\\"/g, '"');
      if (!compare.includes(`"slug":"${on.slug}"`) || !compare.includes(`"cookieDays":${on.cookieDays}`)) {
        fail("/compare does not carry a verified program's terms; the payload check would read nothing");
      }
      const scan = chunkScan(compare, shown);
      if (scan.problems.length) fail(`/compare ships unconfirmed terms: ${scan.problems.join("; ")}`);
      if (scan.confirmedRecords === 0) fail("/compare: the payload check found no verified program's terms to read");
    }

    // OA → Affitor links on every other page that renders them: each flow must
    // show at least one tracked link, or the check reads nothing.
    {
      if (affitorOnProgramPages === 0) fail("no program page has a tracked Affitor link; the Affitor link check read nothing");
      const onAffitor = livePrograms.find((p) => p.network === "affitor" && termsPages.includes(p));
      if (!onAffitor) fail("no live Affitor-network program to probe /compare with");
      const flows: [string, string[]][] = [
        ["/for-brands", ["/for-brands"]],
        ["lists", ["/best", ...BEST_LISTS.map(bestPath), ...categories.map((c) => `/categories/${categoryToSlug(c)}`)]],
      ];
      for (const [flow, paths] of flows) {
        let tracked = 0;
        await fetchAll(base, [...new Set(paths)], (page, html) => {
          const affitor = affitorAnchorProblems(html);
          if (affitor.problems.length) fail(`${page} ${affitor.problems.join("; ")}`);
          tracked += affitor.tracked;
        });
        if (tracked === 0) fail(`${flow}: no tracked Affitor link found; the Affitor link check read nothing`);
      }
      // /compare is static: its table, Join links included, renders in the
      // browser from the props, so its served HTML has no anchors to check.
      // The props must carry an Affitor applyHref (the flow exists); that
      // compare-view renders p.applyHref only through AffitorLink is held by
      // the source guard in scripts/affitor-links.test.ts.
      {
        const compare = (await (await fetch(`${base}/compare?p=${onAffitor.slug},${on.slug}`)).text()).replace(/\\"/g, '"');
        if (!/"applyHref":"https:\/\/affitor\.com\/[^"]*utm_source=openaffiliate/.test(compare)) {
          fail("/compare props carry no Affitor applyHref with the UTM; the compare Join flow is not checked");
        }
      }
      // Non-vacuity: the same page with the tracking marker removed fails.
      const html = kept.get(off) ?? "";
      const plain = `<a href="https://affitor.com/marketplace/x?utm_source=openaffiliate&amp;utm_medium=apply&amp;utm_campaign=x">`;
      if (affitorAnchorProblems(html + plain).problems.length === 0) fail("the Affitor link check passed an untracked link");
    }

    // N-2: /programs/a-z links every live program in its server-rendered A–Z
    // directory, in directory order, once each, and /programs links to it; the
    // homepage's three program sections are homepageSets(), in order.
    // Mutations of the fetched HTML must fail, so the checks read what they claim to.
    {
      const programsHtml = await (await fetch(`${base}/programs`)).text();
      if (!/<a\b[^>]*\shref="\/programs\/a-z"/.test(programsHtml)) fail("/programs does not link /programs/a-z");
      const listHtml = await (await fetch(`${base}/programs/a-z`)).text();
      const order = directoryGroups(programs).flatMap((g) => g.programs.map((p) => p.slug));
      const dir = sectionProblems(listHtml, "all-programs", order, true);
      if (dir.length) fail(`/programs/a-z ${dir.join("; ")}`);
      const gz = gzipSync(listHtml).length;
      if (gz > PROGRAMS_HTML_GZIP_BUDGET) fail(`/programs/a-z HTML is ${gz} bytes gzip; the budget is ${PROGRAMS_HTML_GZIP_BUDGET}`);
      console.log(`[machine-surfaces] /programs/a-z links ${order.length} programs, ${listHtml.length} bytes raw, ${gz} gzip (budget ${PROGRAMS_HTML_GZIP_BUDGET})`);
      const first = `<a href="/programs/${order[0]}">`;
      const mutations: [string, string][] = [
        ["without its directory", listHtml.replace('<section id="all-programs"', '<section id="gone"')],
        ["with one program left out", listHtml.replace(new RegExp(`<a href="/programs/${order[1]}">[^<]*</a>`), "")],
        ["with a program that is not live", listHtml.replace(first, `<a href="/programs/zz-not-a-live-program">x</a>${first}`)],
        ["with a program twice", listHtml.replace(first, `${first}x</a>${first}`)],
      ];
      for (const [what, html] of mutations) {
        if (sectionProblems(html, "all-programs", order, true).length === 0) fail(`the /programs/a-z directory check passed a page ${what}`);
      }

      const homeHtml = await (await fetch(`${base}/`)).text();
      const sets = homepageSets(programs);
      const slugs = (list: Program[]) => list.map((p) => p.slug);
      for (const [id, list] of [["home-rankings", sets.rankings], ["home-featured", sets.featured]] as const) {
        const problems = sectionProblems(homeHtml, id, slugs(list));
        if (problems.length) fail(`/ ${problems.join("; ")}`);
      }
      // The networks band: every live network as a plain link, A to Z as on the /networks grid, in-house last.
      const networkSlugs = [...cardRows, ...networkRows.filter((row) => row.network === IN_HOUSE)].map((n) => networkToSlug(n.network));
      const nets = sectionProblems(homeHtml, "home-networks", networkSlugs, true, "networks");
      if (nets.length) fail(`/ ${nets.join("; ")}`);
      const dropped = homeHtml.replace(new RegExp(`<a href="/networks/${networkSlugs[0]}"[^>]*>[^<]*</a>`), "");
      if (sectionProblems(dropped, "home-networks", networkSlugs, true, "networks").length === 0) fail("the homepage check passed a page with a network link removed");
      if (sectionProblems(homeHtml, "home-networks", [networkSlugs[1], networkSlugs[0], ...networkSlugs.slice(2)], true, "networks").length === 0) {
        fail("the homepage check passed the networks band out of A to Z order");
      }
    }

    // REST: the list and one program of each kind, as served.
    const list = (await (await fetch(`${base}/api/programs`)).json()).programs as Record<string, unknown>[];
    if (list.length !== livePrograms.length) fail(`/api/programs returned ${list.length} programs; ${livePrograms.length} are live`);
    for (const row of list) {
      const program = programs.find((p) => p.slug === row.slug)!;
      const problems = termsApiProblems(program, row);
      if (problems.length) fail(`/api/programs row ${program.slug} ${problems.join("; ")}`);
      // also_on passes through as stored (additive: null when there is none).
      if (JSON.stringify(row.alsoOn) !== JSON.stringify(program.alsoOn ?? null)) {
        fail(`/api/programs row ${program.slug} alsoOn is ${JSON.stringify(row.alsoOn)}, stored ${JSON.stringify(program.alsoOn)}`);
      }
    }
    for (const program of [off, on]) {
      const body = await (await fetch(`${base}/api/programs/${program.slug}`)).json();
      const problems = termsApiProblems(program, body);
      if (problems.length) fail(`/api/programs/${program.slug} ${problems.join("; ")}`);
      const leaked = { ...body, cookieDays: program.cookieDays };
      if (!termsConfirmed(program) && termsApiProblems(program, leaked).length === 0) {
        fail("the API terms check passed an unverified program returning its cookieDays");
      }
      const prose = { ...body, description: `${body.description} Payouts are monthly with a $50 minimum.` };
      if (!termsConfirmed(program) && termsApiProblems(program, prose).length === 0) {
        fail("the API terms check passed an unverified program stating its payout in prose");
      }
      const emptied = { ...body, commissionConditions: "", restrictions: [""] };
      if (!termsConfirmed(program) && termsApiProblems(program, emptied).length < 2) {
        fail("the API terms check passed an empty string in place of a left-out optional field");
      }
    }
    return `${noProgramPages.length} no-program pages, ${termsPages.length} program pages (${unconfirmedCount} unverified) and ${list.length} API rows`;
  } finally {
    server.kill();
  }
}

checkServedPages().then(
  (summary) => console.log(`[machine-surfaces] verified ${summary} as served by next start`),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
