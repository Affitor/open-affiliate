#!/usr/bin/env node

import { Command } from "commander";

const API_BASE = process.env.OPENAFFILIATE_API || "https://openaffiliate.dev";

interface ProgramSummary {
  slug: string;
  name: string;
  shortDescription: string;
  category: string;
  commission: { type: string; rate: string };
  cookieDays: number;
  verified: boolean;
  signupUrl?: string;
}

interface ProgramFull extends ProgramSummary {
  url: string;
  description: string;
  tags: string[];
  agentPrompt: string;
  agentKeywords?: string[];
  agentUseCases?: string[];
  approval?: string;
  approvalTime?: string;
  restrictions?: string[];
  commissionDuration?: string;
  payoutMethods?: string[];
  network?: string;
  programAge?: string;
  payout: { minimum: number; frequency: string };
}

async function fetchJSON(path: string) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

function table(rows: string[][], widths: number[]) {
  const header = rows[0]
    .map((h, i) => h.padEnd(widths[i]))
    .join("  ");
  const sep = widths.map((w) => "─".repeat(w)).join("──");
  const body = rows
    .slice(1)
    .map((row) => row.map((c, i) => c.padEnd(widths[i])).join("  "))
    .join("\n");
  return `\n  ${header}\n  ${sep}\n  ${body}\n`;
}

const program = new Command();

program
  .name("openaffiliate")
  .description("Search and manage affiliate programs from your terminal")
  .version("0.0.2")
  .option("--json", "Output raw JSON (for agents and scripts)");

program
  .command("search [query]")
  .description("Search affiliate programs")
  .option("-c, --category <cat>", "Filter by category")
  .option("-t, --type <type>", "Commission type: recurring, one-time")
  .option("--min-commission <n>", "Minimum commission rate", parseFloat)
  .option("--verified", "Show only verified programs")
  .action(async (query: string | undefined, opts) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (opts.category) params.set("category", opts.category);
    if (opts.type) params.set("type", opts.type);
    if (opts.verified) params.set("verified", "true");

    const data = await fetchJSON(`/api/programs?${params}`);
    let programs: ProgramSummary[] = data.programs;

    if (opts.minCommission) {
      programs = programs.filter(
        (p) => p.commission.rate >= opts.minCommission
      );
    }

    if (program.opts().json) {
      console.log(JSON.stringify(programs, null, 2));
      return;
    }

    if (programs.length === 0) {
      console.log("\n  No programs found.\n");
      return;
    }

    const rows = [
      ["Name", "Commission", "Cookie", "Category", "Verified"],
      ...programs.map((p) => [
        p.name,
        `${p.commission.rate} ${p.commission.type}`,
        `${p.cookieDays}d`,
        p.category,
        p.verified ? "✓" : "",
      ]),
    ];

    console.log(table(rows, [20, 18, 8, 18, 8]));
    console.log(`  ${programs.length} programs found\n`);
  });

program
  .command("info <slug>")
  .description("Get detailed program information")
  .action(async (slug: string) => {
    const data = await fetchJSON(`/api/programs/${slug}`);
    const p = data as ProgramFull;

    if (program.opts().json) {
      console.log(JSON.stringify(p, null, 2));
      return;
    }

    console.log(`
  ${p.name}${p.verified ? " ✓" : ""}
  ${p.shortDescription}
  ${"─".repeat(50)}

  Commission:  ${p.commission.rate}% ${p.commission.type}${p.commissionDuration ? ` (${p.commissionDuration})` : ""}
  Cookie:      ${p.cookieDays} days
  Payout:      $${p.payout.minimum} min / ${p.payout.frequency}
  ${p.payoutMethods ? `Methods:     ${p.payoutMethods.join(", ")}` : ""}
  ${p.approval ? `Approval:    ${p.approval}${p.approvalTime ? ` (${p.approvalTime})` : ""}` : ""}
  ${p.network ? `Network:     ${p.network}` : ""}
  URL:         ${p.url}
  ${p.signupUrl ? `Signup:      ${p.signupUrl}` : ""}

  Tags: ${p.tags.join(", ")}
  ${p.restrictions?.length ? `\n  Restrictions:\n${p.restrictions.map((r) => `    • ${r}`).join("\n")}` : ""}

  AGENTS.md:
  ${p.agentPrompt}
  ${p.agentUseCases?.length ? `\n  Use cases:\n${p.agentUseCases.map((u) => `    • ${u}`).join("\n")}` : ""}
`);
  });

