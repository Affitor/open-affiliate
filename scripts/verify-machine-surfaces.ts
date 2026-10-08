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
 * llms.txt is fetched once and read whole, so it has a size budget.
 *
 * The budget only means something if the file's size does not grow with the
 * registry. It used to: every verified program was listed inline, ~101 bytes a
 * row, and at 49 verified the file sat 4 bytes under this number. That is not
 * a budget, it is a tripwire — the next program to be verified would have
 * failed this check with nothing in the code to explain why.
 *
 * So the number stayed and the file shrank: the index now shows a bounded
 * sample and links verified.md for the rest. The two checks below are what
 * keep it that way. If this cap is ever approached again, move content out to
 * a linked surface rather than raising it, because the point is a file an
 * agent reads in full.
 */
const LLMS_MAX_BYTES = 10240;
if (Buffer.byteLength(llms) > LLMS_MAX_BYTES) {
  fail(
    `llms.txt is ${Buffer.byteLength(llms)} bytes; the cap is ${LLMS_MAX_BYTES}. ` +
      `Move content to a linked surface instead of raising the cap.`
  );
}

/**
 * The index must stay bounded, and must say so truthfully.
 *
 * Rather than duplicate the generator's sample size here — two constants drift
 * — this reads the claim llms.txt makes about itself and checks the file
 * against it. A reintroduced full listing fails both halves: the stated count
 * would exceed the ceiling, and an unstated one has no claim to match.
 */
const LLMS_MAX_INLINE_PROGRAMS = 20;
const verifiedSection = llms.split(/^## /m).find((part) => part.startsWith("Verified programs"));
if (!verifiedSection) fail("llms.txt has no 'Verified programs' section");
const claim = verifiedSection.match(/^(?:Highest-scoring (\d+) of \d+|All (\d+)) verified/m);
if (!claim) {
  fail(
    "llms.txt's verified section does not state how many programs it lists; " +
      "it must, so this check can hold it to that number"
  );
}
const claimed = Number(claim[1] ?? claim[2]);
const inlined = (verifiedSection.match(/^- \[/gm) ?? []).length;
if (inlined !== claimed) {
  fail(`llms.txt says it lists ${claimed} verified programs but lists ${inlined}`);
}
if (claimed > LLMS_MAX_INLINE_PROGRAMS) {
  fail(
    `llms.txt inlines ${claimed} programs; the ceiling is ${LLMS_MAX_INLINE_PROGRAMS}. ` +
      `The index's size must not grow with the registry — link verified.md instead.`
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
