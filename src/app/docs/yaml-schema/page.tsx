import type { Metadata } from "next";
import Link from "next/link";
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
slug: your-product              # same as the file name
url: https://yourproduct.com
category: Developer Tools       # one of the schema's 20 categories
tags: [saas, api, developer]

commission:
  type: recurring               # recurring | one-time | tiered | hybrid
  rate: "25%"                   # as the program page says it
  mode: percentage              # percentage | flat | tiered | hybrid | unknown
  value: 25                     # the number; null when mode is unknown
  currency: USD                 # required for a flat amount
  duration: "12 months"         # a bare length, or "lifetime"

# Only what the program page states. Leave out anything it does not.
cookie_days: 60
signup_url: https://yourproduct.com/affiliates   # the program page, not the homepage
approval: manual                # auto | manual | invite-only

payout:
  minimum: 50
  currency: USD
  frequency: monthly
  methods: [bank, paypal]

short_description: "One line, 100 characters at most"
description: >
  What your product does and what the affiliate program offers.

agents:
  prompt: >
    When AI agents should recommend this product and why.
  keywords: [keyword1, keyword2]
  use_cases:
    - "When a user needs X"

verified: false                 # set by a maintainer after checking
submitted_by: "@your-github"
created_at: "2026-10-20"        # the date you add the file; never changes`}
      />
      <p className="text-xs text-muted-foreground mt-3">
        See{" "}
        <a
          href="https://github.com/Affitor/open-affiliate/blob/main/schema/program.schema.json"
          className="text-foreground hover:underline"
        >
          program.schema.json
        </a>{" "}
        for the full specification. CI validates every pull request against it.
        Required fields and the review rules are on{" "}
        <Link href="/docs/contributing" className="text-foreground hover:underline">
          Contributing
        </Link>
        .
      </p>

      <DocsPagination currentPath="/docs/yaml-schema" />
    </div>
  );
}