program
  .command("categories")
  .description("List all program categories")
  .action(async () => {
    const data = await fetchJSON("/api/categories");

    if (program.opts().json) {
      console.log(JSON.stringify(data.categories, null, 2));
      return;
    }

    const rows = [
      ["Category", "Programs"],
      ...data.categories.map((c: { name: string; count: number }) => [
        c.name,
        c.count.toString(),
      ]),
    ];
    console.log(table(rows, [25, 10]));
  });

program
  .command("add <slug>")
  .description("Add a program to your project")
  .action(async (slug: string) => {
    const data = await fetchJSON(`/api/programs/${slug}`);
    const p = data as ProgramFull;

    const fs = await import("fs");
    const entry: Record<string, unknown> = {
      slug: p.slug,
      name: p.name,
      signup_url: p.signupUrl || p.url,
      url: p.url,
      commission: {
        type: p.commission.type,
        rate: p.commission.rate,
      },
      cookie_days: p.cookieDays,
      category: p.category || undefined,
      added_at: new Date().toISOString().split("T")[0],
    };

    // Remove undefined values
    Object.keys(entry).forEach((k) => entry[k] === undefined && delete entry[k]);

    const existing = fs.existsSync(".openaffiliate.json")
      ? JSON.parse(fs.readFileSync(".openaffiliate.json", "utf8"))
      : { programs: [] };

    if (existing.programs.some((ep: { slug: string }) => ep.slug === slug)) {
      console.log(`\n  ${p.name} is already in your project.\n`);
      return;
    }

    existing.programs.push(entry);
    fs.writeFileSync(
      ".openaffiliate.json",
      JSON.stringify(existing, null, 2) + "\n"
    );
    console.log(`\n  Added ${p.name} to .openaffiliate.json\n`);
  });

program
  .command("remove <slug>")
  .description("Remove a program from .openaffiliate.json")
  .action(async (slug: string) => {
    const fs = await import("fs");
    if (!fs.existsSync(".openaffiliate.json")) {
      console.log("\n  No .openaffiliate.json found.\n");
      return;
    }

    const existing = JSON.parse(fs.readFileSync(".openaffiliate.json", "utf8"));
    const before = existing.programs.length;
    existing.programs = existing.programs.filter(
      (p: { slug: string }) => p.slug !== slug
    );

    if (existing.programs.length === before) {
      console.log(`\n  ${slug} not found in .openaffiliate.json\n`);
      return;
    }

    fs.writeFileSync(
      ".openaffiliate.json",
      JSON.stringify(existing, null, 2) + "\n"
    );
    console.log(`\n  Removed ${slug} from .openaffiliate.json\n`);
  });

program
  .command("list")
  .description("List programs in .openaffiliate.json")
  .action(async () => {
    const fs = await import("fs");
    if (!fs.existsSync(".openaffiliate.json")) {
      console.log("\n  No .openaffiliate.json found. Run: openaffiliate add <slug>\n");
      return;
    }

    const existing = JSON.parse(fs.readFileSync(".openaffiliate.json", "utf8"));

    if (program.opts().json) {
      console.log(JSON.stringify(existing, null, 2));
      return;
    }

    if (!existing.programs?.length) {
      console.log("\n  No programs in .openaffiliate.json\n");
      return;
    }

    const rows = [
      ["Name", "Commission", "Cookie", "Added"],
      ...existing.programs.map((p: Record<string, unknown>) => [
        (p.name as string) || (p.slug as string),
        p.commission
          ? typeof p.commission === "string"
            ? p.commission
            : `${(p.commission as Record<string, unknown>).rate} ${(p.commission as Record<string, unknown>).type}`
          : "",
        p.cookie_days ? `${p.cookie_days}d` : "",
        (p.added_at as string) || "",
      ]),
    ];

    console.log(table(rows, [20, 18, 8, 12]));
  });

program.parse();
