export default function DocsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Documentation</h1>
      <p className="text-sm text-muted-foreground mt-2">
        How to use OpenAffiliate as a developer, agent builder, or contributor.
      </p>

      <div className="mt-8 space-y-10">
        {/* CLI */}
        <section>
          <h2 className="text-lg font-semibold mb-4">CLI</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Search and manage affiliate programs from your terminal.
          </p>
          <div className="space-y-3">
            {[
              {
                cmd: 'npx openaffiliate search "email"',
                desc: "Search programs by keyword",
              },
              {
                cmd: "npx openaffiliate search --category Database",
                desc: "Filter by category",
              },
              {
                cmd: "npx openaffiliate search --min-commission 20 --type recurring",
                desc: "Filter by commission",
              },
              {
                cmd: "npx openaffiliate info stripe",
                desc: "Get program details",
              },
              {
                cmd: "npx openaffiliate add kyma-api",
                desc: "Add program to your project",
              },
            ].map((item) => (
              <div
                key={item.cmd}
                className="rounded-lg bg-zinc-950 border border-border/50 px-4 py-3"
              >
                <code className="text-xs font-mono text-emerald-400">
                  {item.cmd}
                </code>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* API */}
        <section>
          <h2 className="text-lg font-semibold mb-4">API</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Public JSON API. No authentication required.
          </p>
          <div className="space-y-3">
            {[
              {
                method: "GET",
                path: "/api/programs",
                desc: "List all programs (supports ?q=, ?category=, ?type=)",
              },
              {
                method: "GET",
                path: "/api/programs/[slug]",
                desc: "Get program details",
              },
              {
                method: "GET",
                path: "/api/categories",
                desc: "List all categories with counts",
              },
            ].map((item) => (
              <div
                key={item.path}
                className="rounded-lg bg-zinc-950 border border-border/50 px-4 py-3 flex items-start gap-3"
              >
                <span className="text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded mt-0.5">
                  {item.method}
                </span>
                <div>
                  <code className="text-xs font-mono">{item.path}</code>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* MCP */}
        <section>
          <h2 className="text-lg font-semibold mb-4">MCP Connector</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Connect AI agents to the registry via Model Context Protocol.
          </p>
          <div className="rounded-lg bg-zinc-950 border border-border/50 p-4">
            <p className="text-xs text-muted-foreground mb-2">
              Add to your MCP config:
            </p>
            <pre className="text-xs font-mono text-emerald-400/80 leading-relaxed">
              {`{
  "mcpServers": {
    "openaffiliate": {
      "url": "https://openaffiliate.dev/api/mcp"
    }
  }
}`}
            </pre>
          </div>
          <div className="mt-4">
            <p className="text-xs text-muted-foreground mb-2">
              Available tools:
            </p>
            <ul className="text-xs text-muted-foreground space-y-1.5">
              <li>
                <code className="bg-muted px-1.5 py-0.5 rounded text-emerald-400">
                  search_programs
                </code>{" "}
                — Search by query, category, commission type
              </li>
              <li>
                <code className="bg-muted px-1.5 py-0.5 rounded text-emerald-400">
                  get_program
                </code>{" "}
                — Get full program details including agent instructions
              </li>
              <li>
                <code className="bg-muted px-1.5 py-0.5 rounded text-emerald-400">
                  list_categories
                </code>{" "}
                — Browse available categories
              </li>
            </ul>
          </div>
        </section>

        {/* Contributing */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Contributing</h2>
          <p className="text-sm text-muted-foreground mb-4">
            OpenAffiliate is open source. Contributions welcome.
          </p>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="flex gap-3">
              <span className="text-xs font-mono text-muted-foreground/50 mt-0.5">
                01
              </span>
              <p>
                Fork{" "}
                <a
                  href="https://github.com/Affitor/open-affiliate"
                  className="text-foreground hover:underline"
                >
                  Affitor/open-affiliate
                </a>
              </p>
            </div>
            <div className="flex gap-3">
              <span className="text-xs font-mono text-muted-foreground/50 mt-0.5">
                02
              </span>
              <p>
                Add your program YAML to{" "}
                <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                  programs/
                </code>
              </p>
            </div>
            <div className="flex gap-3">
              <span className="text-xs font-mono text-muted-foreground/50 mt-0.5">
                03
              </span>
              <p>Open a pull request. CI validates the schema automatically.</p>
            </div>
            <div className="flex gap-3">
              <span className="text-xs font-mono text-muted-foreground/50 mt-0.5">
                04
              </span>
              <p>
                Community reviews. Merged programs appear on the site within
                minutes.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
