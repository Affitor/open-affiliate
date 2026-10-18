"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Turnstile } from "@/components/turnstile";
import { AffitorLink } from "@/components/affitor-link";
import { affitorUrl } from "@/lib/affitor-link";

type Stats = { views: number | null; clicks: number | null };
interface Account {
  domain: string;
  you: { id: string; email: string };
  maxMembers: number;
  otherAccounts: { memberId: string; domain: string }[];
  programs: { slug: string; name: string; editable: boolean; stats: Stats }[];
  members: { id: string; email: string; addedAt: string; you: boolean }[];
  changes: { slug: string; kind: string; status: string; prUrl: string | null; fields: string[]; sentAt: string }[];
}
type Step = "loading" | "email" | "code" | "account" | "released";

const primary =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-foreground text-background px-4 py-2.5 text-sm font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:pointer-events-none";
const outline =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted/40 transition-colors disabled:opacity-50 disabled:pointer-events-none";
const quiet = "text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors";
const label = "block text-xs font-medium text-muted-foreground mb-1.5";
const card = "rounded-xl border border-border/50 bg-card/30 p-5";

const STATUS: Record<string, string> = {
  pending: "Waiting for review",
  applied: "Live",
  rejected: "Not applied",
  asked: "Needs your reply",
};

const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** A change's public record is a pull request on the registry repo; anything else is not linked. */
const PR_URL = /^https:\/\/github\.com\/Affitor\/open-affiliate\/pull\/\d+$/;

async function fetchAccount(): Promise<Account | null> {
  try {
    const res = await fetch("/api/claims/account");
    const data = res.ok ? await res.json() : null;
    return data?.signedIn ? (data as Account) : null;
  } catch {
    return null;
  }
}

