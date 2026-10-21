"use client";

import { track, trackAffitorClick, trackApply } from "@/lib/track";
import { AFFITOR_ATTR, isAffitorHref } from "@/lib/affitor-link";

/**
 * A blog post's Apply link. It records blog_apply_click, not outbound_click:
 * outbound_click is the program page's apply count that claimed brands see
 * (claims/service.ts). It also records apply_click, and AFFITOR_CLICK for a
 * link to affitor.com.
 * rel has no "noreferrer", because some programs attribute by Referer.
 */
export function PostApplyLink({
  href,
  slug,
  network,
  post,
  children,
  className,
}: {
  href: string;
  slug: string;
  /** The program's network key, for apply_click. */
  network?: string | null;
  post: string;
  children: React.ReactNode;
  className?: string;
}) {
  const affitor = isAffitorHref(href);
  return (
    <a
      href={href}
      target="_blank"
      rel="sponsored nofollow noopener"
      {...(affitor ? { [AFFITOR_ATTR]: "blog" } : {})}
      className={className}
      onClick={() => {
        track("blog_apply_click", { slug, metadata: { post } });
        trackApply(href, slug, network, "blog");
        trackAffitorClick(href, "apply", slug);
      }}
    >
      {children}
    </a>
  );
}
