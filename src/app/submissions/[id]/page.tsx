import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { liveSubmissionDeps } from "@/lib/submissions/live";
import { logFailure, status } from "@/lib/submissions/service";

export const dynamic = "force-dynamic";

// A status page per submission: never indexed, and it shows only what GET /api/submissions/{id} returns.
export const metadata: Metadata = { title: "Submission status", robots: { index: false, follow: false } };

const TEXT: Record<string, string> = {
  queued: "Queued. A maintainer will verify the terms on the brand's own page before the program is listed.",
  verifying: "Being verified. A maintainer is checking the terms on the brand's own page.",
  listed: "Listed on OpenAffiliate.",
  rejected: "Not listed.",
};

export default async function SubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deps = liveSubmissionDeps();
  if (!deps) notFound();
  let body: Record<string, unknown>;
  try {
    const answer = await status(id, deps);
    if (answer.status !== 200) notFound();
    body = answer.body;
  } catch (err) {
    logFailure("status-page", err);
    throw new Error("submission status unavailable");
  }
  const state = String(body.status);
  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Submission status</h1>
      <p className="mt-4 text-sm">{TEXT[state] ?? state}</p>
      {typeof body.reason === "string" && <p className="mt-2 text-sm text-muted-foreground">{body.reason}</p>}
      {typeof body.listingUrl === "string" && (
        <p className="mt-2 text-sm">
          <a href={body.listingUrl} className="underline underline-offset-2">See the listing</a>
          {typeof body.reportUrl === "string" && (
            <>
              {" · "}
              <a href={body.reportUrl} className="underline underline-offset-2">OAS report</a>
            </>
          )}
        </p>
      )}
      <p className="mt-6 text-meta text-muted-foreground">
        Sent {String(body.createdAt).slice(0, 10)} · updated {String(body.updatedAt).slice(0, 10)} ·{" "}
        <Link href="/submit" className="underline underline-offset-2">Submit another program</Link>
      </p>
    </div>
  );
}
