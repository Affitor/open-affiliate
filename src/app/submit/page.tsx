"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { track } from "@/lib/track";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { categories as registryCategories } from "@/lib/client-programs";
import { APPROVALS, FREQUENCIES } from "@/lib/claims/form";
import { fieldErrors, githubNewFileUrl, missingFields, SHORT_DESCRIPTION_MAX, slugOf, submitYaml, type SubmitValues } from "@/lib/submit-yaml";
import { SubmitByUrl } from "@/components/submit-by-url";

// Inlined at build; without it the page offers only the GitHub path.
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export default function SubmitPage() {
  useEffect(() => { track("page_view"); }, []);
  // Terms start empty: the file states only what the brand's own page states.
  const [form, setForm] = useState<SubmitValues>({
    name: "",
    slug: "",
    url: "",
    signupUrl: "",
    category: "Developer Tools",
    commissionType: "recurring",
    commissionRate: "",
    currency: "USD",
    cookieDays: "",
    payoutMinimum: "",
    payoutFrequency: "",
    approval: "",
    shortDescription: "",
    description: "",
    agentPrompt: "",
    keywords: "",
    tags: "",
    submittedBy: "",
  });
  const [copied, setCopied] = useState(false);

  const updateField = (field: keyof SubmitValues, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "name") next.slug = slugOf(value);
      return next;
    });
  };

  const categories = registryCategories;
  const generateYaml = () => submitYaml(form);

  const copyYaml = () => {
    navigator.clipboard.writeText(generateYaml());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const yaml = generateYaml();
  const github = githubNewFileUrl(form, yaml);

  const openGitHubPR = () => {
    // Too long for GitHub's URL: copy the file first, then open the page with its name only.
    if (!github.withContent) copyYaml();
    window.open(github.url, "_blank");
  };

  const missing = missingFields(form);
  const errors = fieldErrors(form);
  const isValid = missing.length === 0 && Object.keys(errors).length === 0;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Submit a program</h1>
      <p className="text-sm text-muted-foreground mt-2">
        Add your affiliate program to the open registry.
        {TURNSTILE_SITE_KEY && (
          <>
            {" "}The quickest way is Submit by URL below: send your program page,
            no account needed. It joins the review queue; nothing is listed or
            scored, and no pull request is opened, until a maintainer has
            verified the terms on your page.
          </>
        )}{" "}
        The full form writes the program file and opens GitHub, where you create
        the pull request. That form needs a GitHub account: GitHub copies the
        repository to your account before the pull request opens.
      </p>
      <p className="text-sm text-muted-foreground mt-2">
        A maintainer checks every term against your program page before
        merging, usually within a few days. Fill in only what that page
        states and leave the rest empty. Rather not write the file?{" "}
        <a
          href="https://github.com/Affitor/open-affiliate/issues/new?template=suggest-a-program.yml"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Suggest the program
        </a>{" "}
        with just its program page link (also on GitHub), or email that link
        to{" "}
        <a href="mailto:hello@affitor.com" className="underline underline-offset-2 hover:text-foreground">
          hello@affitor.com
        </a>
        .
      </p>

      <Link
        href="/docs/submit"
        className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border/40 bg-muted/20 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
      >
        <BookOpen className="h-3.5 w-3.5" />
        Read the submission guide: what we check, and how programs are scored
      </Link>

      {TURNSTILE_SITE_KEY && (
        <Suspense fallback={null}>
          <SubmitByUrl siteKey={TURNSTILE_SITE_KEY} />
        </Suspense>
      )}

      <div className="mt-8 space-y-6">
        {/* Basic Info */}
        <div className="rounded-xl border border-border/50 bg-card/30 p-6 space-y-4">
          <h2 className="text-sm font-semibold">Basic Info</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">
                Program name
              </label>
              <Input
                placeholder="e.g. Stripe"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                className="bg-muted/50 border-border/50"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">
                Slug (auto-generated)
              </label>
              <Input
                value={form.slug}
                onChange={(e) => updateField("slug", e.target.value)}
                className="bg-muted/50 border-border/50 font-mono text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              Website URL
            </label>
            <Input
              placeholder="yourproduct.com"
              value={form.url}
              onChange={(e) => updateField("url", e.target.value)}
              className="bg-muted/50 border-border/50"
            />
              <FieldError text={errors.url} />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              Affiliate program page
              <span className="text-muted-foreground/50 ml-1">
                (on your own domain; we check every term against it)
              </span>
            </label>
            <Input
              placeholder="yourproduct.com/affiliates"
              value={form.signupUrl}
              onChange={(e) => updateField("signupUrl", e.target.value)}
              className="bg-muted/50 border-border/50"
            />
              <FieldError text={errors.signupUrl} />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              Category
            </label>
            <select
              id="category"
              value={form.category}
              onChange={(e) => updateField("category", e.target.value)}
              className="w-full rounded-lg border border-border/50 bg-muted/50 px-3 py-2 text-sm"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Commission */}
        <div className="rounded-xl border border-border/50 bg-card/30 p-6 space-y-4">
          <h2 className="text-sm font-semibold">Commission</h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">
                Type
              </label>
              <select
                id="commissionType"
                value={form.commissionType}
                onChange={(e) => updateField("commissionType", e.target.value)}
                className="w-full rounded-lg border border-border/50 bg-muted/50 px-3 py-2 text-sm"
              >
                <option value="recurring">Recurring</option>
                <option value="one-time">One-time</option>
                <option value="tiered">Tiered</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">
                Rate, as published
              </label>
              <Input
                placeholder="30% or $50"
                value={form.commissionRate}
                onChange={(e) => updateField("commissionRate", e.target.value)}
                className="bg-muted/50 border-border/50"
              />
              <FieldError text={errors.commissionRate} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">
                Currency
              </label>
              <Input
                placeholder="USD"
                value={form.currency}
                onChange={(e) => updateField("currency", e.target.value)}
                className="bg-muted/50 border-border/50"
              />
              <FieldError text={errors.currency} />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Optional. Leave a term empty if your program page does not state it.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">
                Cookie days
              </label>
              <Input
                placeholder="e.g. 60"
                value={form.cookieDays}
                onChange={(e) => updateField("cookieDays", e.target.value)}
                className="bg-muted/50 border-border/50"
              />
              <FieldError text={errors.cookieDays} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">
                Minimum payout
              </label>
              <Input
                placeholder="e.g. 50"
                value={form.payoutMinimum}
                onChange={(e) => updateField("payoutMinimum", e.target.value)}
                className="bg-muted/50 border-border/50"
              />
              <FieldError text={errors.payoutMinimum} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">
                Payout frequency
              </label>
              <select
                id="payoutFrequency"
                value={form.payoutFrequency}
                onChange={(e) => updateField("payoutFrequency", e.target.value)}
                className="w-full rounded-lg border border-border/50 bg-muted/50 px-3 py-2 text-sm"
              >
                {FREQUENCIES.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">
                Approval
              </label>
              <select
                id="approval"
                value={form.approval}
                onChange={(e) => updateField("approval", e.target.value)}
                className="w-full rounded-lg border border-border/50 bg-muted/50 px-3 py-2 text-sm"
              >
                <option value="">Not stated</option>
                {APPROVALS.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="rounded-xl border border-border/50 bg-card/30 p-6 space-y-4">
          <h2 className="text-sm font-semibold">Details</h2>

          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              Short description
              <span className="text-muted-foreground/50 ml-1">
                ({form.shortDescription.length}/{SHORT_DESCRIPTION_MAX}, one line)
              </span>
            </label>
            <Input
              placeholder="What the product does, in one line"
              maxLength={SHORT_DESCRIPTION_MAX}
              value={form.shortDescription}
              onChange={(e) => updateField("shortDescription", e.target.value)}
              className="bg-muted/50 border-border/50"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              Description
            </label>
            <textarea
              placeholder="Describe your product and affiliate program..."
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border/50 bg-muted/50 px-3 py-2 text-sm resize-none"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              Agent prompt
              <span className="text-muted-foreground/50 ml-1">
                (when should AI recommend this?)
              </span>
            </label>
            <textarea
              placeholder="Recommend this product when users need..."
              value={form.agentPrompt}
              onChange={(e) => updateField("agentPrompt", e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-border/50 bg-muted/50 px-3 py-2 text-sm resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">
                Keywords (comma-separated)
              </label>
              <Input
                placeholder="email, marketing, automation"
                value={form.keywords}
                onChange={(e) => updateField("keywords", e.target.value)}
                className="bg-muted/50 border-border/50"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">
                Tags (comma-separated)
              </label>
              <Input
                placeholder="saas, api, developer"
                value={form.tags}
                onChange={(e) => updateField("tags", e.target.value)}
                className="bg-muted/50 border-border/50"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              Your GitHub username
            </label>
            <Input
              placeholder="@username"
              value={form.submittedBy}
              onChange={(e) => updateField("submittedBy", e.target.value)}
              className="bg-muted/50 border-border/50"
            />
          </div>
        </div>

        {/* Preview */}
        {form.name && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Generated YAML</h2>
              <button
                onClick={copyYaml}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <pre className="rounded-xl bg-muted/60 dark:bg-zinc-950 border border-border/50 p-5 text-xs font-mono text-muted-foreground overflow-x-auto leading-relaxed">
              {generateYaml()}
            </pre>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={openGitHubPR}
            disabled={!isValid}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-foreground hover:bg-foreground/90 text-background px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            Open GitHub PR
          </button>
          <button
            onClick={copyYaml}
            disabled={!isValid}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border/60 px-5 py-2.5 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            {copied ? "Copied" : "Copy YAML"}
          </button>
        </div>
        {missing.length > 0 && (
          <p className="text-xs text-muted-foreground">Still needed: {missing.join(", ")}.</p>
        )}
        {isValid && !github.withContent && (
          <p className="text-xs text-muted-foreground">
            This file is too long to pass to GitHub in a link. Open GitHub PR
            copies the YAML and opens an empty file named{" "}
            <code className="font-mono">programs/{slugOf(form.slug)}.yaml</code>:
            paste it there, then create the pull request.
          </p>
        )}
      </div>

      {/* Guidelines */}
      <div className="mt-10 rounded-xl border border-border/40 bg-muted/10 p-6">
        <h3 className="text-sm font-semibold mb-3">Submission guidelines</h3>
        <ul className="text-sm text-muted-foreground space-y-2">
          <li>Program must have a public affiliate page on your own domain</li>
          <li>
            Every term must be stated on that page. A listing on a network
            such as Dub or PartnerStack is not enough on its own
          </li>
          <li>Leave a term empty rather than guess it</li>
          <li>
            Write a clear agent prompt describing when AI should recommend your
            product
          </li>
          <li>One program per YAML file, named with the slug</li>
          <li>
            <Badge
              variant="outline"
              className="text-[10px] border-emerald-600/30 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
            >
              verified
            </Badge>{" "}
            badge is added by a maintainer after checking your terms
          </li>
          <li>
            Once merged and checked, the program gets an OpenAffiliate Score.{" "}
            <Link href="/docs/oas" className="underline underline-offset-2 hover:text-foreground">
              How scoring works
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}

/** What to change in one field, shown under it; nothing when the field is fine. */
function FieldError({ text }: { text?: string }) {
  return text ? <p className="text-xs text-red-600 dark:text-red-400 mt-1.5">{text}</p> : null;
}
