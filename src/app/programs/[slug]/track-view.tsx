"use client";

import { useEffect } from "react";
import { track } from "@/lib/track";
import { AFFITOR_CLICK, isAffitorHref } from "@/lib/affitor-link";

export function TrackView({ slug }: { slug: string }) {
  useEffect(() => {
    track("program_view", { slug });
  }, [slug]);
  return null;
}

export function TrackLink({
  href,
  slug,
  cta,
  children,
  className,
}: {
  href: string;
  slug: string;
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
      className={className}
      onClick={() => {
        track("outbound_click", { slug })
        track("cta_oa_program", { slug })
        if (isAffitorHref(href)) track(AFFITOR_CLICK, { slug, metadata: { source: "program_page", cta } })
      }}
    >
      {children}
    </a>
  );
}
