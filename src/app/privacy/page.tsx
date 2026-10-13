import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What OpenAffiliate stores when a brand claims its listing, why, for how long, and how to have it deleted.",
  alternates: { canonical: "/privacy" },
};

const CONTACT = "support@affitor.com";

/**
 * Covers the listing claim flow, the only place OpenAffiliate asks for
 * personal data. Retention here is enforced in code: src/lib/claims/live.ts
 * prune() deletes unverified claims after 30 days and audit events after a
 * year, and release() clears the owner's address.
 */
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Privacy</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        OpenAffiliate does not have accounts. The one place we ask for personal data is when someone claims a
        program listing to manage it. This page says what we keep, why, and for how long.
      </p>

      <h2 className="mt-10 text-lg font-semibold">What we store when you claim a listing</h2>
      <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-muted-foreground">
        <li>The email address you enter.</li>
        <li>The listing you claimed and its website domain.</li>
        <li>A one-way hash of your IP address, never the address itself.</li>
        <li>When each step happened: code sent, verified, terms submitted.</li>
        <li>The terms you submit, and any note you write to us.</li>
      </ul>
      <p className="mt-2 text-sm text-muted-foreground">
        Verification codes and DNS tokens are stored only as one-way hashes. Our activity records for claims keep
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
        One email with a 6-digit code, and only to an address at the listing&apos;s own domain. The email
        contains no offers. We do not add you to any mailing list.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Who can see it</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Your email address is never shown publicly. A claimed listing shows only &ldquo;Claimed by&rdquo; and
        the domain. The data is stored with Supabase, codes are delivered by Resend, and Cloudflare Turnstile
        checks that a person filled in the form.
      </p>

      <h2 className="mt-8 text-lg font-semibold">How long we keep it</h2>
      <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-muted-foreground">
        <li>A claim that is never verified, including a manual review request, is deleted after 30 days.</li>
        <li>A verified claim stays while you manage the listing. When you release it, we remove your email address.</li>
        <li>Activity records, which hold only hashes, are deleted after 12 months.</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">Site analytics</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Separately from claims, we count page views and clicks to learn which listings are useful. Our own event
        log keeps a one-way hash of your IP address, not the address, and we use PostHog for product analytics,
        which sets a cookie in your browser.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Deletion and questions</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        You can release a listing at any time from its owner panel. To have your data deleted, or for any
        question about this page, email{" "}
        <a href={`mailto:${CONTACT}`} className="underline underline-offset-4">
          {CONTACT}
        </a>
        .
      </p>
    </div>
  );
}
