"use client";

import { useEffect } from "react";
import { track } from "@/lib/track";

export function TrackView({ slug }: { slug: string }) {
  useEffect(() => {
    track("program_view", { slug });
  }, [slug]);
  return null;
}

export function TrackLink({
  href,
  slug,
  children,
  className,
}: {
  href: string;
  slug: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() => track("outbound_click", { slug })}
    >
      {children}
    </a>
  );
}
