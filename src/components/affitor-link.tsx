"use client";

import { track } from "@/lib/track";
import { AFFITOR_ATTR, AFFITOR_CLICK, isAffitorHref, type AffitorSource } from "@/lib/affitor-link";

/**
 * A link that records AFFITOR_CLICK when `href` is on affitor.com, so a link
 * that goes to Affitor for some programs and to the brand for others (Join,
 * Sign up) can use it too. Build an Affitor `href` with affitorUrl().
 */
export function AffitorLink({
  href,
  source,
  slug,
  cta,
  newTab,
  children,
  className,
}: {
  href: string;
  source: AffitorSource;
  slug?: string;
  cta: string;
  newTab?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const affitor = isAffitorHref(href);
  return (
    <a
      href={href}
      {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...(affitor ? { [AFFITOR_ATTR]: source } : {})}
      className={className}
      onClick={() => {
        if (affitor) track(AFFITOR_CLICK, { slug, metadata: { source, cta } });
      }}
    >
      {children}
    </a>
  );
}
