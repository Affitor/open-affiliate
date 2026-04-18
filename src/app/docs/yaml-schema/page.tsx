import type { Metadata } from "next";
import { CodeBlock } from "@/components/code-block";

export const metadata: Metadata = {
  title: "YAML Schema",
};

export default function YAMLSchemaPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">YAML Schema</h1>
      <p className="text-sm text-muted-foreground mt-2 mb-10">
        Every program is a YAML file in{" "}
        <code className="bg-muted px-1 py-0.5 rounded text-xs">programs/</code>
        . Key fields:
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
    </div>
  );
}
