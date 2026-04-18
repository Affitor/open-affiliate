import type { Metadata } from "next";
import { CodeBlock } from "@/components/code-block";

export const metadata: Metadata = {
  title: "AI SDK",
};

export default function AISDKPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">AI SDK</h1>
      <p className="text-sm text-muted-foreground mt-2 mb-10">
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
    </div>
  );
}
