import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/code-block";

export const metadata: Metadata = {
  title: "Submit a Program",
};

export default function SubmitPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Submit a Program</h1>
      <p className="text-sm text-muted-foreground mt-2 mb-10">
        Three ways to add an affiliate program to the registry. Choose the path
        that fits you.
      </p>

      <div className="space-y-10">
        {/* Agent flow */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-mono bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded">
              PRIMARY
            </span>
            <h2 className="text-lg font-semibold">Agent flow</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Ask your AI agent to submit a program on your behalf. Add
            OpenAffiliate to your MCP config, then describe what you want to
            submit.
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
          <div className="mt-4 rounded-lg border border-border/40 bg-muted/10 p-4">
            <p className="text-xs text-muted-foreground mb-1 font-medium">
              Example prompt
            </p>
            <p className="text-sm text-foreground">
              &ldquo;Add the Notion affiliate program to OpenAffiliate&rdquo;
            </p>
          </div>
          <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
            The agent looks up the program details, creates a YAML file
            following the{" "}
            <Link
              href="/docs/yaml-schema"
              className="text-foreground hover:underline"
            >
              schema
            </Link>
            , and opens a pull request on GitHub. CI validates the file and
            verifies the signup URL automatically.
          </p>
        </section>

        {/* Human flow */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Web form</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Use the web form — no GitHub account needed. Fill in the program
            details and we generate the YAML and open a pre-filled GitHub PR on
            your behalf.
          </p>
          <Link
            href="/submit"
            className="inline-flex items-center rounded-lg border border-border/50 bg-muted/20 px-4 py-2 text-sm font-medium hover:bg-muted/40 transition-colors"
          >
            Open the submission form →
          </Link>
        </section>

        {/* Developer flow */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Developer flow</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Fork the repo, create a YAML file, and open a PR directly.
          </p>
          <div className="space-y-2 text-sm text-muted-foreground">
            {[
              {
                step: "01",
                content: (
                  <>
                    Fork{" "}
                    <a
                      href="https://github.com/Affitor/open-affiliate"
                      className="text-foreground hover:underline"
                    >
                      Affitor/open-affiliate
                    </a>{" "}
                    on GitHub
                  </>
                ),
              },
              {
                step: "02",
                content: (
                  <>
                    Create{" "}
                    <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                      programs/your-product.yaml
                    </code>{" "}
                    — see the{" "}
                    <Link
                      href="/docs/yaml-schema"
                      className="text-foreground hover:underline"
                    >
                      YAML Schema
                    </Link>{" "}
                    for format
                  </>
                ),
              },
              {
                step: "03",
                content: (
                  <>
                    Open a pull request. See{" "}
                    <Link
                      href="/docs/contributing"
                      className="text-foreground hover:underline"
                    >
                      Contributing
                    </Link>{" "}
                    for details
                  </>
                ),
              },
            ].map((item) => (
              <div key={item.step} className="flex gap-3">
                <span className="text-xs font-mono text-muted-foreground/50 mt-0.5">
                  {item.step}
                </span>
                <p>{item.content}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
