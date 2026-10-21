"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { Turnstile } from "@/components/turnstile";
import { Input } from "@/components/ui/input";
import { AffitorLink } from "@/components/affitor-link";
import { affitorUrl } from "@/lib/affitor-link";
import { capture } from "@/lib/track";
import { changesFrom, touchesMoney, type ProgramValues } from "@/lib/claims/form";
import {
  EarnSection,
  FitSection,
  JoinSection,
  PromoteSection,
  RulesSection,
  Section,
  StatusSection,
  type SetValue,
} from "@/components/claims/program-fields";

type Step =
  | "loading"
  | "email"
  | "code"
  | "dns"
  | "dns-record"
  | "manual"
  | "manual-sent"
  | "managed"
  | "report"
  | "owner"
  | "saved"
  | "released";
type Stats = { views: number | null; clicks: number | null };

const primary =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-foreground text-background px-4 py-2.5 text-sm font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:pointer-events-none";
const quiet = "text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors";
const field =
  "w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";
const label = "block text-xs font-medium text-muted-foreground mb-1.5";

/** The owner session for this listing, or null (no cookie, released, or another domain). */
async function fetchOwner(slug: string): Promise<{ stats: Stats | null } | null> {
  try {
    const res = await fetch(`/api/claims/session?slug=${encodeURIComponent(slug)}`);
    const data = res.ok ? await res.json() : null;
    return data?.owner ? { stats: data.stats ?? null } : null;
  } catch {
    return null;
  }
}

// Funnel events by claims action: a claim starts when its first step is
// accepted and is done when the server confirms the owner. A report is not a claim.
const CLAIM_EVENTS: Record<string, [event: string, method: string]> = {
  "send-code": ["claim_start", "email"],
  "dns-start": ["claim_start", "dns"],
  manual: ["claim_start", "manual"],
  verify: ["claim_done", "email"],
  "dns-check": ["claim_done", "dns"],
};

