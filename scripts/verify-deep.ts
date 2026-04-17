#!/usr/bin/env tsx
/**
 * Deep verification of affiliate programs using web search.
 *
 * Unlike verify-programs.ts (URL status + keyword heuristics), this script
 * actually searches the web for each program's affiliate details and
 * cross-checks against YAML data.
 *
 * Usage:
 *   npx tsx scripts/verify-deep.ts              # verify all
 *   npx tsx scripts/verify-deep.ts stripe        # verify single
 *   npx tsx scripts/verify-deep.ts --unverified  # only verified:false programs
 *
 * Requires: FIRECRAWL_API_KEY or uses free search via fetch
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parse as parseYaml } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROGRAMS_DIR = join(__dirname, "..", "programs");
const REPORT_FILE = join(__dirname, "..", "deep-verification-report.json");

// ── Types ──

interface ProgramYaml {
  name: string;
  slug: string;
  url: string;
  signup_url?: string | null;
  commission: { type: string; rate: string; duration?: string; conditions?: string };
  cookie_days?: number;
  payout?: { minimum?: number; frequency?: string; methods?: string[] };
  network?: string;
  verified: boolean;
  restrictions?: string[];
  [key: string]: unknown;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface DeepVerifyResult {
  slug: string;
  name: string;
  yaml_commission: string;
  yaml_signup_url: string | null;
  yaml_cookie_days: number | undefined;
  yaml_verified: boolean;
  search_results: SearchResult[];
  real_signup_url: string | null;
  real_commission: string | null;
  real_cookie_days: number | null;
  real_network: string | null;
  program_exists: boolean;
  program_open: boolean;
  issues: string[];
  severity: "ok" | "minor" | "major" | "critical";
  suggested_fixes: Record<string, unknown>;
}

// ── Helpers ──

function loadProgram(file: string): ProgramYaml {
  const content = readFileSync(join(PROGRAMS_DIR, file), "utf8");
  return parseYaml(content) as ProgramYaml;
}

function loadAllPrograms(): ProgramYaml[] {
  return readdirSync(PROGRAMS_DIR)
    .filter((f) => f.endsWith(".yaml"))
    .sort()
    .map(loadProgram);
}

async function webSearch(query: string): Promise<SearchResult[]> {
  // Use DuckDuckGo HTML search (no API key needed)
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });
    const html = await res.text();

    // Parse results from DuckDuckGo HTML
    const results: SearchResult[] = [];
    const resultRegex =
      /<a rel="nofollow" class="result__a" href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>(.*?)<\/a>/g;
    let match;
    while ((match = resultRegex.exec(html)) !== null && results.length < 8) {
      results.push({
        url: decodeURIComponent(
          match[1].replace(/.*uddg=/, "").replace(/&.*/, "")
        ),
        title: match[2].replace(/<[^>]+>/g, "").trim(),
        snippet: match[3].replace(/<[^>]+>/g, "").trim(),
      });
    }
    return results;
  } catch (e) {
    return [];
  }
}

