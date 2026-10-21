import type { Metadata } from "next";
import Link from "next/link";
import { DocsHeader } from "@/components/docs-header";
import { DocsPagination } from "@/components/docs-pagination";

export const metadata: Metadata = {
  title: "Contributing",
  description:
    "The rules a program file must pass to be merged into OpenAffiliate, and how to correct an existing listing.",
};

const link = "text-foreground hover:underline";
const code = "bg-muted px-1.5 py-0.5 rounded text-xs";

export default function ContributingPage() {
  return (
    <div>
      <DocsHeader
        group="Guides"
        title="Contributing"
        description="The rules a program file must pass, and how to correct one."
      />

      <div className="space-y-10">
        <section>
          <h2 id="steps" className="text-lg font-semibold mb-3">Add a program by pull request</h2>
          <ol className="list-decimal pl-5 space-y-2 text-base text-muted-foreground">
            <li>
              Fork <a href="https://github.com/Affitor/open-affiliate" className={link}>Affitor/open-affiliate</a>.
            </li>
            <li>
              Add <code className={code}>programs/&lt;slug&gt;.yaml</code>, one
              program per file, named with its slug. The{" "}
              <Link href="/docs/yaml-schema" className={link}>YAML Schema</Link>{" "}
              page has a template.
            </li>
            <li>
              Open a pull request to <code className={code}>main</code> and put
              the link to the brand&apos;s program page in its description.
            </li>
            <li>
              Automatic checks run, then a maintainer compares every term with
              the program page. Reviews usually take a few days.
            </li>
          </ol>
          <p className="text-base text-muted-foreground mt-3">
            Not a developer? Use <Link href="/submit" className={link}>the submit form</Link>{" "}
            or the other ways on{" "}
            <Link href="/docs/submit" className={link}>Submit a Program</Link>.
          </p>
        </section>

        <section>
          <h2 id="rules" className="text-lg font-semibold mb-3">Rules a file must pass</h2>
          <ul className="list-disc pl-5 space-y-2 text-base text-muted-foreground">
            <li>
              Required: <code className={code}>name</code>, <code className={code}>slug</code>,{" "}
              <code className={code}>url</code>, <code className={code}>category</code> (one of the
              schema&apos;s 20 values), <code className={code}>commission.type</code>,{" "}
              <code className={code}>commission.rate</code>, <code className={code}>commission.mode</code>,{" "}
              <code className={code}>description</code>, <code className={code}>short_description</code>{" "}
              (100 characters at most), <code className={code}>agents.prompt</code> and{" "}
              <code className={code}>created_at</code> (the date you add the file, YYYY-MM-DD; it never changes later).
            </li>
            <li>
              <code className={code}>commission.mode</code> is percentage, flat, tiered,
              hybrid or unknown, with <code className={code}>value</code> as the number
              (null when unknown). Give <code className={code}>commission.currency</code>;
              a flat amount cannot be read without it.
            </li>
            <li>
              <code className={code}>signup_url</code> is the program page on the
              brand&apos;s domain, over https, not the homepage.
            </li>
            <li>
              <code className={code}>verified: false</code>. Maintainers set it after checking.
            </li>
            <li>
              Only terms the brand publishes. A term the page does not state is
              left out, never guessed.
            </li>
            <li>
              <code className={code}>restrictions</code> is a list;{" "}
              <code className={code}>duration</code> is a bare length such as
              &ldquo;12 months&rdquo; or &ldquo;lifetime&rdquo;.
            </li>
          </ul>
        </section>

        <section>
          <h2 id="checks" className="text-lg font-semibold mb-3">The automatic checks</h2>
          <p className="text-base text-muted-foreground">
            A pull request from a fork that only adds files under{" "}
            <code className={code}>programs/</code> is validated at once: schema,
            registry build and the markdown build. After a maintainer approves
            the workflow run, CI also crawls the signup URL. A red Vercel status
            on a fork is expected and is not a failure of your file.
          </p>
        </section>

        <section>
          <h2 id="correct" className="text-lg font-semibold mb-3">Correct an existing program</h2>
          <p className="text-base text-muted-foreground">
            The quickest way is a{" "}
            <a href="https://github.com/Affitor/open-affiliate/issues/new?template=terms-changed.yml" className={link}>
              Terms changed
            </a>{" "}
            issue with the slug and the URL of the page that states the new
            terms. A pull request that edits an existing file also works, but
            the fork check only accepts new files, so it shows as failed until a
            maintainer runs the full checks; edits are never merged
            automatically.
          </p>
        </section>
      </div>

      <DocsPagination currentPath="/docs/contributing" />
    </div>
  );
}
