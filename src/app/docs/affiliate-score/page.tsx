import type { Metadata } from "next";
import { DocsHeader } from "@/components/docs-header";
import { DocsPagination } from "@/components/docs-pagination";
import { CodeBlock } from "@/components/code-block";

export const metadata: Metadata = {
  title: "Affiliate Score",
  description:
    "How the Affiliate Score algorithm ranks programs from 0 to 100.",
};

export default function AffiliateScorePage() {
  return (
    <div>
      <DocsHeader
        group="References"
        title="Affiliate Score"
        description="How the Affiliate Score algorithm ranks programs from 0 to 100."
      />

      <div className="space-y-10">
        {/* Overview */}
        <section>
          <h2 id="overview" className="text-lg font-semibold mb-3">
            Overview
          </h2>
          <p className="text-base text-muted-foreground leading-relaxed">
            The Affiliate Score is a composite metric (0-100) that ranks
            affiliate programs based on their value to affiliates. It is used
            across rankings, recommendations, and comparisons.
          </p>
        </section>

        {/* Score Components */}
        <section>
          <h2 id="score-components" className="text-lg font-semibold mb-3">
            Score Components
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-border/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30 bg-muted/30">
                  <th className="text-left px-4 py-2.5 font-semibold">Component</th>
                  <th className="text-center px-4 py-2.5 font-semibold">Max</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Description</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2.5 font-medium text-foreground">Commission Value</td>
                  <td className="px-4 py-2.5 text-center">40</td>
                  <td className="px-4 py-2.5">How much affiliates earn per conversion</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2.5 font-medium text-foreground">Cookie Duration</td>
                  <td className="px-4 py-2.5 text-center">15</td>
                  <td className="px-4 py-2.5">How long the tracking cookie lasts</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2.5 font-medium text-foreground">Type + Duration</td>
                  <td className="px-4 py-2.5 text-center">25</td>
                  <td className="px-4 py-2.5">Recurring programs score higher, especially lifetime</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2.5 font-medium text-foreground">Verified</td>
                  <td className="px-4 py-2.5 text-center">10</td>
                  <td className="px-4 py-2.5">Community-verified accuracy bonus</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-medium text-foreground">Completeness</td>
                  <td className="px-4 py-2.5 text-center">10</td>
                  <td className="px-4 py-2.5">Programs with full data rank higher</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Commission Value */}
        <section>
          <h2 id="commission-value" className="text-lg font-semibold mb-3">
            Commission Value (40 pts)
          </h2>
          <p className="text-base text-muted-foreground leading-relaxed mb-4">
            Scoring depends on commission structure:
          </p>

          <h3 id="percentage-based" className="text-base font-semibold mb-2">Percentage-based</h3>
          <CodeBlock code="score = min(rate / 50, 1) * 40" label="formula" />
          <ul className="mt-3 space-y-1 text-sm text-muted-foreground list-disc list-inside">
            <li>50%+ commission = maximum 40 points</li>
            <li>25% commission = 20 points</li>
            <li>10% commission = 8 points</li>
          </ul>

          <h3 id="flat-fee" className="text-base font-semibold mt-6 mb-2">Flat fee</h3>
          <div className="overflow-x-auto rounded-2xl border border-border/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30 bg-muted/30">
                  <th className="text-left px-4 py-2 font-semibold">Amount</th>
                  <th className="text-center px-4 py-2 font-semibold">Score</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2">$1 - $49</td>
                  <td className="px-4 py-2 text-center">8</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2">$50 - $99</td>
                  <td className="px-4 py-2 text-center">16</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2">$100 - $499</td>
                  <td className="px-4 py-2 text-center">28</td>
                </tr>
                <tr>
                  <td className="px-4 py-2">$500+</td>
                  <td className="px-4 py-2 text-center">40</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-sm text-muted-foreground mt-4">
            <strong>&quot;Varies&quot;</strong>: 15 points (neutral midpoint).{" "}
            <strong>Compound rates</strong> (e.g., &quot;$5 per lead + 30%&quot;): the percentage component is used.
          </p>
        </section>

        {/* Cookie Duration */}
        <section>
          <h2 id="cookie-duration" className="text-lg font-semibold mb-3">
            Cookie Duration (15 pts)
          </h2>
          <CodeBlock code="score = min(cookie_days / 90, 1) * 15" label="formula" />
          <ul className="mt-3 space-y-1 text-sm text-muted-foreground list-disc list-inside">
            <li>90+ days = maximum 15 points</li>
            <li>30 days (standard) = 5 points</li>
            <li>7 days = ~1 point</li>
          </ul>
        </section>

        {/* Type + Duration */}
        <section>
          <h2 id="type-duration" className="text-lg font-semibold mb-3">
            Type + Duration (25 pts)
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-border/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30 bg-muted/30">
                  <th className="text-left px-4 py-2 font-semibold">Type</th>
                  <th className="text-left px-4 py-2 font-semibold">Duration</th>
                  <th className="text-center px-4 py-2 font-semibold">Score</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2">One-time</td>
                  <td className="px-4 py-2">—</td>
                  <td className="px-4 py-2 text-center">5</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2">Tiered</td>
                  <td className="px-4 py-2">—</td>
                  <td className="px-4 py-2 text-center">12</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2">Recurring</td>
                  <td className="px-4 py-2">Unknown</td>
                  <td className="px-4 py-2 text-center">18</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2">Recurring</td>
                  <td className="px-4 py-2">12 months</td>
                  <td className="px-4 py-2 text-center">21</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2">Recurring</td>
                  <td className="px-4 py-2">24 months</td>
                  <td className="px-4 py-2 text-center">23</td>
                </tr>
                <tr>
                  <td className="px-4 py-2">Recurring</td>
                  <td className="px-4 py-2">Lifetime</td>
                  <td className="px-4 py-2 text-center">25</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted-foreground mt-3">
            Recurring programs are significantly more valuable because
            affiliates earn on every renewal, not just the initial sale.
          </p>
        </section>

        {/* Verified */}
        <section>
          <h2 id="verified" className="text-lg font-semibold mb-3">
            Verified (10 pts)
          </h2>
          <p className="text-base text-muted-foreground leading-relaxed">
            Programs with the <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">verified</code> badge
            receive 10 bonus points. Verification means the community has
            confirmed the program&apos;s commission rates, cookie duration, and
            signup URL are accurate.
          </p>
        </section>

        {/* Completeness */}
        <section>
          <h2 id="completeness" className="text-lg font-semibold mb-3">
            Completeness (10 pts)
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-border/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30 bg-muted/30">
                  <th className="text-left px-4 py-2 font-semibold">Field</th>
                  <th className="text-center px-4 py-2 font-semibold">Points</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2">Description (20+ chars)</td>
                  <td className="px-4 py-2 text-center">4</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2">Agent prompt (10+ chars)</td>
                  <td className="px-4 py-2 text-center">3</td>
                </tr>
                <tr>
                  <td className="px-4 py-2">Signup URL</td>
                  <td className="px-4 py-2 text-center">3</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Examples */}
        <section>
          <h2 id="examples" className="text-lg font-semibold mb-3">
            Examples
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-border/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30 bg-muted/30">
                  <th className="text-left px-4 py-2 font-semibold">Program</th>
                  <th className="text-center px-3 py-2 font-semibold">Comm</th>
                  <th className="text-center px-3 py-2 font-semibold">Cookie</th>
                  <th className="text-center px-3 py-2 font-semibold">Type</th>
                  <th className="text-center px-3 py-2 font-semibold">Verif</th>
                  <th className="text-center px-3 py-2 font-semibold">Comp</th>
                  <th className="text-center px-3 py-2 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2 text-foreground">30% rec/lifetime, 90d, verified</td>
                  <td className="px-3 py-2 text-center">24</td>
                  <td className="px-3 py-2 text-center">15</td>
                  <td className="px-3 py-2 text-center">25</td>
                  <td className="px-3 py-2 text-center">10</td>
                  <td className="px-3 py-2 text-center">10</td>
                  <td className="px-3 py-2 text-center font-semibold text-emerald-600 dark:text-emerald-400">84</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2 text-foreground">50% rec/12mo, 30d, verified</td>
                  <td className="px-3 py-2 text-center">40</td>
                  <td className="px-3 py-2 text-center">5</td>
                  <td className="px-3 py-2 text-center">21</td>
                  <td className="px-3 py-2 text-center">10</td>
                  <td className="px-3 py-2 text-center">10</td>
                  <td className="px-3 py-2 text-center font-semibold text-emerald-600 dark:text-emerald-400">86</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2 text-foreground">$500 one-time, 30d, partial</td>
                  <td className="px-3 py-2 text-center">40</td>
                  <td className="px-3 py-2 text-center">5</td>
                  <td className="px-3 py-2 text-center">5</td>
                  <td className="px-3 py-2 text-center">0</td>
                  <td className="px-3 py-2 text-center">4</td>
                  <td className="px-3 py-2 text-center font-semibold">54</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 text-foreground">10% one-time, 30d, minimal</td>
                  <td className="px-3 py-2 text-center">8</td>
                  <td className="px-3 py-2 text-center">5</td>
                  <td className="px-3 py-2 text-center">5</td>
                  <td className="px-3 py-2 text-center">0</td>
                  <td className="px-3 py-2 text-center">0</td>
                  <td className="px-3 py-2 text-center font-semibold">18</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Implementation */}
        <section>
          <h2 id="implementation" className="text-lg font-semibold mb-3">
            Implementation
          </h2>
          <p className="text-base text-muted-foreground leading-relaxed mb-4">
            The scoring function is defined in <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">src/lib/programs.ts</code> as <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">affiliateScore()</code>. It is a pure function with no external dependencies.
          </p>
          <CodeBlock
            code={`import { affiliateScore } from "@/lib/programs";\nconst score = affiliateScore(program); // 0-100`}
            label="TypeScript"
          />
        </section>

        {/* Rate Parsing */}
        <section>
          <h2 id="rate-parsing" className="text-lg font-semibold mb-3">
            Rate Parsing
          </h2>
          <p className="text-base text-muted-foreground leading-relaxed mb-4">
            Commission rates come in various formats from YAML data. The <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">parseCommissionRate()</code> function handles:
          </p>
          <div className="overflow-x-auto rounded-2xl border border-border/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30 bg-muted/30">
                  <th className="text-left px-4 py-2 font-semibold">Input</th>
                  <th className="text-left px-4 py-2 font-semibold">Parsed As</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground font-mono text-xs">
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2">&quot;30%&quot;</td>
                  <td className="px-4 py-2">30 (percentage)</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2">&quot;$1,000&quot;</td>
                  <td className="px-4 py-2">1000 (flat fee)</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2">&quot;20-30%&quot;</td>
                  <td className="px-4 py-2">30 (takes higher)</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2">&quot;$5 per lead + 30%&quot;</td>
                  <td className="px-4 py-2">30 (prefers percentage)</td>
                </tr>
                <tr>
                  <td className="px-4 py-2">&quot;varies&quot;</td>
                  <td className="px-4 py-2">0 (scored separately)</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted-foreground mt-3">
            Commas in dollar amounts are stripped before parsing.
          </p>
        </section>
      </div>

      <DocsPagination currentPath="/docs/affiliate-score" />
    </div>
  );
}