async function fetchPageText(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "text/html",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ── Analysis ──

function extractCommissionFromText(text: string): string | null {
  const lower = text.toLowerCase();
  // Match patterns like "30% recurring", "$50 per", "20% commission", etc.
  const patterns = [
    /(\d+%)\s*(recurring|commission|revenue share|per sale|per referral|of (?:first |annual )?(?:year|month|payment|revenue))/i,
    /(\$\d+(?:,\d+)?)\s*(?:per|for each|flat|one-time|credit)/i,
    /(earn|receive|get)\s+(\d+%|\$\d+)/i,
    /commission[:\s]+(\d+%|\$\d+)/i,
  ];
  for (const p of patterns) {
    const m = lower.match(p);
    if (m) return m[0].trim();
  }
  return null;
}

function extractCookieDays(text: string): number | null {
  const m = text.match(/(\d+)[- ]day\s*cookie/i) ||
    text.match(/cookie[:\s]*(\d+)\s*days?/i) ||
    text.match(/(\d+)[- ]day\s*(?:tracking|attribution|referral)/i);
  return m ? parseInt(m[1]) : null;
}

function extractNetwork(text: string): string | null {
  const networks = [
    "Impact", "ShareASale", "CJ Affiliate", "PartnerStack",
    "Rewardful", "FirstPromoter", "Tapfiliate", "Post Affiliate Pro",
    "Refersion", "Tune", "Awin", "Rakuten",
  ];
  const lower = text.toLowerCase();
  for (const n of networks) {
    if (lower.includes(n.toLowerCase())) return n;
  }
  return null;
}

function detectClosed(text: string): boolean {
  const lower = text.toLowerCase();
  const indicators = [
    "no longer accepting", "program is closed", "currently closed",
    "not accepting new", "program has ended", "waitlist",
    "program is paused", "not available", "coming soon",
  ];
  return indicators.some((i) => lower.includes(i));
}

function detectNoProgram(results: SearchResult[], text: string): boolean {
  // If search results don't mention affiliate/referral AND page text doesn't either
  const allText = results.map((r) => r.snippet).join(" ") + " " + text;
  const lower = allText.toLowerCase();
  const hasAffiliate = ["affiliate program", "referral program", "partner program",
    "earn commission", "refer and earn"].some((kw) => lower.includes(kw));
  return !hasAffiliate;
}

async function deepVerify(program: ProgramYaml): Promise<DeepVerifyResult> {
  const issues: string[] = [];
  const fixes: Record<string, unknown> = {};

  // Step 1: Search for the real affiliate program info
  const searchQuery = `${program.name} affiliate program ${new Date().getFullYear()}`;
  const searchResults = await webSearch(searchQuery);

  // Also search for referral program (some don't use "affiliate")
  const refResults = await webSearch(`${program.name} referral program commission`);
  const allResults = [...searchResults, ...refResults].filter(
    (r, i, arr) => arr.findIndex((x) => x.url === r.url) === i
  );

  // Step 2: Try to fetch the actual affiliate page
  const affiliateUrl = program.signup_url || program.url;
  const pageText = affiliateUrl ? await fetchPageText(affiliateUrl) : null;
  const pageContent = (pageText || "").toLowerCase();

  // Also check if any search result points to a real affiliate page
  let realSignupUrl: string | null = null;
  let realPageText = "";
  for (const r of allResults.slice(0, 5)) {
    if (
      r.url.includes("affiliate") ||
      r.url.includes("referral") ||
      r.url.includes("partner") ||
      r.snippet.toLowerCase().includes("commission") ||
      r.snippet.toLowerCase().includes("earn")
    ) {
      realSignupUrl = r.url;
      const t = await fetchPageText(r.url);
      if (t) realPageText = t;
      break;
    }
  }

  const combinedText = [
    ...allResults.map((r) => r.snippet),
    pageContent,
    realPageText,
  ].join(" ");

  // Step 3: Extract real data
  const realCommission = extractCommissionFromText(combinedText);
  const realCookieDays = extractCookieDays(combinedText);
  const realNetwork = extractNetwork(combinedText);
  const isClosed = detectClosed(combinedText);
  const noProgram = detectNoProgram(allResults, pageContent + realPageText);

  // Step 4: Compare and find issues
  let programExists = !noProgram;
  let programOpen = !isClosed;

  // Check if program exists
  if (noProgram && allResults.length > 0) {
    issues.push("No affiliate/referral program found in search results");
    programExists = false;
  }

  // Check if closed
  if (isClosed) {
    programOpen = false;
    const hasClosedRestriction = program.restrictions?.some((r) =>
      r.toLowerCase().includes("closed") || r.toLowerCase().includes("waitlist")
    );
    if (!hasClosedRestriction) {
      issues.push("Program appears closed but not marked in restrictions");
    }
  }

  // Check commission
  if (realCommission && program.commission?.rate) {
    const yamlRate = program.commission.rate.toLowerCase();
    const realRate = realCommission.toLowerCase();
    // Simple mismatch detection
    const yamlNum = yamlRate.match(/\d+/)?.[0];
    const realNum = realRate.match(/\d+/)?.[0];
    if (yamlNum && realNum && yamlNum !== realNum) {
      issues.push(
        `Commission mismatch: YAML says "${program.commission.rate}" but found "${realCommission}"`
      );
      fixes["commission.rate"] = realCommission;
    }
  }

  // Check cookie days
  if (realCookieDays && program.cookie_days && realCookieDays !== program.cookie_days) {
    issues.push(
      `Cookie days mismatch: YAML says ${program.cookie_days} but found ${realCookieDays}`
    );
    fixes["cookie_days"] = realCookieDays;
  }

  // Check network
  if (realNetwork && program.network !== realNetwork) {
    issues.push(`Network: found "${realNetwork}" (YAML: "${program.network || "none"}")`);
    fixes["network"] = realNetwork;
  }

  // Check signup URL
  if (realSignupUrl && program.signup_url && realSignupUrl !== program.signup_url) {
    // Only flag if domains differ or path is significantly different
    const yamlDomain = new URL(program.signup_url).hostname;
    const realDomain = new URL(realSignupUrl).hostname;
    if (yamlDomain !== realDomain) {
      issues.push(`Signup URL domain mismatch: YAML="${yamlDomain}" found="${realDomain}"`);
      fixes["signup_url"] = realSignupUrl;
    }
  }

  // Check verified consistency
  if (program.verified && !programExists) {
    issues.push("Marked verified:true but no program found");
    fixes["verified"] = false;
  }
  if (program.verified && !programOpen) {
    issues.push("Marked verified:true but program is closed");
    fixes["verified"] = false;
  }

  // Determine severity
  let severity: "ok" | "minor" | "major" | "critical";
  if (!programExists) severity = "critical";
  else if (issues.length === 0) severity = "ok";
  else if (issues.some((i) => i.includes("Commission mismatch") || i.includes("no program")))
    severity = "major";
  else severity = "minor";

  return {
    slug: program.slug,
    name: program.name,
    yaml_commission: `${program.commission.rate} ${program.commission.type}`,
    yaml_signup_url: program.signup_url || null,
    yaml_cookie_days: program.cookie_days,
    yaml_verified: program.verified,
    search_results: allResults.slice(0, 5),
    real_signup_url: realSignupUrl,
    real_commission: realCommission,
    real_cookie_days: realCookieDays,
    real_network: realNetwork,
    program_exists: programExists,
    program_open: programOpen,
    issues,
    severity,
    suggested_fixes: fixes,
  };
}

// ── Main ──

const SEVERITY_ICON: Record<string, string> = {
  ok: "✅",
  minor: "🟡",
  major: "🟠",
  critical: "❌",
};

const SKIP_VERIFY: Record<string, string> = {
  "kyma-api": "Own product",
};

async function main() {
  const args = process.argv.slice(2);
  const unverifiedOnly = args.includes("--unverified");
  const singleSlug = args.find((a) => !a.startsWith("--"));

  let programs: ProgramYaml[];

  if (singleSlug) {
    const file = `${singleSlug}.yaml`;
    if (!existsSync(join(PROGRAMS_DIR, file))) {
      console.error(`Program not found: ${singleSlug}`);
      process.exit(1);
    }
    programs = [loadProgram(file)];
  } else {
    programs = loadAllPrograms();
    if (unverifiedOnly) {
      programs = programs.filter((p) => !p.verified);
    }
  }

  console.log(`\nDeep verifying ${programs.length} program(s) via web search...\n`);

  const results: DeepVerifyResult[] = [];

  for (const p of programs) {
    if (SKIP_VERIFY[p.slug]) {
      console.log(`  [${results.length + 1}/${programs.length}] ${p.slug}: ⏭️  skipped (${SKIP_VERIFY[p.slug]})`);
      continue;
    }

    process.stdout.write(
      `  [${results.length + 1}/${programs.length}] ${p.name}... `
    );

    const result = await deepVerify(p);
    results.push(result);

    const icon = SEVERITY_ICON[result.severity];
    if (result.issues.length === 0) {
      console.log(`${icon} OK`);
    } else {
      console.log(`${icon} ${result.severity.toUpperCase()} (${result.issues.length} issue${result.issues.length > 1 ? "s" : ""})`);
      for (const issue of result.issues) {
        console.log(`      - ${issue}`);
      }
    }

    // Rate limit: 1 second between programs to avoid search throttling
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Summary
  console.log(`\n${"═".repeat(60)}`);
  console.log("DEEP VERIFICATION SUMMARY");
  console.log(`${"═".repeat(60)}\n`);

  const bySeverity: Record<string, DeepVerifyResult[]> = {};
  for (const r of results) {
    (bySeverity[r.severity] ??= []).push(r);
  }

  for (const sev of ["critical", "major", "minor", "ok"]) {
    const items = bySeverity[sev];
    if (!items) continue;
    const icon = SEVERITY_ICON[sev];
    console.log(`${icon} ${sev.toUpperCase()} (${items.length}):`);
    for (const r of items) {
      if (r.issues.length > 0) {
        console.log(`   ${r.slug}: ${r.issues[0]}`);
      } else {
        console.log(`   ${r.slug}`);
      }
    }
    console.log();
  }

  // Programs that need fixes
  const needsFix = results.filter((r) => Object.keys(r.suggested_fixes).length > 0);
  if (needsFix.length > 0) {
    console.log("SUGGESTED FIXES:");
    for (const r of needsFix) {
      console.log(`   ${r.slug}:`);
      for (const [field, value] of Object.entries(r.suggested_fixes)) {
        console.log(`     ${field}: ${JSON.stringify(value)}`);
      }
    }
    console.log();
  }

  // Save report
  const report = {
    generated_at: new Date().toISOString(),
    total: programs.length,
    summary: Object.fromEntries(
      Object.entries(bySeverity).map(([k, v]) => [k, v.length])
    ),
    results,
  };
  writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2) + "\n");
  console.log(`Full report: deep-verification-report.json`);

  const criticals = bySeverity["critical"]?.length || 0;
  if (criticals > 0) {
    console.log(`\n❌ ${criticals} critical issue(s). Review and fix before publishing.`);
    process.exit(1);
  }
}

main();
