import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What OpenAffiliate stores when a brand claims its listing or signs in to manage it, why, for how long, and how to have it deleted.",
  alternates: { canonical: "/privacy" },
};

const CONTACT = "support@affitor.com";

/**
 * Covers the listing claim flow, the only place OpenAffiliate asks for
 * personal data. Retention is enforced by the daily pg_cron job in
 * supabase/migrations/009_program_claims.sql and 011_claim_accounts.sql and by
 * prune() in src/lib/claims/live.ts (RETENTION_DAYS); release() and
 * removeMember() clear addresses. Change the wording here and those cutoffs
 * together.
 */
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Privacy</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        The one place OpenAffiliate asks for personal data is when a brand claims its program listing and its
        team signs in to manage it. Readers never need an account. This page says what we keep, why, and for how
        long.
      </p>

      <h2 className="mt-10 text-lg font-semibold">What we store when you claim a listing</h2>
      <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-muted-foreground">
        <li>The email address you enter.</li>
        <li>The listing you claimed and its website domain.</li>
        <li>A one-way hash of your IP address, never the address itself.</li>
        <li>When each step happened: code sent, verified, terms submitted.</li>
        <li>The terms you submit, and any note you write to us.</li>
        <li>The work email addresses of teammates you add, so they can sign in.</li>
      </ul>
      <p className="mt-2 text-sm text-muted-foreground">
        Verification codes, sign-in codes and DNS tokens are stored only as one-way hashes. Our activity records for claims keep
        hashes of email and IP addresses, not the addresses.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Why we store it</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        To check that you run the listing&apos;s domain before you can suggest changes to it, to reach you if we
        have a question about those changes, and to stop abuse such as repeated code requests. This is our
        legitimate interest in keeping listings accurate and the claim process safe.
      </p>

      <h2 className="mt-8 text-lg font-semibold">What we send</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Only emails you or a teammate ask for: a 6-digit code when you claim a listing or sign in, and one notice
        when a teammate adds you. Codes go only to an address at the listing&apos;s own domain or to a team
        member&apos;s address. These emails contain no offers, and we do not add you to any mailing list.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Who can see it</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Your email address is never shown publicly. A claimed listing shows only &ldquo;Claimed by&rdquo; and
        the domain. The data is stored with Supabase, codes are delivered by Resend, and Cloudflare Turnstile
        checks that a person filled in the form.
      </p>

      <h2 className="mt-8 text-lg font-semibold">How long we keep it</h2>
      <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-muted-foreground">
        <li>
          A claim that is never verified, including a manual review request, is deleted within 30 days of the
          claim&apos;s last activity.
        </li>
        <li>
          A verified claim stays while your team manages the listing. When you release it, we remove every
          teammate&apos;s email address.
        </li>
        <li>
          When a teammate is removed, we remove their email address at once; the record that they were on the
          team, without the address, is deleted within 30 days.
        </li>
        <li>Sign-in codes are deleted within two days.</li>
        <li>Activity records, which hold only hashes, are deleted within 12 months.</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">Site analytics</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Separately from claims, we count page views and clicks to learn which listings are useful. Our own event
        log keeps a one-way hash of your IP address, not the address, and we use PostHog for product analytics,
        which sets a cookie in your browser.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Deletion and questions</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        You can release a listing at any time from your account. To have your data deleted, or for any
        question about this page, email{" "}
        <a href={`mailto:${CONTACT}`} className="underline underline-offset-4">
          {CONTACT}
        </a>
        .
      </p>
    </div>
  );
}
