import type { Metadata } from "next";
import { CodeBlock } from "@/components/code-block";
import { DocsHeader } from "@/components/docs-header";
import { DocsPagination } from "@/components/docs-pagination";

export const metadata: Metadata = {
  title: "YAML Schema",
};

export default function YAMLSchemaPage() {
  return (
    <div>
      <DocsHeader
        group="References"
        title="YAML Schema"
        description="The structure of a program entry in the registry."
      />

      <h2 id="schema" className="text-lg font-semibold mb-3">Schema</h2>

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
  conditions: "Paid 30 days after the customer's first payment"

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

      <DocsPagination currentPath="/docs/yaml-schema" />
    </div>
  );
}
