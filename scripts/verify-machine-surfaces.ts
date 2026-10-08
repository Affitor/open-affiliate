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
// 4 bytes under it. This is the warning.
if (llmsBytes > LLMS_MAX_BYTES * 0.85) {
  console.warn(
    `[machine-surfaces] warning: llms.txt is ${llmsBytes} bytes, ` +
      `${Math.round((llmsBytes / LLMS_MAX_BYTES) * 100)}% of the ${LLMS_MAX_BYTES} cap. ` +
      `Move content to a linked surface before it fails.`
  );
}

/**
 * The index must stay bounded in inline programs, and must describe itself
 * truthfully.
 *
 * Two different things get checked, because self-consistency alone is not
 * enough. Reading the file's claim and matching it against the file catches a
 * reintroduced listing earlier than the byte cap would. But a claim about the
 * *registry* — "All N verified" — cannot be validated from the file at all:
 * stating `All 12 verified` while 49 are verified passed the first version of
 * this check. So totals come from the registry, not from the text.
 */
const LLMS_MAX_INLINE_PROGRAMS = 20;
const verifiedCount = programs.filter((p) => p.verified).length;
const verifiedSection = llms
  .split(/^## /m)
  .find((part) => part.startsWith("Verified programs"));
if (!verifiedSection) fail("llms.txt has no 'Verified programs' section");

const sampled = verifiedSection.match(/^Highest-scoring (\d+) of (\d+) verified\./m);
const all = verifiedSection.match(/^All (\d+) verified\./m);
if (!sampled && !all) {
  fail(
    "llms.txt's verified section does not state how many programs it lists; " +
      "it must, so this check can hold it to that number and to the registry"
  );
}

// Count every program link in the section, not only lines beginning "- [".
// A reviewer slipped nine extra rows past the first counter by writing them as
// "* [" — valid Markdown, same rendered list, invisible to a /^- \[/ match.
const inlined = (
  verifiedSection.match(/\]\(https:\/\/openaffiliate\.dev\/programs\//g) ?? []
).length;
const claimed = Number((sampled ?? all)![1]);

if (inlined !== claimed) {
  fail(`llms.txt says it lists ${claimed} verified programs but links ${inlined}`);
}
if (claimed > LLMS_MAX_INLINE_PROGRAMS) {
  fail(
    `llms.txt inlines ${claimed} programs; the ceiling is ${LLMS_MAX_INLINE_PROGRAMS}. ` +
      `The inline block must not grow with the registry — link verified.md instead.`
  );
}
if (sampled) {
  const statedTotal = Number(sampled[2]);
  if (statedTotal !== verifiedCount) {
    fail(
      `llms.txt says ${statedTotal} programs are verified; the registry has ${verifiedCount}`
    );
  }
  if (claimed > statedTotal) {
    fail(`llms.txt claims to list ${claimed} of only ${statedTotal} verified programs`);
  }
}
if (all && claimed !== verifiedCount) {
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
for (const program of programs.filter((p) => p.verified)) {
  if (!verifiedPage.includes(`/programs/${program.slug}.md`)) {
    fail(`verified.md is missing verified program ${program.slug}`);
  }
}
// verified.md tells a reader each entry states when it was checked. Hold it to
// that: the sentence shipped once with no date anywhere on the page.
const undatedVerified = programs.filter(
  (p) => p.verified && p.lastVerifiedAt && !verifiedPage.includes(p.lastVerifiedAt)
);
if (undatedVerified.length) {
  fail(
    `verified.md promises a checked date per entry but omits it for ` +
      `${undatedVerified.length} program(s), e.g. ${undatedVerified[0].slug}`
  );
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
