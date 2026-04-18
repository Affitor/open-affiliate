"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { track } from "@/lib/track";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { categories as registryCategories } from "@/lib/programs";

export default function SubmitPage() {
  useEffect(() => { track("page_view"); }, []);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    url: "",
    category: "Developer Tools",
    commissionType: "recurring",
    commissionRate: "",
    cookieDays: "30",
    payoutMinimum: "50",
    payoutFrequency: "monthly",
    description: "",
    agentPrompt: "",
    keywords: "",
    tags: "",
    signupUrl: "",
    submittedBy: "",
  });
  const [copied, setCopied] = useState(false);

  const updateField = (field: string, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // Auto-generate slug from name
      if (field === "name") {
        next.slug = value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
      }
      return next;
    });
  };

  const categories = registryCategories;

  const generateYaml = () => {
    const keywords = form.keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    const tags = form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    return `name: "${form.name}"
slug: ${form.slug}
url: https://${form.url.replace(/^https?:\/\//, "")}
category: ${form.category}
verified: false

commission:
  type: ${form.commissionType}
  rate: ${form.commissionRate}
  currency: USD
cookie_days: ${form.cookieDays}

payout:
  minimum: ${form.payoutMinimum}
  frequency: ${form.payoutFrequency}

short_description: "${form.description.slice(0, 120)}"
description: |
  ${form.description}

signup_url: https://${(form.signupUrl || form.url).replace(/^https?:\/\//, "")}
approval: manual
approval_time: 1-3 days

agents:
  prompt: "${form.agentPrompt}"
  keywords: [${keywords.map((k) => `"${k}"`).join(", ")}]

tags: [${tags.map((t) => `"${t}"`).join(", ")}]
submitted_by: "${form.submittedBy}"
created_at: "${new Date().toISOString().split("T")[0]}"`;
  };

  const copyYaml = () => {
    navigator.clipboard.writeText(generateYaml());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openGitHubPR = () => {
    const yaml = generateYaml();
    const filename = `programs/${form.slug}.yaml`;
    const body = encodeURIComponent(
      `## New Program: ${form.name}\n\n- URL: ${form.url}\n- Commission: ${form.commissionRate}% ${form.commissionType}\n- Category: ${form.category}\n\n### YAML\n\`\`\`yaml\n${yaml}\n\`\`\``
    );
    const title = encodeURIComponent(`Add ${form.name} to registry`);
    window.open(
      `https://github.com/Affitor/open-affiliate/new/main?filename=${filename}&value=${encodeURIComponent(yaml)}&message=${title}&description=${body}`,
      "_blank"
    );
  };

  const isValid =
    form.name && form.url && form.commissionRate && form.description;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Submit a program</h1>
      <p className="text-sm text-muted-foreground mt-2">
        Add your affiliate program to the open registry. Fill out the form to
        generate a YAML file, then open a PR.
      </p>

      <Link
        href="/docs/submit"
        className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border/40 bg-muted/20 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
      >
        <BookOpen className="h-3.5 w-3.5" />
        Read the submission guide — including how to let your AI agent submit for you
      </Link>

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
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              Affiliate signup URL
            </label>
            <Input
              placeholder="yourproduct.com/affiliates"
              value={form.signupUrl}
              onChange={(e) => updateField("signupUrl", e.target.value)}
              className="bg-muted/50 border-border/50"
            />
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
                Rate (%)
              </label>
              <Input
                placeholder="25"
                value={form.commissionRate}
                onChange={(e) => updateField("commissionRate", e.target.value)}
                className="bg-muted/50 border-border/50"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">
                Cookie days
              </label>
              <Input
                placeholder="30"
                value={form.cookieDays}
                onChange={(e) => updateField("cookieDays", e.target.value)}
                className="bg-muted/50 border-border/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">
                Min payout ($)
              </label>
              <Input
                placeholder="50"
                value={form.payoutMinimum}
                onChange={(e) => updateField("payoutMinimum", e.target.value)}
                className="bg-muted/50 border-border/50"
              />
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
                <option value="monthly">Monthly</option>
                <option value="bi-weekly">Bi-weekly</option>
                <option value="net-30">Net 30</option>
                <option value="net-60">Net 60</option>
              </select>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="rounded-xl border border-border/50 bg-card/30 p-6 space-y-4">
          <h2 className="text-sm font-semibold">Details</h2>

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
      </div>

      {/* Guidelines */}
      <div className="mt-10 rounded-xl border border-border/40 bg-muted/10 p-6">
        <h3 className="text-sm font-semibold mb-3">Submission guidelines</h3>
        <ul className="text-sm text-muted-foreground space-y-2">
          <li>Program must have a public affiliate signup page</li>
          <li>Include accurate commission rates and cookie duration</li>
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
            badge is added after team review
          </li>
        </ul>
      </div>
    </div>
  );
}
