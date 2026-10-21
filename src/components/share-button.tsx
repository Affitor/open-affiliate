"use client";

import { useState } from "react";
import { Check, Share } from "lucide-react";

/**
 * Share a page: the system share sheet where there is one (phones), else copy
 * the link. `path` is site-relative; the absolute URL uses the page's origin.
 */
export function ShareButton({ path, title, label = "Share", iconOnly = false, className = "" }: { path: string; title: string; label?: string; iconOnly?: boolean; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        const url = new URL(path, window.location.origin).href;
        try {
          if (navigator.share) {
            await navigator.share({ title, url });
            return;
          }
        } catch {
          /* cancelled or unsupported: fall back to copying */
        }
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          /* nothing more to do */
        }
      }}
      aria-label={iconOnly ? (copied ? "Link copied" : `Share ${title}`) : undefined}
      className={
        iconOnly
          ? `inline-grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-sunk hover:text-foreground transition-colors ${className}`
          : `inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-sunk transition-colors ${className}`
      }
    >
      {copied ? <Check className="h-3.5 w-3.5 text-good" aria-hidden /> : <Share className="h-3.5 w-3.5" aria-hidden />}
      {iconOnly ? null : copied ? "Link copied" : label}
    </button>
  );
}
