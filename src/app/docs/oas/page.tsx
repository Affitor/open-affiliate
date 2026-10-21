import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/code-block";
import { DocsHeader } from "@/components/docs-header";
import { DocsPagination } from "@/components/docs-pagination";
import { CHECK_IDS, CHECKS, GRADE_BANDS, PART_MAX, STALE_DAYS, TEAM_DISCLOSURE, TIE_ORDER } from "@/lib/oas";
import { MACHINE_LABELS, type MachineCheckId } from "@/lib/oas-machine";

export const metadata: Metadata = {
  title: "OpenAffiliate Score (OAS)",
  description:
    "How a program gets scored and ranked: the checks, the grades, the ranking order, and how to improve a score or ask for a re-check.",
};

const link = "text-foreground underline underline-offset-4";

/** What each machine check reads, in words. Source: src/lib/oas-machine.ts and scripts/oas-tier1.ts. */
const MACHINE_ABOUT: Record<MachineCheckId, string> = {
  A1: "The program page listed in the registry (its signup_url) answers with HTTP 200 and is not a \"not found\" page.",
  P5: "Core Web Vitals on mobile for the brand's website, from PageSpeed Insights: real-user data when Google has it, a lab test otherwise.",
  P6: "Estimated worldwide searches for the brand reach 1,000 a month (Google Ads estimate).",
};

/**
 * Every number on this page comes from src/lib/oas.ts (checks, weights,
 * grades, tie order), so the page changes when the scorer does.
 */
