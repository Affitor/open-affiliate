"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { Input } from "@/components/ui/input";
import { parseCommissionMode } from "@/lib/commission-mode";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}

export interface ClaimTerms {
  rate: string;
  type: string;
  duration: string;
  cookieDays: string;
  payoutMinimum: string;
  signupUrl: string;
  note: string;
}

type Step = "loading" | "email" | "code" | "dns" | "dns-record" | "manual" | "manual-sent" | "owner" | "saved" | "released";
type Stats = { views: number | null; clicks: number | null };

const primary =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-foreground text-background px-4 py-2.5 text-sm font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:pointer-events-none";
const quiet = "text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors";
const field =
  "w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";
const label = "block text-xs font-medium text-muted-foreground mb-1.5";

let turnstileScript: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  turnstileScript ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      turnstileScript = null;
      reject(new Error("Turnstile did not load"));
    };
    document.head.appendChild(script);
  });
  return turnstileScript;
}

/** Cloudflare Turnstile. Tokens are single use: remount (new key) after each request. */
function Turnstile({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let id: string | undefined;
    let live = true;
    loadTurnstile()
      .then(() => {
        if (!live || !ref.current || !window.turnstile) return;
        id = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          callback: onToken,
          "expired-callback": () => onToken(""),
          "error-callback": () => onToken(""),
        });
      })
      .catch(() => onToken(""));
    return () => {
      live = false;
      if (id) window.turnstile?.remove(id);
    };
  }, [siteKey, onToken]);
  return <div ref={ref} className="min-h-[65px]" />;
}

function preview(terms: ClaimTerms): string {
  const parsed = parseCommissionMode(terms.rate);
  const shown =
    parsed.mode === "unknown"
      ? "Not published (no number we can read)"
      : parsed.mode === "percentage"
        ? `${parsed.value}%`
        : parsed.mode === "flat"
          ? `$${parsed.value?.toLocaleString()}`
          : terms.rate.trim();
  return `${shown} ${terms.type}${terms.duration.trim() ? `, ${terms.duration.trim()}` : ""}`;
}

const optionalNumber = (value: string) => (value.trim() === "" ? null : Number(value));

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

export function ClaimFlow({
  slug,
  name,
  domain,
  siteKey,
  initialTerms,
}: {
  slug: string;
  name: string;
  domain: string;
  siteKey: string;
  initialTerms: ClaimTerms;
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
  const [terms, setTerms] = useState(initialTerms);

  const showOwner = (owner: { stats: Stats | null } | null) => {
    if (owner) setStats(owner.stats);
    setStep(owner ? "owner" : "email");
  };
  const loadSession = () => fetchOwner(slug).then(showOwner);

  useEffect(() => {
    // Returning owners (cookie still valid) go straight to their panel.
    let live = true;
    fetchOwner(slug).then((owner) => {
      if (!live) return;
      if (owner) setStats(owner.stats);
      setStep(owner ? "owner" : "email");
    });
    return () => {
      live = false;
    };
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
      if (res.ok) onOk(data);
      else setError(res.status === 503 ? "Claims are not available right now." : (data.message ?? "Something went wrong. Try again."));
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
  const set = (key: keyof ClaimTerms) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setTerms((t) => ({ ...t, [key]: e.target.value }));

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
            <Turnstile key={widget} siteKey={siteKey} onToken={setToken} />
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
            <Turnstile key={widget} siteKey={siteKey} onToken={setToken} />
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

      {step === "manual" && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void call("manual", { email, note, turnstileToken: token }, () => go("manual-sent"));
          }}
        >
          <p className="text-sm text-muted-foreground">Tell us how you are connected to {name}. A person replies within 2 days.</p>
          {emailField("claim-manual-email", "Email", "you@example.com")}
          <div>
            <label htmlFor="claim-note" className={label}>How you run this program</label>
            <textarea id="claim-note" className={field} rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Turnstile key={widget} siteKey={siteKey} onToken={setToken} />
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className={primary} disabled={busy || !token}>Ask for review</button>
            <button type="button" className={quiet} onClick={() => go("email")}>Back</button>
          </div>
        </form>
      )}

      {step === "manual-sent" && (
        <p className="text-sm">Thanks. We reply from support@affitor.com within 2 days.</p>
      )}

      {step === "owner" && (
        <>
          <div>
            <h2 className="text-base font-semibold">Manage the {name} listing</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Verified for {domain}. A person checks every edit before the page changes, usually within 24 hours.
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
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void call(
                "terms",
                {
                  terms: {
                    rate: terms.rate,
                    type: terms.type,
                    duration: terms.duration.trim() || undefined,
                    cookieDays: optionalNumber(terms.cookieDays),
                    payoutMinimum: optionalNumber(terms.payoutMinimum),
                    signupUrl: terms.signupUrl.trim() || undefined,
                    note: terms.note.trim() || undefined,
                  },
                },
                () => go("saved"),
              );
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="t-rate" className={label}>Commission rate</label>
                <Input id="t-rate" required maxLength={80} value={terms.rate} onChange={set("rate")} placeholder="30%" />
              </div>
              <div>
                <label htmlFor="t-type" className={label}>Type</label>
                <select id="t-type" className={field} value={terms.type} onChange={set("type")}>
                  <option value="recurring">recurring</option>
                  <option value="one-time">one-time</option>
                  <option value="tiered">tiered</option>
                  <option value="hybrid">hybrid</option>
                </select>
              </div>
              <div>
                <label htmlFor="t-duration" className={label}>Duration</label>
                <Input id="t-duration" maxLength={60} value={terms.duration} onChange={set("duration")} placeholder="12 months" />
              </div>
              <div>
                <label htmlFor="t-cookie" className={label}>Cookie days</label>
                <Input id="t-cookie" type="number" min={0} max={3650} value={terms.cookieDays} onChange={set("cookieDays")} />
              </div>
              <div>
                <label htmlFor="t-payout" className={label}>Minimum payout (USD)</label>
                <Input id="t-payout" type="number" min={0} value={terms.payoutMinimum} onChange={set("payoutMinimum")} />
              </div>
              <div>
                <label htmlFor="t-signup" className={label}>Affiliate signup link</label>
                <Input id="t-signup" type="url" maxLength={500} value={terms.signupUrl} onChange={set("signupUrl")} placeholder="https://" />
              </div>
            </div>
            <div>
              <label htmlFor="t-note" className={label}>Anything else we should change</label>
              <textarea id="t-note" className={field} rows={3} maxLength={1000} value={terms.note} onChange={set("note")} />
            </div>
            <p className="text-xs text-muted-foreground">Your page will show: <span className="text-foreground">{preview(terms)}</span></p>
            <button type="submit" className={primary} disabled={busy}>Save terms</button>
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
          <p className="text-sm">Thanks. We check your edits and update the page, usually within 24 hours.</p>
          <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-3">
            <p className="text-sm">Run this program on Affitor. Free until your first $10,000 in affiliate revenue, then 3.5%.</p>
            <div className="flex flex-wrap items-center gap-3">
              <a href={`https://affitor.com/?utm_source=openaffiliate&utm_medium=claim&utm_campaign=${encodeURIComponent(slug)}`} className={primary}>
                Launch on Affitor
              </a>
              <Link href={`/programs/${slug}`} className={quiet}>Not now</Link>
            </div>
          </div>
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
