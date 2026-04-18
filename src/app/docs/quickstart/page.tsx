import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/code-block";

export const metadata: Metadata = {
  title: "Quick Start",
};

export default function QuickStartPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Quick Start</h1>
      <p className="text-sm text-muted-foreground mt-2 mb-10">
        The fastest way to start using OpenAffiliate. Pick the integration that
        fits your workflow.
      </p>

      <div className="space-y-10">
        {/* CLI */}
        <section>
          <h2 className="text-lg font-semibold mb-1">CLI</h2>
          <p className="text-sm text-muted-foreground mb-4">
            No install required. Run directly with{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-xs">npx</code>.
          </p>
          <div className="space-y-3">
            <CodeBlock
              label="terminal"
              code={`npx openaffiliate search "database"`}
            />
            <CodeBlock
              label="terminal"
              code={`npx openaffiliate info stripe`}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Append{" "}
            <code className="bg-muted px-1 py-0.5 rounded">--json</code> to any
            command for machine-readable output.{" "}
            <Link href="/docs/cli" className="text-foreground hover:underline">
              Full CLI reference →
            </Link>
          </p>
        </section>

        {/* MCP */}
        <section>
          <h2 className="text-lg font-semibold mb-1">MCP</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Add OpenAffiliate to any MCP-compatible AI client (Claude, ChatGPT,
            Cursor) with a single config block.
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
          <p className="text-xs text-muted-foreground mt-3">
            <Link href="/docs/mcp" className="text-foreground hover:underline">
              MCP server reference →
            </Link>
          </p>
        </section>

        {/* API */}
        <section>
          <h2 className="text-lg font-semibold mb-1">REST API</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Public JSON API. No authentication required.
          </p>
          <CodeBlock
            label="curl"
            code={`curl https://openaffiliate.dev/api/programs?q=database`}
          />
          <p className="text-xs text-muted-foreground mt-3">
            <Link href="/docs/api" className="text-foreground hover:underline">
              REST API reference →
            </Link>
          </p>
        </section>

        {/* Next steps */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Next steps</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { title: "CLI", desc: "All commands", href: "/docs/cli" },
              { title: "REST API", desc: "Endpoints", href: "/docs/api" },
              { title: "MCP Server", desc: "AI integration", href: "/docs/mcp" },
              {
                title: "TypeScript SDK",
                desc: "npm package",
                href: "/docs/sdk",
              },
            ].map((link) => (
              <Link
                key={link.title}
                href={link.href}
                className="rounded-lg border border-border/50 bg-muted/20 p-3 text-center hover:bg-muted/40 transition-colors"
              >
                <p className="text-xs font-semibold">{link.title}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {link.desc}
                </p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
