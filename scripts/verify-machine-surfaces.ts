#!/usr/bin/env tsx

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import sitemap from "../src/app/sitemap";
import robots from "../src/app/robots";
import { serializeJsonLd } from "../src/lib/json-ld";
import {
  categories,
  categoryToSlug,
  networkToSlug,
  programs,
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
if (!llms.includes(`${programs.length} programs`)) {
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
if (!llmsFull.includes(`Every one of the ${programs.length} programs`)) {
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
const verifiedCount = programs.filter((p) => p.verified).length;
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
for (const program of programs.filter((p) => p.verified)) {
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
const networks = new Set(
  programs.map((program) => program.network ?? "in-house")
);
for (const network of networks) {
  const url = `${BASE_URL}/networks/${networkToSlug(network)}`;
  if (!sitemapUrlSet.has(url)) fail(`sitemap is missing ${url}`);
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
  ["compare.html", "WebPage"],
] as const) {
  const htmlPath = join(BUILD_APP, file);
  if (!existsSync(htmlPath)) fail(`${file} was not prerendered`);
  const html = readFileSync(htmlPath, "utf8");
  if (!html.includes('rel="describedby" href="/llms.txt"')) {
    fail(`${file} does not advertise llms.txt`);
  }
  if (html.includes("AggregateRating")) {
    fail(`${file} contains unsupported AggregateRating markup`);
  }
  const jsonLdBlocks = [
    ...html.matchAll(
      /<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/g
    ),
  ].map((match) => JSON.parse(match[1]) as { "@type"?: string });
  if (!jsonLdBlocks.some((block) => block["@type"] === expectedType)) {
    fail(`${file} has no ${expectedType} JSON-LD block`);
  }
}

console.log(
  `[machine-surfaces] verified ${programs.length} programs, ${categories.length} categories, ${networks.size} networks, and ${sitemapEntries.length} sitemap URLs`
);
