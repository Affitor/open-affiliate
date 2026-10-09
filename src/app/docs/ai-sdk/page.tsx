import type { Metadata } from "next";
import { CodeBlock } from "@/components/code-block";
import { DocsHeader } from "@/components/docs-header";
import { DocsPagination } from "@/components/docs-pagination";

export const metadata: Metadata = {
  title: "AI SDK",
};

export default function AISDKPage() {
  return (
    <div>
      <DocsHeader
        group="References"
        title="AI SDK"
        description="Use the Vercel AI SDK to build AI-powered affiliate tools."
      />

      <h2 id="usage" className="text-lg font-semibold mb-3">Usage</h2>

      <CodeBlock
        label="TypeScript"
        code={`import { createMCPClient } from "@ai-sdk/mcp";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

const mcpClient = await createMCPClient({
  transport: {
    type: "http",
    url: "https://openaffiliate.dev/mcp",
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

      <DocsPagination currentPath="/docs/ai-sdk" />
    </div>
  );
}
