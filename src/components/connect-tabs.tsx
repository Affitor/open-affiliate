"use client";

import { useState } from "react";
import { Copy, Check, Terminal, Bot, Code } from "lucide-react";

type Tab = "cli" | "ai-sdk" | "mcp";

interface ConnectTabsProps {
  slug: string;
  mcpHttp: string;
  mcpStdio: string;
}

const tabs: { value: Tab; label: string; icon: React.ReactNode }[] = [
  { value: "cli", label: "CLI", icon: <Terminal className="h-3 w-3" /> },
  { value: "ai-sdk", label: "AI SDK", icon: <Bot className="h-3 w-3" /> },
  { value: "mcp", label: "MCP Config", icon: <Code className="h-3 w-3" /> },
];

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      aria-label={copied ? "Copied" : "Copy to clipboard"}
      className="absolute top-2.5 right-2.5 p-1.5 rounded-md bg-muted/80 hover:bg-muted border border-border/50 transition-colors"
    >
      {copied ? (
        <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground" />
      )}
    </button>
  );
}

export function ConnectTabs({ slug, mcpHttp, mcpStdio }: ConnectTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("cli");

  const cliSnippet = `# Search programs
npx openaffiliate search "${slug}"

# Get full details
npx openaffiliate info ${slug} --json

# Add to project
npx openaffiliate add ${slug}`;

  const aiSdkSnippet = `import { createMCPClient } from "@ai-sdk/mcp";
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
  model: anthropic("claude-sonnet-4-20250514"),
  tools,
  prompt: "Get details for ${slug}",
});

await mcpClient.close();`;

  const mcpSnippet = `// HTTP (recommended)
${mcpHttp}

// stdio (local)
${mcpStdio}`;

  const snippets: Record<Tab, string> = {
    cli: cliSnippet,
    "ai-sdk": aiSdkSnippet,
    mcp: mcpSnippet,
  };

  return (
    <div className="rounded-xl border border-border/50 bg-card/50 overflow-hidden">
      <div className="flex items-center gap-1 p-1.5 border-b border-border/30 bg-muted/20">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <CopyBtn text={snippets[activeTab]} />
        <pre className="p-4 pr-12 overflow-x-auto text-xs font-mono leading-relaxed text-emerald-700 dark:text-emerald-400 bg-muted/30">
          <code>{snippets[activeTab]}</code>
        </pre>
      </div>
    </div>
  );
}
