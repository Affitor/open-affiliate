"use client";

import { useEffect } from "react";
import { track } from "@/lib/track";

export function TrackPageView({
  type = "page_view",
  slug,
  metadata,
}: {
  type?: string;
  slug?: string;
  metadata?: Record<string, unknown>;
}) {
  useEffect(() => {
    track(type, { slug, metadata });
  }, [type, slug]);

  return null;
}
