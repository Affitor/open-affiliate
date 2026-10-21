import type { Metadata } from "next";
import Link from "next/link";
import { AffitorLink } from "@/components/affitor-link";
import { CodeBlock } from "@/components/code-block";
import { affitorUrl } from "@/lib/affitor-link";
import { DocsHeader } from "@/components/docs-header";
import { DocsPagination } from "@/components/docs-pagination";

export const metadata: Metadata = {
  title: "Submit a Program",
  description:
    "Add an affiliate program to OpenAffiliate: four ways in, what a maintainer checks, how long it takes, and what happens after merge.",
};

const link = "text-foreground hover:underline";
const code = "bg-muted px-1.5 py-0.5 rounded text-xs";

export default function SubmitPage() {
  return (
    <div>
      <DocsHeader
        group="Guides"
        title="Submit a Program"
        description="Add a program, what we check, and how long it takes."
      />

      <div className="space-y-10">
        <section>
          <h2 id="ways" className="text-lg font-semibold mb-3">Four ways to add a program</h2>
          <p className="text-base text-muted-foreground mb-4">
            Listing is free. Every way ends in the same place: a program file in
            the public repository, reviewed by a maintainer.
          </p>
          <div className="space-y-4 text-base text-muted-foreground">
            <div>
              <h3 id="web-form" className="text-sm font-semibold text-foreground mb-1">1. Web form</h3>
              <p>
                <Link href="/submit" className={link}>The submit form</Link> writes
                the program file for you and opens GitHub, where you create the
                pull request. You need a GitHub account: GitHub copies the
                repository to your account before the pull request opens.
              </p>
            </div>
            <div>
              <h3 id="pull-request" className="text-sm font-semibold text-foreground mb-1">2. Pull request</h3>
              <p>
                Fork{" "}
                <a href="https://github.com/Affitor/open-affiliate" className={link}>Affitor/open-affiliate</a>, add{" "}
                <code className={code}>programs/your-product.yaml</code> and open a
                pull request. The{" "}
                <Link href="/docs/contributing" className={link}>Contributing</Link>{" "}
                page lists the rules the file must pass.
              </p>
            </div>
            <div>
              <h3 id="suggest" className="text-sm font-semibold text-foreground mb-1">3. Suggest a program</h3>
              <p>
                Open a{" "}
                <a href="https://github.com/Affitor/open-affiliate/issues/new?template=suggest-a-program.yml" className={link}>
                  Suggest a program
                </a>{" "}
                issue with only the link to the program page. A maintainer writes
                the file. This also needs a GitHub account.
              </p>
            </div>
            <div>
              <h3 id="email" className="text-sm font-semibold text-foreground mb-1">4. Email</h3>
              <p>
                Send the link to your program page to{" "}
                <a href="mailto:hello@openaffiliate.dev" className={link}>hello@openaffiliate.dev</a>.
                GitHub is faster and shows you where the request stands.
              </p>
            </div>
          </div>
          <p className="text-base text-muted-foreground mt-4">
            OpenAffiliate lists programs; to track and pay partners, run your
            program on{" "}
            <AffitorLink href={affitorUrl("docs", "submit")} source="docs" cta="run_program" className={link}>
              Affitor
            </AffitorLink>
            .
          </p>
        </section>

        <section>
          <h2 id="what-we-check" className="text-lg font-semibold mb-3">What a maintainer checks</h2>
          <ul className="list-disc pl-5 space-y-2 text-base text-muted-foreground">
            <li>
              Every term comes from the brand&apos;s own program page or terms.
              A listing on a network such as Dub or PartnerStack is not proof on
              its own; link the page on the brand&apos;s domain.
            </li>
            <li>
              A term the page does not state is left empty. Do not fill a cookie
              window, a minimum payout or an approval time the brand does not
              publish.
            </li>
            <li>
              Descriptions are factual: what the product does and what the
              program pays, without ranking words such as &ldquo;best&rdquo; or
              &ldquo;reliable&rdquo;.
            </li>
            <li>
              The file passes the automatic checks: schema, registry build and
              a crawl of the signup URL.
            </li>
          </ul>
          <p className="text-base text-muted-foreground mt-3">
            Reviews usually take a few days. A pull request with the program
            page linked in its description is the quickest to review.
          </p>
        </section>

        <section>
          <h2 id="after-merge" className="text-lg font-semibold mb-3">After merge</h2>
          <ol className="list-decimal pl-5 space-y-2 text-base text-muted-foreground">
            <li>
              The program appears on the site after the next deploy, usually
              within minutes, as not verified: its commission is marked
              unconfirmed, and its cookie window, payout and approval stay hidden.
            </li>
            <li>
              A maintainer verifies the terms on the program page and marks it
              verified.
            </li>
            <li>
              Once every check is assessed, the program gets an{" "}
              <Link href="/docs/oas" className={link}>OpenAffiliate Score</Link>,
              a report at <code className={code}>/programs/&lt;slug&gt;/oas</code>{" "}
              and a place on <Link href="/rankings" className={link}>/rankings</Link>.
              There is no instant score.
            </li>
          </ol>
        </section>

        <section>
          <h2 id="agents" className="text-lg font-semibold mb-3">With an AI agent</h2>
          <p className="text-base text-muted-foreground mb-4">
            The MCP server is read-only: it can look a program up, not add one.
            An agent should check first, then use its own GitHub tools to open
            a pull request or a Suggest a program issue, following the same
            rules as a person.
          </p>
          <CodeBlock
            label="check before submitting"
            code={`curl -s https://openaffiliate.dev/api/programs/your-product
# 404: not listed yet. 200: already listed; read its oas.reportUrl.`}
          />
        </section>

        <section>
          <h2 id="correct" className="text-lg font-semibold mb-3">Correct a listing</h2>
          <p className="text-base text-muted-foreground">
            Terms changed, or a score looks wrong? Open a{" "}
            <a href="https://github.com/Affitor/open-affiliate/issues/new?template=terms-changed.yml" className={link}>
              Terms changed
            </a>{" "}
            issue with the URL of the page that states the new terms, or use
            Report an error on the program&apos;s OAS report. See{" "}
            <Link href="/docs/oas#recheck" className={link}>re-checks</Link>.
          </p>
        </section>
      </div>

      <DocsPagination currentPath="/docs/submit" />
    </div>
  );
}
