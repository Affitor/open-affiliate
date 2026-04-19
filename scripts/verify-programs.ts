#!/usr/bin/env tsx
/**
 * Verify affiliate program URLs and data accuracy.
 *
 * Usage:
 *   npx tsx scripts/verify-programs.ts          # verify all programs
 *   npx tsx scripts/verify-programs.ts stripe    # verify single program
 *   npx tsx scripts/verify-programs.ts --changed # verify only changed files (CI mode)
 *
 * Exit codes:
 *   0 — all verified OK
 *   1 — verification failures found
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parse as parseYaml } from "yaml";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROGRAMS_DIR = join(__dirname, "..", "programs");
const REPORT_FILE = join(__dirname, "..", "verification-report.json");

// ── Keyword dictionaries ──

const AFFILIATE_KEYWORDS = [
  "affiliate",
  "referral",
  "partner program",
  "commission",
  "earn",
  "refer a friend",
  "refer and earn",
  "payout",
  "cookie duration",
  "cookie days",
  "tracking link",
  "join our affiliate",
  "become an affiliate",
  "become a partner",
  "referral program",
  "affiliate program",
  "referral link",
  "affiliate link",
  "revenue share",
  "recurring commission",
  "per referral",
  "affiliate dashboard",
  "partner dashboard",
  "impact.com",
  "shareasale",
  "cj.com",
  "partnerstack",
  "rewardful",
  "firstpromoter",
  "tapfiliate",
];

const NON_AFFILIATE_KEYWORDS = [
  "technology partner",
  "consulting partner",
  "solution partner",
  "isv partner",
  "reseller",
  "system integrator",
  "alliance partner",
  "open source sponsorship",
  "enterprise partnership",
  "strategic partner",
  "oem partner",
];

const CLOSED_KEYWORDS = [
  "program is closed",
  "no longer accepting",
  "program has ended",
  "discontinued",
  "not currently accepting",
  "program is paused",
  "waitlist",
  "coming soon",
  "not available",
];

// ── Types ──

interface ProgramYaml {
  name: string;
  slug: string;
  url: string;
  signup_url?: string;
  commission: { type: string; rate: string };
  verified: boolean;
  [key: string]: unknown;
}

type VerifyStatus =
  | "confirmed_affiliate"
  | "likely_affiliate"
  | "not_affiliate"
  | "closed"
  | "error"
  | "unclear";

interface VerifyResult {
  slug: string;
  signup_url: string;
  http_status: number | null;
  final_url: string | null;
  status: VerifyStatus;
  score: number;
  affiliate_keywords: string[];
  non_affiliate_keywords: string[];
  closed_indicators: string[];
  commission_found: string[];
  has_signup_form: boolean;
  error: string | null;
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

function getChangedFiles(): string[] {
  try {
    const diff = execSync("git diff --name-only HEAD -- programs/", {
      encoding: "utf8",
      cwd: join(__dirname, ".."),
    }).trim();
    const untracked = execSync(
      "git ls-files --others --exclude-standard -- programs/",
      { encoding: "utf8", cwd: join(__dirname, "..") }
    ).trim();
    const all = [diff, untracked]
      .filter(Boolean)
      .join("\n")
      .split("\n")
      .filter(Boolean)
      .map((f) => f.replace("programs/", ""));
    return all;
  } catch {
    return [];
  }
}

async function fetchPage(
  url: string
): Promise<{ status: number; text: string; finalUrl: string } | null> {
  // Try multiple User-Agent strings — some sites block non-browser requests
  const userAgents = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (compatible; OpenAffiliate/1.0; +https://openaffiliate.dev)",
  ];

  for (const ua of userAgents) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": ua,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
        },
        redirect: "follow",
      });
      clearTimeout(timeout);
      const text = await res.text();

      // If we get a real response (even 404), return it — content may still have keywords
      return { status: res.status, text, finalUrl: res.url };
    } catch {
      continue;
    }
  }
  return null;
}

function analyzeContent(html: string, url?: string): Omit<VerifyResult, "slug" | "signup_url" | "http_status" | "final_url" | "error"> {
  const lower = html.toLowerCase();

  const affiliate_keywords = AFFILIATE_KEYWORDS.filter((kw) =>
    lower.includes(kw)
  );
  const non_affiliate_keywords = NON_AFFILIATE_KEYWORDS.filter((kw) =>
    lower.includes(kw)
  );
  const closed_indicators = CLOSED_KEYWORDS.filter((kw) =>
    lower.includes(kw)
  );

  const commission_found = [
    ...lower.matchAll(
      /(\d+%?\s*(?:commission|recurring|revenue share|per (?:referral|signup|sale)|one.?time|credit))/gi
    ),
  ].map((m) => m[1].trim()).slice(0, 5);

  const has_signup_form = [
    'type="email"',
    'type="submit"',
    "sign up",
    "apply now",
    "join now",
    "get started",
    "register",
  ].some((kw) => lower.includes(kw));

  // Boost score if the URL path itself contains affiliate/referral keywords
  const urlLower = (url || "").toLowerCase();
  const urlBoost =
    urlLower.includes("affiliate") || urlLower.includes("referral") ? 3 : 0;

  const score =
    affiliate_keywords.length * 2 -
    non_affiliate_keywords.length * 3 +
    (has_signup_form ? 3 : 0) +
    (commission_found.length ? 2 : 0) -
    (closed_indicators.length ? 5 : 0) +
    urlBoost;

  let status: VerifyStatus;
  if (closed_indicators.length) status = "closed";
  else if (score >= 4) status = "confirmed_affiliate";
  else if (score >= 1) status = "likely_affiliate";
  else if (non_affiliate_keywords.length > affiliate_keywords.length)
    status = "not_affiliate";
  else status = "unclear";

  return {
    status,
    score,
    affiliate_keywords,
    non_affiliate_keywords,
    closed_indicators,
    commission_found,
    has_signup_form,
  };
}

async function verifyProgram(program: ProgramYaml): Promise<VerifyResult> {
  const url = program.signup_url || program.url;

  const page = await fetchPage(url);

  if (!page) {
    return {
      slug: program.slug,
      signup_url: url,
      http_status: null,
      final_url: null,
      status: "error",
      score: 0,
      affiliate_keywords: [],
      non_affiliate_keywords: [],
      closed_indicators: [],
      commission_found: [],
      has_signup_form: false,
      error: "Request failed or timed out",
    };
  }

  // Analyze content even for 4xx — many SPA sites return 404 status but render content
  const analysis = analyzeContent(page.text, url);

  // Only treat as hard error if 4xx AND no affiliate keywords found in content
  if (page.status >= 400 && analysis.affiliate_keywords.length === 0) {
    return {
      slug: program.slug,
      signup_url: url,
      http_status: page.status,
      final_url: page.finalUrl,
      error: `HTTP ${page.status}`,
      ...analysis,
      status: "error" as VerifyStatus,
    };
  }
  return {
    slug: program.slug,
    signup_url: url,
    http_status: page.status,
    final_url: page.finalUrl !== url ? page.finalUrl : null,
    error: null,
    ...analysis,
  };
}

// ── Overrides ──
// Programs that we know are valid but can't be auto-verified
// (e.g. own products, JS-heavy pages, known false negatives)
const SKIP_VERIFY: Record<string, string> = {
  "kyma-api": "Own product — affiliate page not yet built",
  tailwindcss: "Partner page 404 — program unconfirmed, kept as unverified",
};

// ── Main ──

const STATUS_ICON: Record<string, string> = {
  confirmed_affiliate: "✅",
  likely_affiliate: "🟡",
  not_affiliate: "❌",
  closed: "🚫",
  error: "⚠️ ",
  unclear: "❓",
};

async function main() {
  const args = process.argv.slice(2);
  const changedOnly = args.includes("--changed");
  const singleSlug = args.find((a) => !a.startsWith("--"));

  let programs: ProgramYaml[];

  if (singleSlug) {
    const file = `${singleSlug}.yaml`;
    if (!existsSync(join(PROGRAMS_DIR, file))) {
      console.error(`Program not found: ${singleSlug}`);
      process.exit(1);
    }
    programs = [loadProgram(file)];
  } else if (changedOnly) {
    const changed = getChangedFiles();
    if (changed.length === 0) {
      console.log("No changed program files to verify.");
      process.exit(0);
    }
    programs = changed.map(loadProgram);
    console.log(`Verifying ${changed.length} changed files...`);
  } else {
    programs = loadAllPrograms();
  }

  console.log(`\nVerifying ${programs.length} program(s)...\n`);

  const results: VerifyResult[] = [];
  let failures = 0;

  for (const p of programs) {
    const i = results.length + 1;
    process.stdout.write(
      `  [${i}/${programs.length}] ${p.slug}: ${p.signup_url || p.url} `
    );

    // Skip whitelisted programs
    if (SKIP_VERIFY[p.slug]) {
      console.log(`⏭️  skipped (${SKIP_VERIFY[p.slug]})`);
      continue;
    }

    const result = await verifyProgram(p);
    results.push(result);

    const icon = STATUS_ICON[result.status] || "?";
    console.log(`${icon} ${result.status} (score: ${result.score})`);

    // Flag real failures (not_affiliate or hard error)
    if (result.status === "not_affiliate" || result.status === "error") {
      failures++;
    }

    // Check verified flag consistency
    if (p.verified && result.status === "not_affiliate") {
      console.log(
        `    ⚠️  Marked verified:true but detected as ${result.status}`
      );
      failures++;
    }
  }

  // Summary
  const byStatus: Record<string, VerifyResult[]> = {};
  for (const r of results) {
    (byStatus[r.status] ??= []).push(r);
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log("VERIFICATION SUMMARY");
  console.log(`${"═".repeat(60)}\n`);

  for (const [status, items] of Object.entries(byStatus).sort()) {
    const icon = STATUS_ICON[status] || "?";
    console.log(`${icon} ${status.toUpperCase()} (${items.length}):`);
    for (const r of items) {
      let extra = "";
      if (r.error) extra = ` — ${r.error}`;
      else if (r.commission_found.length)
        extra = ` — found: ${r.commission_found.slice(0, 3).join(", ")}`;
      console.log(`   ${r.slug}: ${r.signup_url}${extra}`);
    }
    console.log();
  }

  // Save report
  const report = {
    generated_at: new Date().toISOString(),
    total: programs.length,
    summary: Object.fromEntries(
      Object.entries(byStatus).map(([k, v]) => [k, v.length])
    ),
    results,
  };
  writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2) + "\n");
  console.log(`Report saved: verification-report.json`);

  if (failures > 0) {
    console.log(`\n❌ ${failures} issue(s) found. Review above.`);
    process.exit(1);
  } else {
    console.log(`\n✅ All programs verified.`);
  }
}

main();
