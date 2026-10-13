import type { Metadata } from "next";
import Link from "next/link";
import { livePrograms } from "@/lib/programs";

export const metadata: Metadata = {
  title: "How We List and Rank Affiliate Programs",
  description:
    "How OpenAffiliate lists affiliate programs: open YAML data, what verified means, how lists are ranked, and why listings are free and rankings never paid.",
  alternates: { canonical: "/methodology" },
};

const verified = livePrograms.filter((p) => p.verified).length;

const link = "underline underline-offset-4";

/**
 * Every sentence here describes what the code does today: verification and
 * labels from the program page and src/lib/program-seo.ts, brands with no
 * program from src/lib/no-program.ts, ranking from src/lib/best-lists.ts.
 * Change one of those and this page changes with it.
 */
export default function MethodologyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold tracking-tight">
        How OpenAffiliate lists and ranks programs
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Maintained by Affitor. Listings are free; rankings are never paid.
      </p>

      <h2 className="mt-10 text-lg font-semibold">Where does the data live?</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Every program is one YAML file in the public{" "}
        <a href="https://github.com/Affitor/open-affiliate" target="_blank" rel="noopener noreferrer" className={link}>
          GitHub repository
        </a>
        . This site, the API, the MCP server and the markdown pages all read
        program data from those files, and every change lands as a public pull
        request.
      </p>

      <h2 className="mt-8 text-lg font-semibold">What does verified mean?</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        A verified program had its terms checked against its own affiliate
        page. Affitor, which maintains this site, also runs a marketplace:
        programs listed on it are verified from the terms the brand publishes
        there, read by a daily sync that opens a pull request for any change.
        Program pages show the check date when one is recorded; a list shows the
        latest among its verified programs. {verified} of {livePrograms.length} live
        programs are verified.
      </p>

      <h2 className="mt-8 text-lg font-semibold">
        What about unverified programs?
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        They are community-submitted. Their pages mark the commission and
        cookie window as unconfirmed, and lists tag them &ldquo;not
        verified&rdquo;. Check the brand&apos;s own terms before promoting one.
      </p>

      <h2 className="mt-8 text-lg font-semibold">
        What if a brand has no affiliate program?
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Its page says so and lists no terms, with the check date when one is
        recorded. Such a brand is never ranked.
      </p>

      <h2 className="mt-8 text-lg font-semibold">How are lists ranked?</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Verified programs come first. Within each group, the topic lists under{" "}
        <Link href="/best" className={link}>
          /best
        </Link>{" "}
        and the category pages order by commission, read from structured
        fields, never the free-text rate: a single percentage, or a flat amount
        stated in US dollars. On those pages, tiered and mixed deals come after
        single rates, and referral rewards paid in credit or gift cards are not
        counted as cash. The main{" "}
        <Link href="/best" className={link}>
          best affiliate programs
        </Link>{" "}
        list is different: it ranks verified programs by{" "}
        <Link href="/docs/affiliate-score" className={link}>
          Affiliate Score
        </Link>
        , which weighs commission, cookie window and how long commission lasts.
        Programs that publish no rate are left out of every /best list and
        placed last in their group on category pages.
      </p>

      <h2 className="mt-8 text-lg font-semibold">
        Can a program pay for a better position?
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        No. Listing is free, and only the rules above set a program&apos;s
        position. Programs on the Affitor marketplace follow the same rules as
        every other program.
      </p>

      <h2 className="mt-8 text-lg font-semibold">
        How do I add or correct a program?
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Open a pull request that adds or edits its YAML file, or use{" "}
        <Link href="/submit" className={link}>
          the submit form
        </Link>
        , which writes the file and opens it on GitHub. To report an
        error,{" "}
        <a
          href="https://github.com/Affitor/open-affiliate/issues/new"
          target="_blank"
          rel="noopener noreferrer"
          className={link}
        >
          open an issue
        </a>{" "}
        with the program&apos;s slug and what is wrong, or send it through{" "}
        <Link href="/feedback" className={link}>
          the feedback form
        </Link>
        .
      </p>
    </div>
  );
}
