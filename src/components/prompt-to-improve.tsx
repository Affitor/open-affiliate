"use client";

import { useState } from "react";
import { Check, Copy, WandSparkles } from "lucide-react";
import { posthog } from "@/lib/posthog";

/**
 * Prompt to improve: the Markdown a brand pastes to its team or AI agent
 * (improvePrompt in src/lib/oas.ts). Only the slug is recorded when it is
 * copied, never who copied it.
 */
export function PromptToImprove({ slug, text }: { slug: string; text: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-10 w-full sm:w-auto sm:min-w-56 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background hover:opacity-90 transition-opacity"
      >
        <WandSparkles className="h-4 w-4" aria-hidden />
        Prompt to improve
      </button>
      {open && (
        <div className="mt-3 rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span className="text-sm font-medium">Prompt to improve</span>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(text);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                  try { posthog.capture("oas_prompt_copied", { slug }) } catch { /* analytics never blocks copying */ }
                } catch {
                  /* clipboard unavailable: the text stays selectable below */
                }
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-sunk transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-good" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
              {copied ? "Copied" : "Copy prompt"}
            </button>
          </div>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words border-t border-border px-4 py-3 font-mono text-xs leading-relaxed text-foreground/80">{text}</pre>
        </div>
      )}
    </div>
  );
}
