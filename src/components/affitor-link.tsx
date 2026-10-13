"use client";

import { track } from "@/lib/track";
import { AFFITOR_CLICK, type AffitorSource } from "@/lib/affitor-link";

/** A link to affitor.com that records AFFITOR_CLICK. Build `href` with affitorUrl(). */
export function AffitorLink({
  href,
  source,
  slug,
  cta,
  children,
  className,
}: {
  href: string;
  source: AffitorSource;
  slug?: string;
  cta: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={className}
      onClick={() => track(AFFITOR_CLICK, { slug, metadata: { source, cta } })}
    >
      {children}
    </a>
  );
}
