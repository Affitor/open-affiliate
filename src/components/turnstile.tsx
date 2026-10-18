"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}

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

/**
 * Cloudflare Turnstile. Tokens are single use: remount (new key) after each
 * request. `action` names the step; the server refuses a token solved for
 * another step.
 */
export function Turnstile({ siteKey, action, onToken }: { siteKey: string; action: string; onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let id: string | undefined;
    let live = true;
    loadTurnstile()
      .then(() => {
        if (!live || !ref.current || !window.turnstile) return;
        id = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          action,
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
  }, [siteKey, action, onToken]);
  return <div ref={ref} className="min-h-[65px]" />;
}