export function ClaimFlow({
  slug,
  name,
  domain,
  siteKey,
  initialValues,
  synced,
  onAffitor,
  claimedBy,
  replyTo,
}: {
  slug: string;
  name: string;
  domain: string;
  siteKey: string;
  /** The listing as a reader sees it; an edit sends only what differs from this. */
  initialValues: ProgramValues;
  /** network: affitor: the daily sync owns the terms (spec v4 §5.2). */
  synced: boolean;
  /** Already on Affitor: no offer line (spec v4 §3). */
  onAffitor: boolean;
  /** The domain whose team manages this listing, per the registry. */
  claimedBy: string | null;
  /** Where replies to our mail go (OA_CLAIM_REPLY_TO). */
  replyTo: string;
}) {
  const [step, setStep] = useState<Step>("loading");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [record, setRecord] = useState("");
  const [token, setToken] = useState("");
  const [widget, setWidget] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [values, setValues] = useState(initialValues);
  const [termsUrl, setTermsUrl] = useState("");
  const [editNote, setEditNote] = useState("");

  const setValue: SetValue = (key, value) => setValues((v) => ({ ...v, [key]: value }));
  const changes = changesFrom(initialValues, values);
  const changed = Object.keys(changes).length > 0;
  const money = touchesMoney(changes);

  // Returning owners (cookie still valid) go straight to their panel; a
  // "Report this page" link (#report) opens the report form; a page another
  // team manages says so instead of offering a claim that would be refused.
  const firstStep = (owner: boolean): Step =>
    owner ? "owner" : window.location.hash === "#report" ? "report" : claimedBy ? "managed" : "email";
  const showOwner = (owner: { stats: Stats | null } | null) => {
    if (owner) setStats(owner.stats);
    setStep(owner ? "owner" : "email");
  };
  const loadSession = () => fetchOwner(slug).then(showOwner);

  useEffect(() => {
    let live = true;
    fetchOwner(slug).then((owner) => {
      if (!live) return;
      if (owner) setStats(owner.stats);
      setStep(firstStep(Boolean(owner)));
    });
    return () => {
      live = false;
    };
    // firstStep reads only props and the URL hash, both fixed for this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function call(action: string, body: Record<string, unknown>, onOk: (data: Record<string, unknown>) => void) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/claims/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const funnel = CLAIM_EVENTS[action];
        if (funnel && !body.report) capture(funnel[0], { slug, method: funnel[1] });
        onOk(data);
      } else setError(res.status === 503 ? "Claims are not available right now." : (data.message ?? "Something went wrong. Try again."));
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
      if ("turnstileToken" in body) {
        setToken("");
        setWidget((n) => n + 1);
      }
    }
  }

  const go = (next: Step) => {
    setError("");
    setStep(next);
  };

  const emailField = (id: string, text: string, placeholder: string) => (
    <div>
      <label htmlFor={id} className={label}>{text}</label>
      <Input id={id} type="email" autoComplete="email" required value={email} placeholder={placeholder} onChange={(e) => setEmail(e.target.value)} />
    </div>
  );

  return (
    // ph-no-capture: PostHog autocapture skips this form.
    <div className="ph-no-capture rounded-xl border border-border/50 bg-card/30 p-5 space-y-4">
      {step === "loading" && <p className="text-sm text-muted-foreground">Loading…</p>}

      {step === "email" && (
        <>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void call("send-code", { email, turnstileToken: token }, () => go("code"));
            }}
          >
            {emailField("claim-email", `Work email at ${domain}`, `you@${domain}`)}
            <Turnstile key={widget} siteKey={siteKey} action="send-code" onToken={setToken} />
            <button type="submit" className={primary} disabled={busy || !token}>Send code</button>
          </form>
          <p className="text-sm text-muted-foreground">
            No address at {domain}?{" "}
            <button type="button" className={quiet} onClick={() => go("dns")}>Verify with DNS</button>
            {" · "}
            <button type="button" className={quiet} onClick={() => go("manual")}>Ask for a manual review</button>
          </p>
        </>
      )}

      {step === "code" && (
        <>
          <p className="text-sm text-muted-foreground">We sent a 6-digit code to {email}. It works for 10 minutes.</p>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void call("verify", { code }, () => void loadSession());
            }}
          >
            <div>
              <label htmlFor="claim-code" className={label}>Code</label>
              <Input
                id="claim-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="max-w-40 tracking-widest"
              />
            </div>
            <button type="submit" className={primary} disabled={busy || code.length !== 6}>Verify</button>
          </form>
          <p className="text-sm text-muted-foreground">
            No email? We send one code per address per day.{" "}
            <button type="button" className={quiet} onClick={() => go("dns")}>Verify with DNS</button>
            {" · "}
            <button type="button" className={quiet} onClick={() => go("manual")}>Ask for a manual review</button>
          </p>
        </>
      )}

      {step === "dns" && (
        <>
          <p className="text-sm text-muted-foreground">
            Add a TXT record at {domain} to prove you run it. The email below is only how we reach you about your edits.
          </p>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void call("dns-start", { email, turnstileToken: token }, (data) => {
                setRecord(String(data.record ?? ""));
                go("dns-record");
              });
            }}
          >
            {emailField("claim-dns-email", "Contact email", "you@example.com")}
            <Turnstile key={widget} siteKey={siteKey} action="dns-start" onToken={setToken} />
            <button type="submit" className={primary} disabled={busy || !token}>Get DNS record</button>
          </form>
          <p className="text-sm text-muted-foreground">
            <button type="button" className={quiet} disabled={busy} onClick={() => void call("dns-check", {}, () => void loadSession())}>
              I added it already. Check DNS
            </button>
            {" · "}
            <button type="button" className={quiet} onClick={() => go("email")}>Use email instead</button>
          </p>
        </>
      )}

      {step === "dns-record" && (
        <>
          <p className="text-sm text-muted-foreground">Add this TXT record at <strong className="text-foreground">{domain}</strong> (host <code>@</code>):</p>
          <div className="rounded-lg bg-muted/50 border border-border/50 px-3 py-2 flex items-center justify-between gap-2">
            <code className="text-xs font-mono break-all">{record}</code>
            <CopyButton text={record} />
          </div>
          <p className="text-xs text-muted-foreground">
            DNS changes can take a few hours to show. You can close this page and check again from this browser within 7 days.
          </p>
          <button type="button" className={primary} disabled={busy} onClick={() => void call("dns-check", {}, () => void loadSession())}>
            Check DNS
          </button>
        </>
      )}

      {step === "managed" && (
        <>
          <p className="text-sm">
            This page is managed by the <strong>{claimedBy}</strong> team. Ask a teammate to add you from their account.
          </p>
          <p className="text-sm text-muted-foreground">
            <button type="button" className={quiet} onClick={() => go("manual")}>Ask for a manual review</button>
            {" · "}
            <button type="button" className={quiet} onClick={() => go("report")}>Report this page</button>
          </p>
        </>
      )}

      {(step === "manual" || step === "report") && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void call("manual", { email, note, report: step === "report", turnstileToken: token }, () => go("manual-sent"));
          }}
        >
          <p className="text-sm text-muted-foreground">
            {step === "report"
              ? `Tell us what is wrong with the ${name} page: wrong terms, or the wrong team managing it. A person replies within 2 days.`
              : `Tell us how you are connected to ${name}. A person replies within 2 days.`}
          </p>
          {emailField("claim-manual-email", "Email", "you@example.com")}
          <div>
            <label htmlFor="claim-note" className={label}>{step === "report" ? "What is wrong" : "How you run this program"}</label>
            <textarea id="claim-note" className={field} rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Turnstile key={widget} siteKey={siteKey} action="manual" onToken={setToken} />
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className={primary} disabled={busy || !token}>{step === "report" ? "Send report" : "Ask for review"}</button>
            <button type="button" className={quiet} onClick={() => go(claimedBy ? "managed" : "email")}>Back</button>
          </div>
        </form>
      )}

      {step === "manual-sent" && (
        <p className="text-sm">Thanks. We reply from {replyTo} within 2 days.</p>
      )}

      {step === "owner" && (
        <>
          <div>
            <h2 className="text-base font-semibold">Manage the {name} listing</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Verified for {domain}. Changes go live after we check them, usually within two business days. Name, website and
              category: ask for a manual review.
            </p>
            <p className="text-sm mt-1">
              <Link href="/account" className={quiet}>Open your account</Link>
              <span className="text-muted-foreground"> to add teammates and see every program on {domain}.</span>
            </p>
          </div>
          {stats && (stats.views != null || stats.clicks != null) && (
            <dl className="flex flex-wrap gap-6">
              {stats.views != null && (
                <div>
                  <dt className="text-[10px] text-muted-foreground uppercase tracking-wide">Page views, 90 days</dt>
                  <dd className="text-sm font-semibold">{stats.views.toLocaleString()}</dd>
                </div>
              )}
              {stats.clicks != null && (
                <div>
                  <dt className="text-[10px] text-muted-foreground uppercase tracking-wide">Apply clicks, 90 days</dt>
                  <dd className="text-sm font-semibold">{stats.clicks.toLocaleString()}</dd>
                </div>
              )}
            </dl>
          )}
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void call(
                "edit",
                { changes, termsUrl: termsUrl.trim() || undefined, note: editNote.trim() || undefined },
                () => go("saved"),
              );
            }}
          >
            {synced ? (
              <Section title="What you earn">
                <p className="text-sm text-muted-foreground">
                  Edit these terms in your Affitor dashboard. OpenAffiliate updates daily.
                </p>
              </Section>
            ) : (
              <EarnSection id="edit" values={values} set={setValue} termsUrl={termsUrl} setTermsUrl={setTermsUrl} termsRequired={money} />
            )}
            <PromoteSection id="edit" values={values} set={setValue} />
            <FitSection id="edit" values={values} set={setValue} />
            {!synced && (
              <>
                <JoinSection id="edit" values={values} set={setValue} />
                <RulesSection id="edit" values={values} set={setValue} />
                <StatusSection id="edit" values={values} set={setValue} />
              </>
            )}
            <div>
              <label htmlFor="edit-note" className={label}>Anything else we should know (optional)</label>
              <textarea id="edit-note" className={field} rows={2} maxLength={1000} value={editNote} onChange={(e) => setEditNote(e.target.value)} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className={primary} disabled={busy || !changed || (money && !termsUrl.trim())}>
                Save changes
              </button>
              {!changed && <span className="text-xs text-muted-foreground">Change a field to send it for review.</span>}
            </div>
          </form>
          <button
            type="button"
            className={quiet}
            disabled={busy}
            onClick={() => {
              if (window.confirm("Release this listing? You will need to verify again to edit it.")) {
                void call("release", {}, () => go("released"));
              }
            }}
          >
            Release listing
          </button>
        </>
      )}

      {step === "saved" && (
        <>
          <p className="text-sm">
            Thanks. We check your changes and update the page, usually within two business days. You can follow them in{" "}
            <Link href="/account" className={quiet}>your account</Link>.
          </p>
          {/* Claim spec v4 §3: the offer line without a price, only for programs not already on Affitor. */}
          {!onAffitor && (
            <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-2">
              <p className="text-sm">Works with the Affitor network.</p>
              <AffitorLink href={affitorUrl("claim", slug)} source="claim" slug={slug} cta="launch" className={quiet}>
                Run {name} on Affitor
              </AffitorLink>
            </div>
          )}
          <Link href={`/programs/${slug}`} className={quiet}>Back to the listing</Link>
        </>
      )}

      {step === "released" && (
        <p className="text-sm">
          You released the {name} listing and we removed your email address from it.{" "}
          <Link href={`/programs/${slug}`} className={quiet}>Back to the listing</Link>
        </p>
      )}

      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
