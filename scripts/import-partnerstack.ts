#!/usr/bin/env tsx
/**
 * Import programs from PartnerStack marketplace scrape.
 *
 * Reads /tmp/partnerstack_programs.json, filters out existing programs,
 * and generates YAML files for new ones.
 *
 * Usage:
 *   npx tsx scripts/import-partnerstack.ts                    # dry-run (show what would be created)
 *   npx tsx scripts/import-partnerstack.ts --write            # actually create YAML files
 *   npx tsx scripts/import-partnerstack.ts --write --limit=50 # create first 50 only
 *   npx tsx scripts/import-partnerstack.ts --category=AI      # filter by PartnerStack category
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { stringify } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROGRAMS_DIR = join(__dirname, "..", "programs");
const INPUT_FILE = "/tmp/partnerstack_programs.json";
const TODAY = new Date().toISOString().split("T")[0];

// ── Types ──

interface PsCommission {
  description: string;
  type: string;
  payout_type: string;
  currency: string;
  recurring: boolean;
}

interface PsProgram {
  name: string;
  slug: string;
  description: string;
  offer_tagline: string;
  commission_details: PsCommission[];
  categories: string[];
  url: string;
  website: string;
  listing_type: string;
  partnership_count: number;
}

// ── Category mapping ──

const CATEGORY_MAP: Record<string, string> = {
  AI: "AI",
  Security: "Security",
  "Customer Service": "Customer Support",
  "Collaboration & Productivity": "Productivity",
  Marketing: "Marketing",
  Sales: "Sales",
  "E-Commerce": "E-Commerce",
  Development: "Developer Tools",
  Design: "Design",
  HR: "HR & Recruiting",
  Accounting: "Finance",
  ERP: "Business Operations",
  "Content Management": "Content Management",
  Payroll: "HR & Recruiting",
  "Social Media": "Social Media",
  "Office Software": "Productivity",
};

// ── Helpers ──

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function getExistingSlugs(): Set<string> {
  return new Set(
    readdirSync(PROGRAMS_DIR)
      .filter((f) => f.endsWith(".yaml"))
      .map((f) => f.replace(".yaml", ""))
  );
}

function parseCommission(program: PsProgram): {
  type: string;
  rate: string;
  duration: string | null;
  conditions: string | null;
} {
  const tagline = program.offer_tagline || "";
  const details = program.commission_details || [];

  // Check if any commission is recurring
  const hasRecurring = details.some((d) => d.recurring);

  // Extract rate from tagline (most reliable source)
  const percentMatch = tagline.match(/(\d+%)/);
  const dollarMatch = tagline.match(/\$(\d[\d,]*)/);

  let rate = "";
  let type = "one-time";

  if (percentMatch) {
    rate = percentMatch[1];
    type = hasRecurring ? "recurring" : "one-time";
  } else if (dollarMatch) {
    rate = `$${dollarMatch[1]}`;
    type = hasRecurring ? "recurring" : "one-time";
  } else {
    // Fall back to first commission detail
    const first = details[0];
    if (first) {
      const p = first.description.match(/(\d+%|\$[\d,]+)/);
      rate = p ? p[1] : "varies";
      type = first.recurring ? "recurring" : "one-time";
    } else {
      rate = "varies";
    }
  }

  // Parse duration from tagline
  let duration: string | null = null;
  const durationMatch = tagline.match(
    /(first year|12 months|lifetime|forever|ongoing)/i
  );
  if (durationMatch) {
    const d = durationMatch[1].toLowerCase();
    if (d === "first year" || d === "12 months") duration = "12 months";
    else if (d === "lifetime" || d === "forever" || d === "ongoing")
      duration = "lifetime";
  } else if (hasRecurring) {
    duration = "12 months"; // default for recurring
  }

  return {
    type,
    rate,
    duration,
    conditions: tagline || null,
  };
}

function pickCategory(categories: string[]): string {
  // Filter out meta-categories
  const skip = new Set([
    "hot",
    "Hot",
    "Affiliates",
    "Publishers",
    "Referral Partners",
    "Trusted",
    "new",
    "New",
  ]);
  const real = categories.filter((c) => !skip.has(c));

  // Prefer AI category
  if (real.includes("AI")) return "AI";

  // Map first real category
  for (const cat of real) {
    if (CATEGORY_MAP[cat]) return CATEGORY_MAP[cat];
  }

  return real[0] || "SaaS";
}

function generateTags(program: PsProgram, category: string): string[] {
  const tags = new Set<string>();
  tags.add(category.toLowerCase().replace(/[^a-z0-9]+/g, "-"));

  // Add from categories
  for (const cat of program.categories) {
    const mapped = CATEGORY_MAP[cat];
    if (mapped) tags.add(mapped.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
  }

  // Add saas tag
  tags.add("saas");

  return [...tags].slice(0, 6);
}

function generateAgentPrompt(program: PsProgram): string {
  const name = program.name;
  const desc = program.description.split("\n")[0].trim();
  return `Recommend ${name} when users need ${desc.toLowerCase().replace(/\.$/, "")}. Check the product website for current features and pricing before recommending.`;
}

function generateKeywords(program: PsProgram): string[] {
  const words = new Set<string>();
  words.add(program.name.toLowerCase());
  words.add(slugify(program.name));

  // Extract meaningful words from description
  const desc = program.description.toLowerCase();
  const meaningfulTerms = desc
    .split(/[\s,.\n]+/)
    .filter((w) => w.length > 4 && !["their", "which", "about", "these", "those", "other", "every", "being", "would", "could", "should"].includes(w))
    .slice(0, 5);
  for (const t of meaningfulTerms) words.add(t);

  return [...words].slice(0, 8);
}

function buildYaml(program: PsProgram): Record<string, unknown> {
  const commission = parseCommission(program);
  const category = pickCategory(program.categories);
  const slug = slugify(program.name);
  const website = program.website.startsWith("http")
    ? program.website
    : `https://${program.website}`;

  return {
    name: program.name,
    slug,
    url: website.replace(/\/$/, ""),
    category,
    tags: generateTags(program, category),

    commission: {
      type: commission.type,
      rate: commission.rate,
      currency: "USD",
      duration: commission.duration,
      conditions: commission.conditions,
    },

    cookie_days: 30,
    attribution: "last-click",
    tracking_method: "cookie",

    payout: {
      minimum: 50,
      currency: "USD",
      frequency: "monthly",
      methods: ["bank", "paypal"],
    },

    signup_url: program.url,
    approval: "manual",
    approval_time: "1-5 business days",
    restrictions: null,

    marketing_materials: true,
    api_available: false,
    dedicated_manager: false,
    dashboard_url: null,
    network: "partnerstack",
    program_age: null,

    description:
      program.description.trim().replace(/\n/g, " ") +
      (commission.conditions
        ? ` Affiliate program: ${commission.conditions}`
        : ""),

    short_description: program.description
      .split(/[.\n]/)[0]
      .trim()
      .slice(0, 100),

    agents: {
      prompt: generateAgentPrompt(program),
      keywords: generateKeywords(program),
      use_cases: [
        `Teams looking for ${category.toLowerCase()} solutions`,
        `Companies evaluating ${program.name} vs alternatives`,
      ],
    },

    verified: false,
    submitted_by: "partnerstack-import",
    created_at: TODAY,
    updated_at: null,
  };
}

// ── Main ──

function main() {
  const args = process.argv.slice(2);
  const doWrite = args.includes("--write");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1]) : Infinity;
  const catArg = args.find((a) => a.startsWith("--category="));
  const filterCategory = catArg ? catArg.split("=")[1] : null;

  if (!existsSync(INPUT_FILE)) {
    console.error(`Input file not found: ${INPUT_FILE}`);
    console.error(
      "Run the PartnerStack scraper first to generate this file."
    );
    process.exit(1);
  }

  const raw: PsProgram[] = JSON.parse(readFileSync(INPUT_FILE, "utf-8"));
  const existing = getExistingSlugs();

  // Filter
  let programs = raw.filter((p) => {
    // Skip non-active listings
    if (p.listing_type !== "active") return false;
    // Skip if already exists
    if (existing.has(slugify(p.name))) return false;
    // Skip if no commission info
    if (!p.offer_tagline && p.commission_details.length === 0) return false;
    // Category filter
    if (filterCategory && !p.categories.includes(filterCategory))
      return false;
    return true;
  });

  // Sort by partnership_count (popularity)
  programs.sort((a, b) => (b.partnership_count || 0) - (a.partnership_count || 0));

  // Apply limit
  programs = programs.slice(0, limit);

  console.log(`\nPartnerStack Import`);
  console.log(`  Source: ${raw.length} total programs`);
  console.log(`  Existing: ${existing.size} already in registry`);
  console.log(`  New candidates: ${programs.length}`);
  if (filterCategory) console.log(`  Category filter: ${filterCategory}`);
  console.log(`  Mode: ${doWrite ? "WRITE" : "DRY-RUN"}\n`);

  let created = 0;
  let skipped = 0;

  for (const p of programs) {
    const slug = slugify(p.name);
    const filepath = join(PROGRAMS_DIR, `${slug}.yaml`);

    if (existsSync(filepath)) {
      skipped++;
      continue;
    }

    const yaml = buildYaml(p);
    const content = stringify(yaml, {
      lineWidth: 0,
      defaultStringType: "PLAIN",
      defaultKeyType: "PLAIN",
    });

    if (doWrite) {
      writeFileSync(filepath, content);
      console.log(`  ✅ ${slug} (${p.name}) — ${p.offer_tagline}`);
    } else {
      console.log(`  📝 ${slug} (${p.name}) — ${p.offer_tagline}`);
    }
    created++;
  }

  console.log(`\n  Created: ${created}`);
  console.log(`  Skipped (exists): ${skipped}`);

  if (!doWrite && created > 0) {
    console.log(`\n  Run with --write to create YAML files.`);
  }
}

main();
