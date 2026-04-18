import type { Metadata } from "next";
import Link from "next/link";
import { TrackPageView } from "@/components/track-page-view";
import { CopyButton } from "@/components/copy-button";

export const metadata: Metadata = {
  title: "Documentation — OpenAffiliate",
  description:
    "Learn how to use the OpenAffiliate CLI, REST API, MCP server, and SDK to search and integrate affiliate programs.",
  openGraph: {
    title: "Documentation — OpenAffiliate",
    description:
      "CLI, API, MCP, and SDK documentation for the open affiliate program registry.",
    url: "https://openaffiliate.dev/docs",
    siteName: "OpenAffiliate",
  },
};

function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="rounded-lg bg-muted/60 dark:bg-zinc-950 border border-border/50 overflow-hidden">
      {label && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 bg-muted/30">
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wide">
            {label}
          </span>
          <CopyButton text={code} />
        </div>
      )}
      <pre className="p-4 overflow-x-auto text-xs font-mono text-emerald-700 dark:text-emerald-400 leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function SectionNav() {
  const sections = [
    { id: "features", label: "Features" },
    { id: "cli", label: "CLI" },
    { id: "api", label: "API" },
    { id: "mcp", label: "MCP" },
    { id: "ai-sdk", label: "AI SDK" },
    { id: "sdk", label: "SDK" },
    { id: "yaml", label: "YAML Schema" },
    { id: "contributing", label: "Contributing" },
  ];

  return (
    <nav className="flex flex-wrap gap-2 mb-10 pb-6 border-b border-border/30">
      {sections.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          className="rounded-md border border-border/50 bg-muted/20 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <TrackPageView />
      <h1 className="text-2xl font-bold tracking-tight">Documentation</h1>
      <p className="text-sm text-muted-foreground mt-2 mb-8">
        How to use OpenAffiliate as a developer, agent builder, or contributor.
      </p>

      <SectionNav />

      <div className="space-y-12">
        {/* Features */}
        <section id="features">
          <h2 className="text-lg font-semibold mb-2">Features</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Everything OpenAffiliate offers for partners, developers, and AI
            agents.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                title: "Search & Filter",
                desc: "Full-text search across 349+ programs. Filter by category, commission type, min rate, verified status.",
                href: "/programs",
              },
              {
                title: "Rankings",
                desc: "Affiliate Score algorithm ranks by commission, cookie duration, recurring potential, and verification. Sort by programs, networks, or categories.",
                href: "/rankings",
              },
              {
                title: "Community Voting",
                desc: "Upvote programs you have success with. Votes stored in Supabase, displayed alongside scores.",
                href: "/rankings",
              },
              {
                title: "Compare",
                desc: "Side-by-side comparison of up to 4 programs. Compare commission, cookie, payout, approval, and more.",
                href: "/compare",
              },
              {
                title: "Program Detail",
                desc: "Full breakdown: commission card, program info, restrictions, AGENTS.md instructions, integration snippets.",
                href: "/programs/vercel",
              },
              {
                title: "Connect Tabs",
                desc: "Each program page has ready-to-copy code for CLI, AI SDK, and MCP Config integration.",
                href: "/programs/stripe",
              },
              {
                title: "Badge Embed",
                desc: "SVG badges for your README. Copy the Markdown snippet from any program page.",
                href: "/programs/supabase",
              },
              {
                title: "Submit",
                desc: "Web form to submit new programs without touching YAML files directly.",
                href: "/submit",
              },
            ].map((f) => (
              <Link
                key={f.title}
                href={f.href}
                className="rounded-lg border border-border/50 bg-muted/20 p-4 hover:bg-muted/40 transition-colors group"
              >
                <h3 className="text-sm font-semibold group-hover:text-foreground">
                  {f.title}
                </h3>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                  {f.desc}
                </p>
              </Link>
            ))}
          </div>

          <h3 className="text-sm font-semibold mt-6 mb-3">
            Integration options
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "CLI", desc: "npx openaffiliate", href: "#cli" },
              { label: "REST API", desc: "Public, no auth", href: "#api" },
              { label: "MCP Server", desc: "HTTP + stdio", href: "#mcp" },
              { label: "SDK", desc: "TypeScript", href: "#sdk" },
            ].map((i) => (
              <a
                key={i.label}
                href={i.href}
                className="rounded-lg border border-border/50 bg-muted/20 p-3 text-center hover:bg-muted/40 transition-colors"
              >
                <p className="text-xs font-semibold">{i.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {i.desc}
                </p>
              </a>
            ))}
          </div>
        </section>

        {/* CLI */}
        <section id="cli">
          <h2 className="text-lg font-semibold mb-2">CLI</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Search and manage affiliate programs from your terminal. No install
            required.
          </p>
          <div className="space-y-3">
            {[
              {
                cmd: 'npx openaffiliate search "email"',
                desc: "Search programs by keyword",
              },
              {
                cmd: "npx openaffiliate search --category Database --type recurring",
                desc: "Filter by category and commission type",
              },
              {
                cmd: "npx openaffiliate search --min-commission 20 --json",
                desc: "Filter by commission, output as JSON",
              },
              {
                cmd: "npx openaffiliate info stripe",
                desc: "Get full program details",
              },
              {
                cmd: "npx openaffiliate info stripe --json",
                desc: "Get details as JSON (for scripting)",
              },
              {
                cmd: "npx openaffiliate categories",
                desc: "List all categories with program counts",
              },
              {
                cmd: "npx openaffiliate add supabase",
                desc: "Add program to your .openaffiliate.json",
              },
            ].map((item) => (
              <div
                key={item.cmd}
                className="rounded-lg bg-muted/60 dark:bg-zinc-950 border border-border/50 px-4 py-3 overflow-x-auto"
              >
                <code className="text-xs font-mono text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                  {item.cmd}
                </code>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Tip: Use <code className="bg-muted px-1 py-0.5 rounded">--json</code> on
            any command to get machine-readable output for piping into other tools.
          </p>
        </section>

        {/* API */}
        <section id="api">
          <h2 className="text-lg font-semibold mb-2">API</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Public JSON API. No authentication required. Base URL:{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
              https://openaffiliate.dev
            </code>
          </p>

          <h3 className="text-sm font-semibold mb-3 mt-6">Endpoints</h3>
          <div className="space-y-3">
            {[
              {
                method: "GET",
                path: "/api/programs",
                desc: "List all programs",
                params: "?q=, ?category=, ?type=, ?verified=",
              },
              {
                method: "GET",
                path: "/api/programs/{slug}",
                desc: "Get program details by slug",
                params: null,
              },
              {
                method: "GET",
                path: "/api/categories",
                desc: "List all categories with program counts",
                params: null,
              },
            ].map((item) => (
              <div
                key={item.path}
                className="rounded-lg bg-muted/60 dark:bg-zinc-950 border border-border/50 px-4 py-3 flex items-start gap-3 overflow-x-auto"
              >
                <span className="text-[10px] font-mono font-bold bg-emerald-600/10 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded mt-0.5 shrink-0">
                  {item.method}
                </span>
                <div className="min-w-0">
                  <code className="text-xs font-mono whitespace-nowrap">
                    {item.path}
                  </code>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {item.desc}
                    {item.params && (
                      <span className="text-muted-foreground/60">
                        {" "}
                        ({item.params})
                      </span>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <h3 className="text-sm font-semibold mb-3 mt-6">Example</h3>
          <CodeBlock
            label="curl"
            code={`curl "https://openaffiliate.dev/api/programs?q=database&type=recurring&verified=true"

# Response
[
  {
    "slug": "supabase",
    "name": "Supabase",
    "commission": { "type": "recurring", "rate": "10%" },
    "cookieDays": 60,
    "category": "Database",
    "verified": true,
    ...
  }
]`}
          />
        </section>

        {/* MCP */}
        <section id="mcp">
          <h2 className="text-lg font-semibold mb-2">MCP Server</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Connect AI agents to the registry via Model Context Protocol. Works
            with Claude, ChatGPT, Cursor, and any MCP-compatible client.
          </p>

          <h3 className="text-sm font-semibold mb-3">
            HTTP transport (recommended)
          </h3>
          <p className="text-xs text-muted-foreground mb-2">
            For Claude.ai, ChatGPT, and remote MCP clients:
          </p>
          <CodeBlock
            label="mcp config"
            code={`{
  "mcpServers": {
    "openaffiliate": {
      "url": "https://openaffiliate.dev/api/mcp"
    }
  }
}`}
          />

          <h3 className="text-sm font-semibold mb-3 mt-6">stdio transport</h3>
          <p className="text-xs text-muted-foreground mb-2">
            For Claude Code, Cursor, and local tools:
          </p>
          <CodeBlock
            label="mcp config"
            code={`{
  "mcpServers": {
    "openaffiliate": {
      "command": "npx",
      "args": ["-y", "openaffiliate-mcp"]
    }
  }
}`}
          />

          <h3 className="text-sm font-semibold mb-3 mt-6">Available tools</h3>
          <div className="space-y-2">
            {[
              {
                name: "search_programs",
                desc: "Search by query, category, commission type, verified status",
              },
              {
                name: "get_program",
                desc: "Get full program details including agent instructions, restrictions, signup URL",
              },
              {
                name: "list_categories",
                desc: "List all categories with program counts",
              },
            ].map((tool) => (
              <div key={tool.name} className="flex items-start gap-3 text-xs">
                <code className="bg-muted px-1.5 py-0.5 rounded text-emerald-700 dark:text-emerald-400 shrink-0">
                  {tool.name}
                </code>
                <span className="text-muted-foreground">{tool.desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* AI SDK */}
        <section id="ai-sdk">
          <h2 className="text-lg font-semibold mb-2">AI SDK</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Use the{" "}
            <a
              href="https://sdk.vercel.ai"
              className="text-foreground hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Vercel AI SDK
            </a>{" "}
            to connect your AI application to OpenAffiliate via MCP.
          </p>
          <CodeBlock
            label="TypeScript"
            code={`import { createMCPClient } from "@ai-sdk/mcp";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

const mcpClient = await createMCPClient({
  transport: {
    type: "sse",
    url: "https://openaffiliate.dev/api/mcp",
  },
});
const tools = await mcpClient.tools();

const { text } = await generateText({
  model: anthropic("claude-sonnet-4.6"),
  tools,
  prompt: "Find recurring affiliate programs for databases",
});

await mcpClient.close();`}
          />
        </section>

        {/* SDK */}
        <section id="sdk">
          <h2 className="text-lg font-semibold mb-2">SDK</h2>
          <p className="text-sm text-muted-foreground mb-4">
            TypeScript SDK for direct programmatic access. Install via npm:
          </p>
          <CodeBlock label="install" code="npm install openaffiliate-sdk" />
          <div className="mt-4" />
          <CodeBlock
            label="TypeScript"
            code={`import { searchPrograms, getProgram } from "openaffiliate-sdk";

// Search with filters
const results = await searchPrograms("email", {
  commission_type: "recurring",
  category: "Email Marketing",
});

// Get a specific program
const stripe = await getProgram("stripe");
console.log(stripe.commission.rate); // "25%"
console.log(stripe.agentPrompt);     // When to recommend`}
          />
        </section>

        {/* YAML Schema */}
        <section id="yaml">
          <h2 className="text-lg font-semibold mb-2">YAML Schema</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Every program is a YAML file in{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-xs">programs/</code>.
            Key fields:
          </p>
          <CodeBlock
            label="programs/your-product.yaml"
            code={`name: Your Product
slug: your-product
url: https://yourproduct.com
category: Developer Tools
tags: [saas, api, developer]

commission:
  type: recurring          # recurring | one-time | tiered | hybrid
  rate: "25%"
  currency: USD
  duration: "12 months"

cookie_days: 30
signup_url: https://yourproduct.com/affiliates
approval: auto             # auto | manual | invite-only
approval_time: "instant"

payout:
  minimum: 50
  currency: USD
  frequency: monthly
  methods: [bank, paypal, crypto]

description: >
  What your product does and what the affiliate program offers.
short_description: "One-line description for search results"

agents:
  prompt: >
    When AI agents should recommend this product and why.
  keywords: [keyword1, keyword2]
  use_cases:
    - "When a user needs X"
    - "Replacing Y with a better alternative"

verified: false
submitted_by: "@your-github"`}
          />
          <p className="text-xs text-muted-foreground mt-3">
            See{" "}
            <a
              href="https://github.com/Affitor/open-affiliate/blob/main/schema/program.schema.json"
              className="text-foreground hover:underline"
            >
              program.schema.json
            </a>{" "}
            for the full specification. CI validates every PR against this schema.
          </p>
        </section>

        {/* Contributing */}
        <section id="contributing">
          <h2 className="text-lg font-semibold mb-2">Contributing</h2>
          <p className="text-sm text-muted-foreground mb-4">
            OpenAffiliate is open source. All contributions welcome.
          </p>
          <div className="space-y-3 text-sm text-muted-foreground">
            {[
              {
                step: "01",
                content: (
                  <>
                    Fork{" "}
                    <a
                      href="https://github.com/Affitor/open-affiliate"
                      className="text-foreground hover:underline"
                    >
                      Affitor/open-affiliate
                    </a>
                  </>
                ),
              },
              {
                step: "02",
                content: (
                  <>
                    Create a YAML file in{" "}
                    <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                      programs/your-product.yaml
                    </code>
                  </>
                ),
              },
              {
                step: "03",
                content:
                  "Open a pull request. CI validates the schema and verifies your signup URL automatically.",
              },
              {
                step: "04",
                content:
                  "Community reviews and merges. Your program appears on the site within minutes.",
              },
            ].map((item) => (
              <div key={item.step} className="flex gap-3">
                <span className="text-xs font-mono text-muted-foreground/50 mt-0.5">
                  {item.step}
                </span>
                <p>{item.content}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-lg border border-border/40 bg-muted/10 p-4">
            <p className="text-xs text-muted-foreground">
              Or submit via the web:{" "}
              <Link href="/submit" className="text-foreground hover:underline">
                openaffiliate.dev/submit
              </Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
