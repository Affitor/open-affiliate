"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Turnstile } from "@/components/turnstile";

type Result =
  | { kind: "queued" | "duplicate"; id: string; status: string }
  | { kind: "listed"; listingUrl: string }
  | { kind: "error"; message: string };

/**
 * "Submit by URL": POST /api/submissions with a Turnstile token. A submission
 * only joins the review queue; the result says so in each of the three
 * answers (new, already queued, already listed).
 */
/** /submit?url=brand.com (from "Not listed yet") prefills the program URL. */
function prefill(typed: string | null | undefined): string {
  const t = typed?.trim() ?? "";
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(t)) return `https://${t}`;
  return t.startsWith("https://") ? t : "";
}

/** Render inside <Suspense>: it reads the query string. */
export function SubmitByUrl({ siteKey }: { siteKey: string }) {
  const params = useSearchParams();
  const [programUrl, setProgramUrl] = useState(() => prefill(params.get("url")));
  const [termsUrl, setTermsUrl] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [token, setToken] = useState("");
  const [widget, setWidget] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const onToken = useCallback((t: string) => setToken(t), []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programUrl: programUrl.trim(), termsUrl: termsUrl.trim(), name, contact: contact.trim(), note, turnstileToken: token }),
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok && body.status === "listed" && typeof body.listingUrl === "string") setResult({ kind: "listed", listingUrl: body.listingUrl });
      else if (res.ok && typeof body.id === "string") setResult({ kind: body.duplicate ? "duplicate" : "queued", id: body.id, status: String(body.status) });
      else setResult({ kind: "error", message: typeof body.message === "string" ? body.message : "Something went wrong. Try again later." });
    } catch {
      setResult({ kind: "error", message: "Could not reach OpenAffiliate. Check your connection and try again." });
    } finally {
      // Turnstile tokens are single use.
      setToken("");
      setWidget((w) => w + 1);
      setBusy(false);
    }
  }

  return (
    <section id="by-url" className="mt-8 rounded-xl border border-border/50 bg-card/30 p-6 scroll-mt-20">
      <h2 className="text-sm font-semibold">Submit by URL</h2>
      <p className="text-sm text-muted-foreground mt-1">
        Send the program page on the brand&apos;s own website. A maintainer checks the terms there before the program is listed.
        Nothing is listed or scored until then.
      </p>
      <form onSubmit={send} className="mt-4 space-y-3">
        <div>
          <label htmlFor="sub-url" className="text-xs text-muted-foreground mb-1.5 block">Program page (required)</label>
          <Input id="sub-url" type="url" required placeholder="https://yourproduct.com/affiliates" value={programUrl} onChange={(e) => setProgramUrl(e.target.value)} className="bg-muted/50 border-border/50" />
        </div>
        <div>
          <label htmlFor="sub-terms" className="text-xs text-muted-foreground mb-1.5 block">Terms page, if different</label>
          <Input id="sub-terms" type="url" placeholder="https://yourproduct.com/affiliate-terms" value={termsUrl} onChange={(e) => setTermsUrl(e.target.value)} className="bg-muted/50 border-border/50" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="sub-name" className="text-xs text-muted-foreground mb-1.5 block">Brand name</label>
            <Input id="sub-name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} className="bg-muted/50 border-border/50" />
          </div>
          <div>
            <label htmlFor="sub-contact" className="text-xs text-muted-foreground mb-1.5 block">Your email (optional, never shown)</label>
            <Input id="sub-contact" type="email" maxLength={320} value={contact} onChange={(e) => setContact(e.target.value)} className="bg-muted/50 border-border/50" />
          </div>
        </div>
        <div>
          <label htmlFor="sub-note" className="text-xs text-muted-foreground mb-1.5 block">Note for the reviewer</label>
          <textarea id="sub-note" maxLength={1000} rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-lg border border-border/50 bg-muted/50 px-3 py-2 text-sm" />
        </div>
        <Turnstile key={widget} siteKey={siteKey} action="submit-program" onToken={onToken} />
        <button type="submit" disabled={busy || !token || !programUrl} className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50">
          {busy ? "Sending…" : "Submit for review"}
        </button>
      </form>
      {result && (
        <div aria-live="polite" className="mt-4 text-sm">
          {result.kind === "queued" && (
            <p>
              Queued, not listed yet. A maintainer verifies the terms on the brand&apos;s page first.{" "}
              <Link href={`/submissions/${result.id}`} className="underline underline-offset-2">Check its status</Link> any time.
            </p>
          )}
          {result.kind === "duplicate" && (
            <p>
              Someone already sent this program; it is {result.status === "verifying" ? "being verified" : "queued"}.{" "}
              <Link href={`/submissions/${result.id}`} className="underline underline-offset-2">Check its status</Link>.
            </p>
          )}
          {result.kind === "listed" && (
            <p>
              Already on OpenAffiliate.{" "}
              <Link href={new URL(result.listingUrl).pathname} className="underline underline-offset-2">See the listing</Link>.
            </p>
          )}
          {result.kind === "error" && <p className="text-red-600 dark:text-red-400">{result.message}</p>}
        </div>
      )}
    </section>
  );
}