export default function OasDocsPage() {
  return (
    <div>
      <DocsHeader
        group="References"
        title="OpenAffiliate Score (OAS)"
        description="How a program gets scored and ranked, and how to improve a score."
      />

      <div className="space-y-10">
        <section>
          <h2 id="overview" className="text-lg font-semibold mb-3">Overview</h2>
          <p className="text-base text-muted-foreground leading-relaxed">
            OAS measures how clearly a program publishes the terms an affiliate
            needs (Transparency, {PART_MAX.transparency} points) and whether
            three of those terms protect the affiliate (Partner value,{" "}
            {PART_MAX.partner_value} points). It reads only the terms
            OpenAffiliate verified on the program&apos;s own page. It never reads
            the size of the commission, and no program can pay for a score or a
            position. {TEAM_DISCLOSURE}
          </p>
          <p className="text-base text-muted-foreground leading-relaxed mt-3">
            Scores are on{" "}
            <Link href="/rankings" className={link}>/rankings</Link>, in the{" "}
            <Link href="/rankings/leaderboard" className={link}>full leaderboard</Link>
            , and in a report per program at{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">/programs/&lt;slug&gt;/oas</code>.
            The full rules are on the{" "}
            <Link href="/methodology#oas" className={link}>methodology</Link> page.
          </p>
        </section>

        <section>
          <h2 id="when-scored" className="text-lg font-semibold mb-3">When a program gets a score</h2>
          <p className="text-base text-muted-foreground leading-relaxed">
            Scoring is not instant, and there is no way to score a program by
            pasting a URL. The order is:
          </p>
          <ol className="mt-3 list-decimal pl-5 space-y-2 text-base text-muted-foreground leading-relaxed">
            <li>
              The program is in the registry: its YAML file was merged (see{" "}
              <Link href="/docs/submit" className={link}>Submit a Program</Link>).
            </li>
            <li>
              A maintainer reads the brand&apos;s own program page and verifies
              each term (programs on the Affitor marketplace are verified from
              the terms the brand publishes there, by a daily sync). A term the page does not state is recorded as Not
              published, with the date we checked.
            </li>
            <li>
              The program gets a number once every check is assessed. Until then
              its report says Scoring in progress, so a term we have not read yet
              neither costs points nor earns them.
            </li>
          </ol>
          <p className="text-base text-muted-foreground leading-relaxed mt-3">
            Only verified, live affiliate programs are scored. Terms verified
            more than {STALE_DAYS} days ago show Scoring in progress until we
            verify them again. A program with no public application link is
            scored but not ranked.
          </p>
        </section>

        <section>
          <h2 id="checks" className="text-lg font-semibold mb-3">The checks</h2>
          <p className="text-base text-muted-foreground leading-relaxed mb-4">
            A met check earns its points. A check that is not met, or a term
            that is not published, earns 0. When two of the brand&apos;s own
            pages disagree on a term, that check is not met until they agree.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-border/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30 bg-muted/30">
                  <th className="text-left px-4 py-2.5 font-semibold">Check</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Part</th>
                  <th className="text-center px-4 py-2.5 font-semibold">Points</th>
                  <th className="text-left px-4 py-2.5 font-semibold">How to meet it</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                {CHECK_IDS.map((id) => (
                  <tr key={id} className="border-b border-border/20 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-foreground">
                      <span className="font-mono text-xs text-muted-foreground mr-1.5">{id}</span>
                      {CHECKS[id].label}
                    </td>
                    <td className="px-4 py-2.5">{CHECKS[id].part === "transparency" ? "Transparency" : "Partner value"}</td>
                    <td className="px-4 py-2.5 text-center">{CHECKS[id].max}</td>
                    <td className="px-4 py-2.5">{CHECKS[id].fix}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Not scored yet: refund and chargeback rules, and how well the
            application link works.
          </p>
        </section>

        <section>
          <h2 id="grades" className="text-lg font-semibold mb-3">Grades</h2>
          <p className="text-base text-muted-foreground leading-relaxed mb-4">
            Each score carries a letter, as a college grade does.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-border/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30 bg-muted/30">
                  <th className="text-left px-4 py-2.5 font-semibold">Grade</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Score</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                {GRADE_BANDS.map(([g, from], i) => (
                  <tr key={g} className="border-b border-border/20 last:border-0">
                    <td className="px-4 py-2 font-medium text-foreground">{g}</td>
                    <td className="px-4 py-2 font-mono">
                      {i === 0 ? `${from} to 100` : from === 0 ? `under ${GRADE_BANDS[i - 1][1]}` : `${from} to under ${GRADE_BANDS[i - 1][1]}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 id="ranking" className="text-lg font-semibold mb-3">Ranking order</h2>
          <p className="text-base text-muted-foreground leading-relaxed">
            Programs are ranked by their unrounded OAS. {TIE_ORDER} Every
            program is ranked by the same rules, whoever runs it and whatever
            network it runs on.
          </p>
        </section>

        <section>
          <h2 id="machine-checks" className="text-lg font-semibold mb-3">Machine checks</h2>
          <p className="text-base text-muted-foreground leading-relaxed mb-4">
            A report can also show checks read automatically from public data.
            They are shown beside OAS and are not counted in it, its grade or
            the ranking. Each reading names its source and lapses {STALE_DAYS}{" "}
            days after it was measured.
          </p>
          <ul className="space-y-2 text-base text-muted-foreground leading-relaxed">
            {(Object.keys(MACHINE_LABELS) as MachineCheckId[]).map((id) => (
              <li key={id}>
                <span className="font-mono text-xs mr-1.5">{id}</span>
                <span className="text-foreground font-medium">{MACHINE_LABELS[id]}.</span>{" "}
                {MACHINE_ABOUT[id]}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 id="improve" className="text-lg font-semibold mb-3">How to improve a score</h2>
          <p className="text-base text-muted-foreground leading-relaxed">
            Publish the missing terms on your own program page, in plain words.
            The report lists the gaps that are worth the most points first, and
            its Prompt to improve gives the same list as text you can hand to
            your team or an AI agent. Changing the YAML file alone does not
            change the score: every term is verified against your page.
          </p>
        </section>

        <section>
          <h2 id="recheck" className="text-lg font-semibold mb-3">Ask for a re-check or report a mistake</h2>
          <p className="text-base text-muted-foreground leading-relaxed">
            After you change your program page, or if a check looks wrong, use
            Report an error on the program&apos;s report, or open a{" "}
            <a href="https://github.com/Affitor/open-affiliate/issues/new?template=terms-changed.yml" className={link} target="_blank" rel="noopener noreferrer">
              Terms changed issue
            </a>{" "}
            with the program&apos;s slug and the URL of the page that states the
            term. A maintainer verifies the page again and the score follows the
            verified terms. Nobody edits a score by hand. Re-checks usually
            happen within a few days.
          </p>
        </section>

        <section>
          <h2 id="api" className="text-lg font-semibold mb-3">OAS in the API and MCP</h2>
          <p className="text-base text-muted-foreground leading-relaxed mb-4">
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">GET /api/programs/&#123;slug&#125;</code>{" "}
            and the MCP tool{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">get_program</code>{" "}
            return an <code className="bg-muted px-1.5 py-0.5 rounded text-xs">oas</code> object
            when the program is scored, and{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">oasMachineChecks</code>{" "}
            when there are machine checks to show.{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">status</code> is{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">scored</code>,{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">in_progress</code> or{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">stale</code>, and{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">score</code> is null
            unless it is scored. Cite{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">reportUrl</code> when
            you quote a score.
          </p>
          <CodeBlock
            label="oas"
            code={`{
  "score": 100,
  "grade": "A+",
  "status": "scored",
  "summary": "Every term published, partner terms met",
  "checkedAt": "2026-10-20",
  "validUntil": "2027-01-18",
  "version": "v1",
  "reportUrl": "https://openaffiliate.dev/programs/<slug>/oas"
}`}
          />
        </section>

        <section>
          <h2 id="other-scores" className="text-lg font-semibold mb-3">Other scores on the site</h2>
          <p className="text-base text-muted-foreground leading-relaxed">
            <Link href="/docs/affiliate-score" className={link}>Affiliate Score</Link>{" "}
            is the older 0 to 100 score built from commission, cookie and
            duration. It still orders the main /best list, the featured programs
            on the homepage and the README badge. /rankings uses OAS.{" "}
            <Link href="/docs/sift-scoring" className={link}>SIFT</Link> scores
            social content about a program, not the program itself.
          </p>
        </section>
      </div>

      <DocsPagination currentPath="/docs/oas" />
    </div>
  );
}
