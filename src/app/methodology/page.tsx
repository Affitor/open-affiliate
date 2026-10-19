import type { Metadata } from "next";
import Link from "next/link";
import { livePrograms } from "@/lib/programs";
import { CHECK_IDS, CHECKS, oasScores, PART_MAX, TEAM_DISCLOSURE, type Part } from "@/lib/oas";

export const metadata: Metadata = {
  title: "How We List and Rank Affiliate Programs",
  description:
    "How OpenAffiliate lists affiliate programs: open YAML data, what verified means, how lists are ranked, and why listings are free and rankings never paid.",
  alternates: { canonical: "/methodology" },
};

const verified = livePrograms.filter((p) => p.verified).length;

const link = "underline underline-offset-4";

const checkList = (part: Part) =>
  CHECK_IDS.filter((id) => CHECKS[id].part === part)
    .map((id) => `${CHECKS[id].label.charAt(0).toLowerCase()}${CHECKS[id].label.slice(1)} (${CHECKS[id].max})`)
    .join(", ");

/**
 * Every sentence here describes what the code does today: verification and
 * labels from the program page, src/lib/program-seo.ts and
 * src/lib/confirmed-terms.ts, brands with no
 * program from src/lib/no-program.ts, ranking from src/lib/best-lists.ts and
 * affiliateScore in src/lib/programs.ts, OAS from src/lib/oas.ts and
 * src/lib/oas-v1.ts (shown only once scores are published).
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
        They are community-submitted. Their commission is marked unconfirmed,
        and their cookie window, payout and approval are hidden everywhere
        until checked. Lists tag them &ldquo;not verified&rdquo;. Check the
        brand&apos;s own terms before promoting one.
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
        Every list reads commission from structured fields, never the
        free-text rate: a single percentage, or a flat amount stated in US
        dollars. Tiered and mixed deals, flat amounts in other currencies, and
        referral rewards paid in credit or gift cards count for nothing as
        commission. Verified programs come first. Within each group, the topic
        lists under{" "}
        <Link href="/best" className={link}>
          /best
        </Link>{" "}
        and the category pages order by that commission, so tiered and mixed
        deals come after single rates. The main{" "}
        <Link href="/best" className={link}>
          best affiliate programs
        </Link>{" "}
        list ranks verified programs by{" "}
        <Link href="/docs/affiliate-score" className={link}>
          Affiliate Score
        </Link>
        , which adds the cookie window, how long commission lasts and how
        complete the listing is to the same commission; the homepage&apos;s
        rankings, featured and top verified programs use the same score.
        Programs that publish
        no rate are left out of every /best list and placed last in their
        group on category pages.
      </p>

      {oasScores.length > 0 && (
        <>
          <h2 id="oas" className="mt-8 text-lg font-semibold">How is OAS calculated?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            OAS, the OpenAffiliate Score, measures how clearly a program
            publishes the terms an affiliate needs (Transparency,{" "}
            {PART_MAX.transparency} points) and whether three of them protect
            the affiliate (Partner value, {PART_MAX.partner_value} points). It
            reads only the terms OpenAffiliate verified on the program&apos;s
            own page, and never the size of the commission. Transparency:{" "}
            {checkList("transparency")}. Partner value: {checkList("partner_value")}.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            A term we read the program&apos;s pages for and did not find scores
            0 and is marked Not published, with the date we checked. A program
            gets a number only once every check is assessed; until then it shows
            Scoring in progress, so a term we have not checked yet neither costs
            it points nor gives it free ones. A rate published as
            &ldquo;varies&rdquo;, with no number, does not meet the commission
            check. When two of the brand&apos;s own pages disagree on a term,
            that check is not met until they agree. Each report links the page
            the terms were checked on. Only verified, live affiliate programs
            are scored, and terms verified more than 90 days ago show Scoring in
            progress until we verify them again. Kyma API and programs on the
            Affitor network are scored the same way and never ranked.{" "}
            {TEAM_DISCLOSURE}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Not scored yet: refund and chargeback rules, and how well the
            application link works. A brand that finds a mistake can report it
            from its OAS report.
          </p>
        </>
      )}

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
