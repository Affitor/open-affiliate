"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search } from "lucide-react";
import { ProgramLogo } from "@/components/program-logo";
import { programs, commissionLabel } from "@/lib/programs";

export function SearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd+K and "/" keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement).tagName
        )
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") {
        inputRef.current?.blur();
        setOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Local search — instant, no debounce needed
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return programs
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.shortDescription.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.tags?.some((t) => t.toLowerCase().includes(q))
      )
      .slice(0, 6);
  }, [query]);

  useEffect(() => {
    setOpen(results.length > 0 || (query.trim().length >= 2 && results.length === 0));
  }, [results, query]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) {
      setOpen(false);
      router.push(`/programs?q=${encodeURIComponent(q)}`);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <form onSubmit={handleSubmit}>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim().length >= 2 && setOpen(true)}
          placeholder="Search programs..."
          className="w-full bg-muted/40 border border-border/50 rounded-lg pl-9 pr-14 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-border focus:bg-muted/60 transition-colors"
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/50 border border-border/40 rounded px-1.5 py-0.5 font-mono pointer-events-none hidden sm:inline">
          ⌘K
        </kbd>
      </form>

      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-card border border-border/50 rounded-xl shadow-lg z-50 overflow-hidden">
          {results.map((p) => (
            <Link
              key={p.slug}
              href={`/programs/${p.slug}`}
              onClick={() => {
                setOpen(false);
                setQuery("");
              }}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors"
            >
              <ProgramLogo
                slug={p.slug}
                name={p.name}
                size={28}
                className="shrink-0"
              />
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium">{p.name}</span>
                <p className="text-xs text-muted-foreground truncate">
                  {p.commission.rate} {commissionLabel(p.commission)} · {p.category}
                </p>
              </div>
            </Link>
          ))}
          <div className="border-t border-border/30 px-4 py-2">
            <button
              onClick={handleSubmit}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              View all results for &ldquo;{query.trim()}&rdquo;
            </button>
          </div>
        </div>
      )}

      {open && query.trim().length >= 2 && results.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-card border border-border/50 rounded-xl shadow-lg z-50 px-4 py-3">
          <p className="text-sm text-muted-foreground">No programs found.</p>
        </div>
      )}
    </div>
  );
}