export function AccountFlow({ siteKey }: { siteKey: string }) {
  const [step, setStep] = useState<Step>("loading");
  const [account, setAccount] = useState<Account | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [teammate, setTeammate] = useState("");
  const [token, setToken] = useState("");
  const [widget, setWidget] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [confirmRelease, setConfirmRelease] = useState(false);

  const load = useCallback(async () => {
    const acct = await fetchAccount();
    setAccount(acct);
    setStep(acct ? "account" : "email");
  }, []);

  useEffect(() => {
    let live = true;
    fetchAccount().then((acct) => {
      if (!live) return;
      setAccount(acct);
      setStep(acct ? "account" : "email");
    });
    return () => {
      live = false;
    };
  }, []);

  async function call(action: string, body: Record<string, unknown>, onOk: () => void | Promise<void>) {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const res = await fetch(`/api/claims/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) await onOk();
      else setError(res.status === 503 ? "Accounts are not available right now." : (data.message ?? "Something went wrong. Try again."));
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

  return (
    // ph-no-capture: PostHog autocapture skips these forms.
    <div className="ph-no-capture space-y-6">
      {step === "loading" && <p className="text-sm text-muted-foreground">Loading…</p>}

      {step === "email" && (
        <div className="max-w-md space-y-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Sign in to manage your listing</h1>
            <p className="text-sm text-muted-foreground mt-2">Use the work email your team verified on OpenAffiliate. No password.</p>
          </div>
          <div>
            <label htmlFor="acct-email" className={label}>Work email</label>
            <Input id="acct-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Turnstile key={widget} siteKey={siteKey} action="signin" onToken={setToken} />
          <button
            className={primary}
            disabled={busy || !token || !email.trim()}
            onClick={() => void call("signin-code", { email, turnstileToken: token }, () => setStep("code"))}
          >
            Send code
          </button>
          <p className="text-sm text-muted-foreground">
            Not on OpenAffiliate yet? Find your program and choose <span className="text-foreground">Claim this page</span>.
          </p>
        </div>
      )}

      {step === "code" && (
        <div className="max-w-md space-y-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Enter your code</h1>
            <p className="text-sm text-muted-foreground mt-2">
              If {email} is on a team, a 6-digit code is on its way. It works for 10 minutes.
            </p>
          </div>
          <div>
            <label htmlFor="acct-code" className={label}>6-digit code</label>
            <Input
              id="acct-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="font-mono tracking-[0.4em] text-lg"
            />
          </div>
          <button className={primary} disabled={busy || code.trim().length < 6} onClick={() => void call("signin-verify", { code }, load)}>
            Sign in
          </button>
          <button className={quiet} onClick={() => { setCode(""); setStep("email"); }}>Use another address</button>
        </div>
      )}

      {step === "account" && account && (
        <>
          <div>
            <p className="text-xs text-muted-foreground">Your account</p>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{account.domain} on OpenAffiliate</h1>
            <p className="text-sm text-muted-foreground mt-1">
              You manage every program on {account.domain}. Signed in as {account.you.email}.{" "}
              <button className={quiet} onClick={() => void call("signout", {}, () => { setAccount(null); setStep("email"); })}>
                Sign out
              </button>
            </p>
            {account.otherAccounts.length > 0 && (
              <p className="text-sm text-muted-foreground mt-1">
                Also on your teams:{" "}
                {account.otherAccounts.map((o, i) => (
                  <span key={o.memberId}>
                    {i > 0 && ", "}
                    <button className={quiet} disabled={busy} onClick={() => void call("account-switch", { memberId: o.memberId }, load)}>
                      {o.domain}
                    </button>
                  </span>
                ))}
              </p>
            )}
          </div>

          <section className="space-y-3">
            <h2 className="text-base font-semibold">Programs</h2>
            {account.programs.map((p) => (
              <div key={p.slug} className={`${card} flex flex-wrap items-center justify-between gap-4`}>
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">Claimed by {account.domain}</p>
                </div>
                <dl className="flex gap-6">
                  {p.stats.views != null && (
                    <div>
                      <dt className="text-[10px] text-muted-foreground uppercase tracking-wide">Page views, 90 days</dt>
                      <dd className="text-sm font-semibold">{p.stats.views.toLocaleString()}</dd>
                    </div>
                  )}
                  {p.stats.clicks != null && (
                    <div>
                      <dt className="text-[10px] text-muted-foreground uppercase tracking-wide">Apply clicks, 90 days</dt>
                      <dd className="text-sm font-semibold">{p.stats.clicks.toLocaleString()}</dd>
                    </div>
                  )}
                </dl>
                <div className="flex items-center gap-3">
                  {p.editable && <Link href={`/programs/${p.slug}/claim`} className={outline}>Edit</Link>}
                  <Link href={`/programs/${p.slug}`} className={quiet}>View page</Link>
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Numbers count visits to your OpenAffiliate pages and clicks on their apply button.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold">Changes</h2>
            {account.changes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No changes sent yet. We check every change before it goes live.</p>
            ) : (
              <ul className="divide-y divide-border/50 text-sm">
                {account.changes.map((c, i) => (
                  <li key={i} className="py-3 flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {date(c.sentAt)} · {c.slug} · {c.kind === "new" ? "New program" : c.fields.join(", ") || "Edit"}
                    </span>
                    <span className="text-muted-foreground">
                      {STATUS[c.status] ?? c.status}
                      {c.prUrl && PR_URL.test(c.prUrl) && (
                        <>
                          {" · "}
                          <a href={c.prUrl} className={quiet} target="_blank" rel="noreferrer">Public record</a>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold">Team</h2>
            <p className="text-sm text-muted-foreground">
              Up to {account.maxMembers} people, each with an @{account.domain} address. Everyone signs in with a code.
            </p>
            <ul className="divide-y divide-border/50 text-sm">
              {account.members.map((m) => (
                <li key={m.id} className="py-3 flex items-center justify-between gap-3">
                  <span>
                    {m.email} <span className="text-muted-foreground">· {m.you ? "you" : `added ${date(m.addedAt)}`}</span>
                  </span>
                  {!m.you && (
                    <button
                      className={quiet}
                      disabled={busy}
                      aria-label={`Remove ${m.email}`}
                      onClick={() => void call("member-remove", { domain: account.domain, memberId: m.id }, load)}
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {account.members.length < account.maxMembers ? (
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[220px]">
                  <label htmlFor="acct-teammate" className={label}>Add teammate</label>
                  <Input
                    id="acct-teammate"
                    type="email"
                    placeholder={`name@${account.domain}`}
                    value={teammate}
                    onChange={(e) => setTeammate(e.target.value)}
                  />
                </div>
                <button
                  className={outline}
                  disabled={busy || !teammate.trim()}
                  onClick={() =>
                    void call("member-add", { domain: account.domain, email: teammate }, async () => {
                      setTeammate("");
                      setNote("Added. They can sign in with their own address.");
                      await load();
                    })
                  }
                >
                  Add teammate
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Your team is full. Remove someone to add a new teammate.</p>
            )}
          </section>

          <section className={`${card} space-y-2`}>
            <h2 className="text-base font-semibold">Works with the Affitor network</h2>
            <p className="text-sm text-muted-foreground">
              Affitor runs affiliate programs for SaaS teams: connect Stripe, set the commission, and list the program in a
              marketplace where affiliates look for programs to join.
            </p>
            {account.programs[0] && (
              <AffitorLink
                href={affitorUrl("claim", account.programs[0].slug)}
                source="claim"
                slug={account.programs[0].slug}
                cta="account"
                className={quiet}
              >
                Run your program on Affitor
              </AffitorLink>
            )}
          </section>

          <section className={`${card} space-y-3`}>
            <h2 className="text-base font-semibold">Release this page</h2>
            <p className="text-sm text-muted-foreground">
              Your team stops managing the {account.domain} programs. The pages stay up, and anyone at {account.domain} can
              claim them again.
            </p>
            {confirmRelease ? (
              <div className="flex flex-wrap items-center gap-3">
                <button className={primary} disabled={busy} onClick={() => void call("release", { domain: account.domain }, () => { setAccount(null); setStep("released"); })}>
                  Release
                </button>
                <button className={quiet} onClick={() => setConfirmRelease(false)}>Cancel</button>
              </div>
            ) : (
              <button className={outline} onClick={() => setConfirmRelease(true)}>Release this page</button>
            )}
          </section>
        </>
      )}

      {step === "released" && (
        <p className="text-sm">
          You released the listings and we removed every teammate&apos;s address from them.{" "}
          <Link href="/" className={quiet}>Back to OpenAffiliate</Link>
        </p>
      )}

      {note && <p className="text-sm text-muted-foreground">{note}</p>}
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
