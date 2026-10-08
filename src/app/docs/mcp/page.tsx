import type { Metadata } from "next";
import { CodeBlock } from "@/components/code-block";
import { DocsHeader } from "@/components/docs-header";
import { DocsPagination } from "@/components/docs-pagination";

export const metadata: Metadata = {
  title: "MCP Server",
};

export default function MCPPage() {
  return (
    <div>
      <DocsHeader
        group="References"
        title="MCP Server"
        description="Connect AI agents to the registry via Model Context Protocol."
      />

      <div className="space-y-10">
        <section>
          <h2 id="http-transport" className="text-lg font-semibold mb-2">
            HTTP transport (recommended)
          </h2>
          <p className="text-base text-muted-foreground mb-3">
            Hosted at <code className="text-xs">https://openaffiliate.dev/mcp</code>.
            Public, read-only, no API key. One line in Claude Code:
          </p>
          <CodeBlock
            label="terminal"
            code={`claude mcp add --transport http openaffiliate https://openaffiliate.dev/mcp`}
          />
          <p className="text-base text-muted-foreground mt-3 mb-3">
            For Claude.ai, ChatGPT, and any other remote MCP client, the same
            endpoint as config:
          </p>
          <CodeBlock
            label="mcp config"
            code={`{
  "mcpServers": {
    "openaffiliate": {
      "url": "https://openaffiliate.dev/mcp"
    }
  }
}`}
          />
          <p className="text-xs text-muted-foreground mt-3">
            <code>/api/mcp</code> serves the same tools and keeps working — it
            is the path earlier clients were given.
          </p>
        </section>

        <section>
          <h2 id="stdio-transport" className="text-lg font-semibold mb-2">stdio transport</h2>
          <p className="text-base text-muted-foreground mb-3">
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
        </section>

        <section>
          <h2 id="available-tools" className="text-lg font-semibold mb-3">Available tools</h2>
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

        <section>
          <h2 id="markdown" className="text-lg font-semibold mb-2">
            Markdown, without MCP
          </h2>
          <p className="text-base text-muted-foreground mb-3">
            Append <code className="text-xs">.md</code> to any program,
            category or network URL for a clean markdown version an agent can
            fetch and cite directly:
          </p>
          <CodeBlock
            label="terminal"
            code={`curl https://openaffiliate.dev/programs/vercel.md
curl https://openaffiliate.dev/categories/ai.md
curl https://openaffiliate.dev/llms.txt`}
          />
        </section>
      </div>

      <DocsPagination currentPath="/docs/mcp" />
    </div>
  );
}
