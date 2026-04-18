"use client";

import { useState, useMemo, Suspense, useEffect } from "react";
import { track } from "@/lib/track";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Search,
  X,
  Plus,
  ArrowRight,
  DollarSign,
  Clock,
  CreditCard,
  MousePointer,
  Fingerprint,
  Shield,
  Check,
  Minus,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProgramLogo } from "@/components/program-logo";
import { programs, getProgram, type Program } from "@/lib/programs";
import { CopyButton } from "@/components/copy-button";

const MAX_COMPARE = 4;

function BoolCell({ value }: { value?: boolean }) {
  if (value === true)
    return <Check className="h-4 w-4 text-emerald-500 mx-auto" />;
  if (value === false)
    return <Minus className="h-4 w-4 text-muted-foreground/30 mx-auto" />;
  return <span className="text-xs text-muted-foreground">—</span>;
}

function CompareRow({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <tr className="border-t border-border/20">
      <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
        <span className="flex items-center gap-1.5">
          {icon}
          {label}
        </span>
      </td>
      {children}
    </tr>
  );
}

function ProgramSearch({
  onSelect,
  excludeSlugs,
}: {
  onSelect: (slug: string) => void;
  excludeSlugs: string[];
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  const results = useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    return programs
      .filter(
        (p) =>
          !excludeSlugs.includes(p.slug) &&
          (p.name.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q) ||
            p.tags.some((t) => t.includes(q)))
      )
      .slice(0, 8);
  }, [query, excludeSlugs]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/50 bg-muted/20 px-3 py-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground/50" />
        <input
          type="text"
          aria-label="Search programs to compare"
            placeholder="Add program..."
          className="bg-transparent text-sm outline-none w-full placeholder:text-muted-foreground/40"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
        />
      </div>
      {focused && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 rounded-xl border border-border/50 bg-card shadow-lg z-20 overflow-hidden">
          {results.map((p) => (
            <button
              key={p.slug}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(p.slug);
                setQuery("");
              }}
              className="flex items-center gap-3 w-full px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
            >
              <ProgramLogo slug={p.slug} name={p.name} size={28} />
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium truncate block">
                  {p.name}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {p.commission.rate} {p.commission.type} · {p.category}
                </span>
              </div>
              <Plus className="h-3.5 w-3.5 text-muted-foreground/40" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const POPULAR_COMPARISONS = [
  ["vercel", "netlify", "digitalocean"],
  ["notion", "clickup", "convertkit"],
  ["neon", "webflow", "activecampaign"],
];

function CompareContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => { track("page_view"); }, []);

  const initialSlugs = (searchParams.get("p") ?? "")
    .split(",")
    .filter(Boolean)
    .slice(0, MAX_COMPARE);

  const [slugs, setSlugs] = useState<string[]>(initialSlugs);

  const selected: Program[] = slugs
    .map((s) => getProgram(s))
    .filter((p): p is Program => p !== undefined);

  const syncUrl = (newSlugs: string[]) => {
    const qs = newSlugs.length > 0 ? `?p=${newSlugs.join(",")}` : "";
    router.replace(`/compare${qs}`, { scroll: false });
  };

  const addProgram = (slug: string) => {
    if (slugs.length >= MAX_COMPARE || slugs.includes(slug)) return;
    const next = [...slugs, slug];
    setSlugs(next);
    syncUrl(next);
  };

  const removeProgram = (slug: string) => {
    const next = slugs.filter((s) => s !== slug);
    setSlugs(next);
    syncUrl(next);
  };

  const loadComparison = (comparison: string[]) => {
    const valid = comparison.filter((s) => getProgram(s));
    setSlugs(valid);
    syncUrl(valid);
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">
          Compare Programs
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Select up to {MAX_COMPARE} programs to compare side-by-side
        </p>
      </div>

      {/* Empty state */}
      {selected.length === 0 && (
        <div className="space-y-8">
          {/* Search */}
          <div className="max-w-md">
            <ProgramSearch onSelect={addProgram} excludeSlugs={slugs} />
          </div>

          {/* Popular comparisons */}
          <div>
            <p className="text-xs text-muted-foreground/60 uppercase tracking-wide mb-3">
              Popular comparisons
            </p>
            <div className="flex flex-wrap gap-3">
              {POPULAR_COMPARISONS.map((comparison) => {
                const names = comparison
                  .map((s) => getProgram(s)?.name)
                  .filter(Boolean);
                if (names.length < 2) return null;
                return (
                  <button
                    key={comparison.join(",")}
                    onClick={() => loadComparison(comparison)}
                    className="rounded-lg border border-border/50 bg-card/30 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-border hover:bg-card/60 transition-colors"
                  >
                    {names.join(" vs ")}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Browse link */}
          <div className="rounded-xl border border-border/40 bg-muted/20 p-6">
            <p className="text-sm text-muted-foreground">
              Not sure what to compare?{" "}
              <Link
                href="/rankings"
                className="text-foreground hover:underline"
              >
                Browse rankings
              </Link>{" "}
              or{" "}
              <Link
                href="/programs"
                className="text-foreground hover:underline"
              >
                search programs
              </Link>
              .
            </p>
          </div>
        </div>
      )}

      {/* Comparison table */}
      {selected.length > 0 && (
        <div className="space-y-6">
          <div className="rounded-xl border border-border/40 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                {/* Program headers */}
                <thead>
                  <tr className="border-b border-border/40 bg-muted/30">
                    <th className="w-40 py-4 px-4 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                      Feature
                    </th>
                    {selected.map((p) => (
                      <th
                        key={p.slug}
                        className="py-4 px-4 min-w-[180px]"
                      >
                        <div className="relative flex flex-col items-center gap-2">
                          <button
                            onClick={() => removeProgram(p.slug)}
                            className="absolute top-0 right-0 text-muted-foreground/40 hover:text-foreground transition-colors"
                            aria-label={`Remove ${p.name}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                          <ProgramLogo
                            slug={p.slug}
                            name={p.name}
                            size={40}
                          />
                          <Link
                            href={`/programs/${p.slug}`}
                            className="text-sm font-semibold hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors text-center"
                          >
                            {p.name}
                          </Link>
                          {p.verified && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 border-emerald-600/30 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                            >
                              verified
                            </Badge>
                          )}
                        </div>
                      </th>
                    ))}
                    {selected.length < MAX_COMPARE && (
                      <th className="py-4 px-4 min-w-[180px]">
                        <ProgramSearch
                          onSelect={addProgram}
                          excludeSlugs={slugs}
                        />
                      </th>
                    )}
                  </tr>
                </thead>

                <tbody>
                  {/* Commission */}
                  <CompareRow
                    label="Commission Rate"
                    icon={<DollarSign className="h-3 w-3" />}
                  >
                    {selected.map((p) => (
                      <td
                        key={p.slug}
                        className="py-3 px-4 text-center"
                      >
                        <span className="text-base font-semibold text-emerald-600 dark:text-emerald-400">
                          {p.commission.rate}
                        </span>
                      </td>
                    ))}
                    {selected.length < MAX_COMPARE && <td />}
                  </CompareRow>

                  <CompareRow label="Commission Type">
                    {selected.map((p) => (
                      <td
                        key={p.slug}
                        className="py-3 px-4 text-center"
                      >
                        <Badge variant="secondary" className="text-[11px]">
                          {p.commission.type}
                        </Badge>
                      </td>
                    ))}
                    {selected.length < MAX_COMPARE && <td />}
                  </CompareRow>

                  {/* Duration */}
                  <CompareRow label="Commission Duration">
                    {selected.map((p) => (
                      <td
                        key={p.slug}
                        className="py-3 px-4 text-center text-sm"
                      >
                        {p.commissionDuration ?? "—"}
                      </td>
                    ))}
                    {selected.length < MAX_COMPARE && <td />}
                  </CompareRow>

                  {/* Cookie */}
                  <CompareRow
                    label="Cookie Duration"
                    icon={<Clock className="h-3 w-3" />}
                  >
                    {selected.map((p) => (
                      <td
                        key={p.slug}
                        className="py-3 px-4 text-center text-sm font-medium"
                      >
                        {p.cookieDays} days
                      </td>
                    ))}
                    {selected.length < MAX_COMPARE && <td />}
                  </CompareRow>

                  {/* Attribution */}
                  <CompareRow
                    label="Attribution"
                    icon={<MousePointer className="h-3 w-3" />}
                  >
                    {selected.map((p) => (
                      <td
                        key={p.slug}
                        className="py-3 px-4 text-center text-sm capitalize"
                      >
                        {p.attribution ?? "—"}
                      </td>
                    ))}
                    {selected.length < MAX_COMPARE && <td />}
                  </CompareRow>

                  {/* Tracking */}
                  <CompareRow
                    label="Tracking Method"
                    icon={<Fingerprint className="h-3 w-3" />}
                  >
                    {selected.map((p) => (
                      <td
                        key={p.slug}
                        className="py-3 px-4 text-center text-sm capitalize"
                      >
                        {p.trackingMethod ?? "—"}
                      </td>
                    ))}
                    {selected.length < MAX_COMPARE && <td />}
                  </CompareRow>

                  {/* Min Payout */}
                  <CompareRow
                    label="Min Payout"
                    icon={<CreditCard className="h-3 w-3" />}
                  >
                    {selected.map((p) => (
                      <td
                        key={p.slug}
                        className="py-3 px-4 text-center text-sm font-medium"
                      >
                        ${p.payout.minimum}
                      </td>
                    ))}
                    {selected.length < MAX_COMPARE && <td />}
                  </CompareRow>

                  {/* Payout Frequency */}
                  <CompareRow label="Payout Frequency">
                    {selected.map((p) => (
                      <td
                        key={p.slug}
                        className="py-3 px-4 text-center text-sm capitalize"
                      >
                        {p.payout.frequency}
                      </td>
                    ))}
                    {selected.length < MAX_COMPARE && <td />}
                  </CompareRow>

                  {/* Approval */}
                  <CompareRow
                    label="Approval"
                    icon={<Shield className="h-3 w-3" />}
                  >
                    {selected.map((p) => (
                      <td
                        key={p.slug}
                        className="py-3 px-4 text-center text-sm capitalize"
                      >
                        {p.approval ?? "—"}
                      </td>
                    ))}
                    {selected.length < MAX_COMPARE && <td />}
                  </CompareRow>

                  {/* Approval Time */}
                  <CompareRow label="Approval Time">
                    {selected.map((p) => (
                      <td
                        key={p.slug}
                        className="py-3 px-4 text-center text-sm"
                      >
                        {p.approvalTime ?? "—"}
                      </td>
                    ))}
                    {selected.length < MAX_COMPARE && <td />}
                  </CompareRow>

                  {/* Category */}
                  <CompareRow label="Category">
                    {selected.map((p) => (
                      <td
                        key={p.slug}
                        className="py-3 px-4 text-center"
                      >
                        <Badge variant="outline" className="text-[11px]">
                          {p.category}
                        </Badge>
                      </td>
                    ))}
                    {selected.length < MAX_COMPARE && <td />}
                  </CompareRow>

                  {/* Network */}
                  <CompareRow label="Network">
                    {selected.map((p) => (
                      <td
                        key={p.slug}
                        className="py-3 px-4 text-center text-sm capitalize"
                      >
                        {p.network ?? "In-house"}
                      </td>
                    ))}
                    {selected.length < MAX_COMPARE && <td />}
                  </CompareRow>

                  {/* Features */}
                  <CompareRow label="Marketing Materials">
                    {selected.map((p) => (
                      <td key={p.slug} className="py-3 px-4">
                        <BoolCell value={p.marketingMaterials} />
                      </td>
                    ))}
                    {selected.length < MAX_COMPARE && <td />}
                  </CompareRow>

                  <CompareRow label="API Available">
                    {selected.map((p) => (
                      <td key={p.slug} className="py-3 px-4">
                        <BoolCell value={p.apiAvailable} />
                      </td>
                    ))}
                    {selected.length < MAX_COMPARE && <td />}
                  </CompareRow>

                  <CompareRow label="Dedicated Manager">
                    {selected.map((p) => (
                      <td key={p.slug} className="py-3 px-4">
                        <BoolCell value={p.dedicatedManager} />
                      </td>
                    ))}
                    {selected.length < MAX_COMPARE && <td />}
                  </CompareRow>

                  {/* Join links */}
                  <tr className="border-t border-border/40 bg-muted/10">
                    <td className="py-4 px-4" />
                    {selected.map((p) => (
                      <td key={p.slug} className="py-4 px-4 text-center">
                        <a
                          href={p.signupUrl ?? p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-foreground text-background px-4 py-2 text-xs font-medium hover:bg-foreground/90 transition-colors"
                        >
                          Join
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </td>
                    ))}
                    {selected.length < MAX_COMPARE && <td />}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Share link */}
          <div className="flex items-center justify-center gap-2">
            <p className="text-xs text-muted-foreground">
              Share this comparison:{" "}
              <code className="text-[11px] bg-muted/50 px-2 py-0.5 rounded">
                openaffiliate.dev/compare?p={slugs.join(",")}
              </code>
            </p>
            <CopyButton text={`https://openaffiliate.dev/compare?p=${slugs.join(",")}`} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense>
      <CompareContent />
    </Suspense>
  );
}
