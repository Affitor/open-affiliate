"use client";

import { trackAffitorClick, trackApply } from "@/lib/track";
import { AFFITOR_ATTR, isAffitorHref, type AffitorSource } from "@/lib/affitor-link";

/**
 * A link that records AFFITOR_CLICK when `href` is on affitor.com, so a link
 * that goes to Affitor for some programs and to the brand for others (Join,
 * Sign up) can use it too. Build an Affitor `href` with affitorUrl(). Set
 * `applyNetwork` on a link that applies to `slug`'s program (Join, Sign up):
 * it then records apply_click as well.
 */
export function AffitorLink({
  href,
  source,
  slug,
  cta,
  applyNetwork,
  newTab,
  children,
  className,
}: {
  href: string;
  source: AffitorSource;
  slug?: string;
  cta: string;
  /** The program's network key, on an Apply link only. */
  applyNetwork?: string;
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
        if (applyNetwork && slug) trackApply(href, slug, applyNetwork, source);
        trackAffitorClick(href, cta, slug);
      }}
    >
      {children}
    </a>
  );
}
