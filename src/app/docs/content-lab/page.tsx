import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/code-block";
import { DocsHeader } from "@/components/docs-header";
import { DocsPagination } from "@/components/docs-pagination";

export const metadata: Metadata = {
  title: "Content Lab",
};

export default function ContentLabPage() {
  return (
    <div>
      <DocsHeader
        group="Guides"
        title="Content Lab"
        description="Generate high-converting affiliate content powered by AI. Reviews, top lists, how-to guides, and social packs from real program data."
      />

      <div className="space-y-10">
        {/* Overview */}
        <section>
          <h2 id="overview" className="text-lg font-semibold mb-1">Overview</h2>
          <p className="text-base text-muted-foreground mb-4">
            Content Lab turns OpenAffiliate registry data into ready-to-publish
            affiliate content. Select a program, pick a content type, and get a
            complete article generated from real commission rates, cookie
            durations, and program details.
          </p>
          <p className="text-base text-muted-foreground">
            Content is generated via{" "}
            <a
              href="https://kymaapi.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-2"
            >
              Kyma API
            </a>
            , an open-source LLM gateway. You bring your own API key - free
            credits on signup, no card required.
          </p>
        </section>

        {/* Content Types */}
        <section>
          <h2 id="content-types" className="text-lg font-semibold mb-1">Content Types</h2>
          <p className="text-base text-muted-foreground mb-4">
            Four content formats optimized for affiliate marketing:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="text-left py-2 pr-4 font-medium">Type</th>
                  <th className="text-left py-2 pr-4 font-medium">What it generates</th>
                  <th className="text-left py-2 font-medium">Best for</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b border-border/20">
                  <td className="py-2 pr-4 font-medium text-foreground">Top List</td>
                  <td className="py-2 pr-4">Ranked listicle with comparison table</td>
                  <td className="py-2">SEO blog posts, &quot;Best X tools&quot; articles</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="py-2 pr-4 font-medium text-foreground">How-to Guide</td>
                  <td className="py-2 pr-4">Step-by-step getting started guide</td>
                  <td className="py-2">Tutorial content, onboarding guides</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="py-2 pr-4 font-medium text-foreground">Product Review</td>
                  <td className="py-2 pr-4">Pros/cons review with verdict</td>
                  <td className="py-2">Review sites, comparison blogs</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-medium text-foreground">Social Pack</td>
                  <td className="py-2 pr-4">X thread, LinkedIn post, Reddit post, video script</td>
                  <td className="py-2">Social media promotion</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* How to Use */}
        <section>
          <h2 id="how-to-use" className="text-lg font-semibold mb-1">How to Use</h2>
          <div className="space-y-4 text-base text-muted-foreground">
            <div>
              <p className="font-medium text-foreground mb-1">1. Get a Kyma API key</p>
              <p>
                Sign up at{" "}
                <a
                  href="https://kymaapi.com/signup"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground underline underline-offset-2"
                >
                  kymaapi.com/signup
                </a>
                . You get free credits instantly - no credit card needed.
                Go to Dashboard and copy your API key (starts with{" "}
                <code className="bg-muted px-1 py-0.5 rounded text-xs">ky-</code>).
              </p>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">2. Select a program</p>
              <p>
                Search across 750+ affiliate programs in the registry. Type a
                name, category, or tag to find what you need.
              </p>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">3. Pick a content type</p>
              <p>
                Choose from Top List, How-to Guide, Product Review, or Social
                Pack. For Top Lists, you can add more programs to compare - or
                let the system auto-fill from the same category.
              </p>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">4. Paste your API key and generate</p>
              <p>
                Enter your Kyma API key in the input field and hit Generate.
                Content streams in real-time. Copy the markdown output and
                publish anywhere.
              </p>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section>
          <h2 id="how-it-works" className="text-lg font-semibold mb-1">How It Works</h2>
          <p className="text-base text-muted-foreground mb-4">
            Content Lab uses a 3-step pipeline:
          </p>
          <div className="space-y-3 text-base text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Registry</span> - Real
              program data (commission rates, cookie durations, categories,
              descriptions) is pulled from the OpenAffiliate registry. No data is
              fabricated.
            </p>
            <p>
              <span className="font-medium text-foreground">Structure</span> - A
              structured prompt is built with the program context, content type
              template, and writing guidelines. The prompt enforces factual
              accuracy - the AI can only use data from the registry.
            </p>
            <p>
              <span className="font-medium text-foreground">Generate</span> - The
              prompt is sent to Kyma API (using DeepSeek V3 for articles, Qwen
              3.6 Plus for social content). Output streams back in real-time as
              markdown.
            </p>
          </div>
        </section>

        {/* Build Your Own */}
        <section>
          <h2 id="build-your-own" className="text-lg font-semibold mb-1">Build Your Own</h2>
          <p className="text-base text-muted-foreground mb-4">
            Content Lab is built on two public APIs. You can build your own
            content tools using the same stack:
          </p>
          <div className="space-y-3">
            <CodeBlock
              label="Fetch program data"
              code={`curl https://openaffiliate.dev/api/programs/notion`}
            />
            <CodeBlock
              label="Generate content via Kyma API"
              code={`curl https://kymaapi.com/v1/chat/completions \\
  -H "Authorization: Bearer ky-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "deepseek-v3",
    "stream": true,
    "messages": [
      {"role": "system", "content": "You are an affiliate content expert."},
      {"role": "user", "content": "Write a review for Notion..."}
    ]
  }'`}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            See the{" "}
            <a
              href="https://docs.kymaapi.com/guides/use-cases/content-generation"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground hover:underline"
            >
              Kyma content generation guide
            </a>
            {" "}for advanced patterns (batch generation, structured output, prompt caching).
          </p>
        </section>

        {/* Tips */}
        <section>
          <h2 id="tips" className="text-lg font-semibold mb-1">Tips</h2>
          <ul className="list-disc pl-5 space-y-2 text-base text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Top Lists work best with 5-10 programs.</span>{" "}
              The auto-fill picks programs from the same category sorted by commission rate.
            </li>
            <li>
              <span className="font-medium text-foreground">Edit before publishing.</span>{" "}
              AI-generated content is a starting point. Add your personal experience,
              update pricing details, and verify affiliate links.
            </li>
            <li>
              <span className="font-medium text-foreground">Social Pack gives you 4 platforms at once.</span>{" "}
              Each piece is written in the native tone of that platform - no copy-paste between X and LinkedIn.
            </li>
            <li>
              <span className="font-medium text-foreground">Content is grounded in registry data.</span>{" "}
              Commission rates, cookie durations, and program details come from verified entries.
              The AI cannot fabricate statistics.
            </li>
          </ul>
        </section>
      </div>

      <DocsPagination currentHref="/docs/content-lab" />
    </div>
  );
}
