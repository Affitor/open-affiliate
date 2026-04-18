import type { Metadata } from "next";
import { CodeBlock } from "@/components/code-block";

export const metadata: Metadata = {
  title: "TypeScript SDK",
};

export default function SDKPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">TypeScript SDK</h1>
      <p className="text-sm text-muted-foreground mt-2 mb-10">
        TypeScript SDK for direct programmatic access. Install via npm:
      </p>

      <div className="space-y-4">
        <CodeBlock label="install" code="npm install openaffiliate-sdk" />
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
      </div>
    </div>
  );
}
