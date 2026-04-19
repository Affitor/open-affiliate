"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoteButtonProps {
  slug: string;
  initialCount?: number;
  className?: string;
}

export function VoteButton({ slug, initialCount = 0, className }: VoteButtonProps) {
  const [count, setCount] = useState(initialCount);
  const [voted, setVoted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setCount(initialCount));
  }, [initialCount]);

  useEffect(() => {
    fetch(`/api/votes/check?slugs=${slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.voted?.[slug]) setVoted(true);
      })
      .catch(() => {});
  }, [slug]);

  const handleVote = useCallback(async () => {
    if (loading) return;
    setLoading(true);

    // Optimistic update
    const wasVoted = voted;
    setVoted(!wasVoted);
    setCount((c) => c + (wasVoted ? -1 : 1));

    try {
      const res = await fetch("/api/votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      setVoted(data.voted);
    } catch {
      // Revert on error
      setVoted(wasVoted);
      setCount((c) => c + (wasVoted ? 1 : -1));
    } finally {
      setLoading(false);
    }
  }, [slug, voted, loading]);

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        handleVote();
      }}
      disabled={loading}
      className={cn(
        "flex flex-col items-center gap-0.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-all",
        voted
          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border-border/50 bg-card/50 text-muted-foreground hover:border-border hover:text-foreground",
        loading && "opacity-50",
        className
      )}
      aria-label={voted ? "Remove vote" : "Vote for this program"}
    >
      <ChevronUp className={cn("h-3.5 w-3.5", voted && "text-emerald-500")} />
      <span className="tabular-nums text-[11px] leading-none">{count}</span>
    </button>
  );
}

// Hook for batch-loading vote counts
export function useVoteCounts(slugs: string[]) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (slugs.length === 0) return;

    const BATCH_SIZE = 50;
    const batches: string[][] = [];
    const sorted = [...slugs].sort();
    for (let i = 0; i < sorted.length; i += BATCH_SIZE) {
      batches.push(sorted.slice(i, i + BATCH_SIZE));
    }

    Promise.all(
      batches.map((batch) =>
        fetch(`/api/votes?slugs=${batch.join(",")}`)
          .then((r) => r.json())
          .then((data) => data.counts ?? {})
      )
    )
      .then((results) => {
        const merged: Record<string, number> = {};
        for (const chunk of results) {
          Object.assign(merged, chunk);
        }
        setCounts(merged);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [slugs.join(",")]);

  return { counts, loaded };
}
