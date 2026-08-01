import type { Metadata } from "next";
import Link from "next/link";
import { programs } from "@/lib/programs";

export const metadata: Metadata = {
  title: "About",
  description:
    "OpenAffiliate is a community-maintained, MIT-licensed registry of affiliate programs. Who runs it, how the data is verified, and how to reach us.",
  alternates: { canonical: "/about" },
};

const verified = programs.filter((p) => p.verified).length;

/**
 * Answer-first: each heading is the question a reader or an AI engine would
 * ask, and the first sentence under it is the answer. Sites without a
 * verifiable identity get treated as less trustworthy and cited less, which
 * is what put this site at 50/100 on trust signals with no About or Contact
 * anywhere on the domain.
 */
export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold tracking-tight">About OpenAffiliate</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        OpenAffiliate is an open registry of affiliate programs — one YAML file
        per program, in public, under an MIT licence. It is built to be read by
        people and by AI agents alike.
      </p>

      <h2 className="mt-10 text-lg font-semibold">What is OpenAffiliate?</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        A free, community-maintained directory of {programs.length} affiliate
        programs. Every entry records the commission rate, cookie window, payout
        terms, and guidance on when the program is worth recommending. There is
        no account, no paywall, and no placement fee — position in the rankings
        cannot be bought.
      </p>

      <h2 className="mt-8 text-lg font-semibold">
        How is the data verified?
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {verified} of {programs.length} programs are verified, meaning a
        maintainer checked the commission terms against the program&apos;s own
        page and recorded the date. The remaining{" "}
        {programs.length - verified} are community-submitted and unconfirmed —
        every program page states its own status and verification date, and so
        does the machine-readable{" "}
        <Link href="/llms.txt" className="underline underline-offset-4">
          llms.txt
        </Link>
        . Treat unverified figures as a starting point and check the
        program&apos;s own page before acting on them.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Who maintains it?</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        OpenAffiliate is maintained by Affitor together with the contributors
        who submit and correct programs. Every change lands as a public pull
        request, so the full edit history of any entry is visible to anyone.
      </p>

      <h2 className="mt-8 text-lg font-semibold">How do I contact you?</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        For a correction, a new program, or anything else, open an issue or a
        pull request on GitHub — that is the fastest route and it keeps the
        conversation public.
      </p>
      <ul className="mt-3 space-y-1.5 text-sm">
        <li>
          <a
            href="https://github.com/Affitor/open-affiliate/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4"
          >
            Report incorrect data
          </a>{" "}
          <span className="text-muted-foreground">
            — include the program slug and what is wrong
          </span>
        </li>
        <li>
          <Link href="/submit" className="underline underline-offset-4">
            Submit a program
          </Link>{" "}
          <span className="text-muted-foreground">— add yours to the registry</span>
        </li>
        <li>
          <a
            href="https://github.com/Affitor/open-affiliate"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4"
          >
            Source code
          </a>{" "}
          <span className="text-muted-foreground">— MIT licensed</span>
        </li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">
        Can I use this data in my own product?
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Yes. The registry is available as a{" "}
        <Link href="/docs/api" className="underline underline-offset-4">
          REST API
        </Link>{" "}
        with no authentication, an{" "}
        <Link href="/docs/mcp" className="underline underline-offset-4">
          MCP server
        </Link>{" "}
        for AI agents, a{" "}
        <Link href="/docs/cli" className="underline underline-offset-4">
          CLI
        </Link>
        , and{" "}
        <Link href="/llms.txt" className="underline underline-offset-4">
          markdown surfaces
        </Link>{" "}
        for anything that reads text. Attribution is appreciated but not
        required.
      </p>
    </div>
  );
}
