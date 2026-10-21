"use client";

import { useEffect } from "react";
import { track, trackAffitorClick, trackApply } from "@/lib/track";
import { AFFITOR_ATTR, isAffitorHref } from "@/lib/affitor-link";

export function TrackView({ slug }: { slug: string }) {
  useEffect(() => {
    track("program_view", { slug });
  }, [slug]);
  return null;
}

/** A program page Apply link: outbound_click (the count claimed brands see), apply_click, and AFFITOR_CLICK for affitor.com. */
export function TrackLink({
  href,
  slug,
  network,
  cta,
  children,
  className,
}: {
  href: string;
  slug: string;
  /** The program's network key, for apply_click. */
  network?: string | null;
  /** Which button, for AFFITOR_CLICK when the link goes to affitor.com. */
  cta: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      {...(isAffitorHref(href) ? { [AFFITOR_ATTR]: "program_page" } : {})}
      className={className}
      onClick={() => {
        track("outbound_click", { slug })
        track("cta_oa_program", { slug })
        trackApply(href, slug, network, "program_page")
        trackAffitorClick(href, cta, slug)
      }}
    >
      {children}
    </a>
  );
}
