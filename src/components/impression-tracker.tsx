"use client";

import { useEffect, useRef } from "react";
import { track } from "@/lib/track";

// Dedup: track each slug at most once per page load
const seen = new Set<string>();

export function ImpressionTracker({ slug }: { slug: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || seen.has(slug)) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          seen.add(slug);
          track("impression", { slug });
          observer.unobserve(el);
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [slug]);

  return <div ref={ref} className="absolute inset-0 pointer-events-none" />;
}
