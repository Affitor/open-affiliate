"use client";

import { track } from "@/lib/track";
import { AFFITOR_ATTR, AFFITOR_CLICK, isAffitorHref } from "@/lib/affitor-link";

/**
 * A blog post's Apply link. It records blog_apply_click, not outbound_click:
 * outbound_click is the program page's apply count that claimed brands see
 * (claims/service.ts). A link to affitor.com also records AFFITOR_CLICK.
 * rel has no "noreferrer", because some programs attribute by Referer.
 */
export function PostApplyLink({
  href,
  slug,
  post,
  children,
  className,
}: {
  href: string;
  slug: string;
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
        if (affitor) track(AFFITOR_CLICK, { slug, metadata: { source: "blog", cta: "apply", post } });
      }}
    >
      {children}
    </a>
  );
}
