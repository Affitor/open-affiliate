"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Search,
  X,
  Sparkles,
  FileText,
  GitCompareArrows,
  Share2,
  Mail,
  ArrowRight,
  Copy,
  Check,
  Loader2,
  Zap,
  Database,
  Brain,
  ChevronDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProgramLogo } from "@/components/program-logo";
import { programs, type Program } from "@/lib/programs";

const PROGRAM_COUNT = programs.length; // dynamic from registry

/* ── Content type config ─────────────────────────────────────── */

const CONTENT_TYPES = [
  {
    id: "toplist",
    label: "Top List",
    icon: FileText,
    description: "Top 5/10 listicle with comparison table from registry data",
    needsCompare: true,
  },
  {
    id: "howto",
    label: "How-to Guide",
    icon: GitCompareArrows,
    description: "Step-by-step getting started guide with pro tips",
    needsCompare: false,
  },
  {
    id: "review",
    label: "Product Review",
    icon: Share2,
    description: "In-depth review with pros, cons, and verdict",
    needsCompare: false,
  },
  {
    id: "social",
    label: "Social Pack",
    icon: Mail,
    description: "X thread, LinkedIn post, Reddit post, video script",
    needsCompare: false,
  },
] as const;

const PIPELINE_STEPS = [
  {
    label: "Registry",
    detail: `${PROGRAM_COUNT} programs`,
    icon: Database,
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
  },
  {
    label: "Structure",
    detail: "Build context",
    icon: Brain,
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
  },
  {
    label: "Generate",
    detail: "via Kyma API",
    icon: Zap,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
  },
];

/* ── Program search component ────────────────────────────────── */

function ProgramSearch({
  onSelect,
  excludeSlugs,
  placeholder,
}: {
  onSelect: (p: Program) => void;
  excludeSlugs: string[];
  placeholder?: string;
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
      <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-card/50 px-4 py-3">
        <Search className="h-4 w-4 text-muted-foreground/50 shrink-0" />
        <input
          type="text"
          placeholder={placeholder ?? "Search programs..."}
          className="bg-transparent text-sm outline-none w-full placeholder:text-muted-foreground/40"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
        />
      </div>
      {focused && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 rounded-xl border border-border/50 bg-card shadow-xl z-20 overflow-hidden">
          {results.map((p) => (
            <button
              key={p.slug}
              type="button"
              className="flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-muted/30 transition-colors"
              onMouseDown={() => {
                onSelect(p);
                setQuery("");
              }}
            >
              <ProgramLogo slug={p.slug} name={p.name} size={28} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{p.name}</div>
                <div className="text-xs text-muted-foreground">
                  {p.category} · {p.commission.rate} {p.commission.type}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Selected program card ───────────────────────────────────── */

function SelectedCard({
  program,
  onRemove,
  isPrimary,
}: {
  program: Program;
  onRemove: () => void;
  isPrimary?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${isPrimary ? "border-emerald-500/30 bg-emerald-500/5" : "border-border/50 bg-card/50"}`}
    >
      <ProgramLogo slug={program.slug} name={program.name} size={28} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{program.name}</span>
          {isPrimary && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
              Primary
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {program.commission.rate} {program.commission.type} · {program.cookieDays}d cookie · {program.category}
        </div>
      </div>
      <button
        onClick={onRemove}
        className="text-muted-foreground/40 hover:text-foreground transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ── Streaming output ────────────────────────────────────────── */

function StreamOutput({ content, loading }: { content: string; loading: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  if (!content && !loading) return null;

  return (
    <div className="rounded-xl border border-border/50 bg-card/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30 bg-muted/20">
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500" />}
          <span className="text-xs text-muted-foreground">
            {loading ? "Generating via Kyma API..." : "Content ready"}
          </span>
        </div>
        {content && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-lg px-2 py-1 hover:bg-muted/30"
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
      {/* Content */}
      <div className="p-5 max-h-[600px] overflow-y-auto">
        <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-semibold prose-h2:text-base prose-h3:text-sm prose-p:text-muted-foreground prose-li:text-muted-foreground prose-strong:text-foreground">
          <MarkdownRenderer content={content} />
          {loading && (
            <span className="inline-block w-1.5 h-4 bg-emerald-500 animate-pulse ml-0.5 align-text-bottom" />
          )}
        </div>
      </div>
      {/* Footer */}
      {!loading && content && (
        <div className="px-4 py-2.5 border-t border-border/30 bg-muted/10">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground/50">
              Powered by{" "}
              <a
                href="https://kymaapi.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
              >
                Kyma API
              </a>
              {" "}· Data from{" "}
              <Link href="/programs" className="text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2">
                OpenAffiliate Registry
              </Link>
            </span>
            <span className="text-[10px] text-muted-foreground/50">
              {content.split(/\s+/).length} words
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Minimal markdown renderer ───────────────────────────────── */

function MarkdownRenderer({ content }: { content: string }) {
  const html = useMemo(() => {
    let out = content
      // Escape HTML
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      // Headers
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      // Bold and italic
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      // Inline code
      .replace(/`([^`]+)`/g, '<code class="text-xs bg-muted px-1 py-0.5 rounded">$1</code>')
      // Horizontal rule
      .replace(/^---$/gm, '<hr class="my-4 border-border/30" />')
      // List items
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      // Line breaks
      .replace(/\n\n/g, "</p><p>")
      .replace(/\n/g, "<br/>");

    // Wrap in paragraph
    out = `<p>${out}</p>`;
    // Clean up empty paragraphs
    out = out.replace(/<p><\/p>/g, "");
    // Wrap consecutive <li> in <ul>
    out = out.replace(/(<li>.*?<\/li>(?:<br\/>)?)+/g, (match) => {
      return `<ul>${match.replace(/<br\/>/g, "")}</ul>`;
    });
    return out;
  }, [content]);

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

/* ── Suggested programs (quick-add chips) ─────────────────────── */

function SuggestedPrograms({
  category,
  excludeSlugs,
  onAdd,
}: {
  category: string;
  excludeSlugs: string[];
  onAdd: (p: Program) => void;
}) {
  const suggestions = useMemo(() => {
    const excluded = new Set(excludeSlugs);
    return programs
      .filter((p) => p.category === category && !excluded.has(p.slug))
      .slice(0, 8);
  }, [category, excludeSlugs]);

  if (suggestions.length === 0) return null;

  return (
    <div>
      <div className="text-[10px] text-muted-foreground/40 uppercase tracking-wider mb-1.5">
        Top {category} programs
      </div>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((p) => (
          <button
            key={p.slug}
            onClick={() => onAdd(p)}
            className="flex items-center gap-1.5 rounded-lg border border-border/30 bg-card/30 px-2.5 py-1.5 text-xs text-muted-foreground hover:border-emerald-500/30 hover:bg-emerald-500/5 hover:text-foreground transition-all"
          >
            <span className="font-medium">{p.name}</span>
            <span className="text-muted-foreground/30">{p.commission.rate}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────── */

export default function LabPage() {
  const [selected, setSelected] = useState<Program | null>(null);
  const [competitors, setCompetitors] = useState<Program[]>([]);
  const [contentType, setContentType] = useState("toplist");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeStep, setActiveStep] = useState(-1);
  const abortRef = useRef<AbortController | null>(null);

  const selectedType = CONTENT_TYPES.find((t) => t.id === contentType)!;
  const canGenerate = selected && !loading;

  async function handleGenerate() {
    if (!selected || loading) return;

    // Abort previous
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setOutput("");
    setLoading(true);

    // Animate pipeline steps
    setActiveStep(0);
    await delay(400);
    setActiveStep(1);
    await delay(400);
    setActiveStep(2);

    try {
      const res = await fetch("/api/lab/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: selected.slug,
          type: contentType,
          compareSlugs: competitors.map((c) => c.slug),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json();
        setOutput(`Error: ${err.error || "Failed to generate"}`);
        setLoading(false);
        setActiveStep(-1);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              setOutput((prev) => prev + delta);
            }
          } catch {
            // skip malformed chunks
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setOutput(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setLoading(false);
      setActiveStep(-1);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      {/* Header */}
      <div className="mb-12">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-5 w-5 text-emerald-500" />
          <Badge variant="outline" className="text-[10px] px-2 py-0 border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
            Beta
          </Badge>
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Content Lab</h1>
        <p className="text-muted-foreground text-sm max-w-lg">
          Generate high-converting affiliate content from real program data.
          Powered by{" "}
          <a
            href="https://kymaapi.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline underline-offset-2 decoration-border hover:decoration-foreground transition-colors"
          >
            Kyma API
          </a>
          {" "}and the OpenAffiliate registry.
        </p>
      </div>

      {/* Pipeline visualization */}
      <div className="flex items-center gap-3 mb-10">
        {PIPELINE_STEPS.map((step, i) => (
          <div key={step.label} className="flex items-center gap-3">
            <div
              className={`flex items-center gap-2.5 rounded-xl border px-4 py-2.5 transition-all duration-300 ${
                activeStep === i
                  ? `${step.bg} scale-105 shadow-sm`
                  : activeStep > i
                    ? `${step.bg} opacity-60`
                    : "border-border/30 bg-muted/10"
              }`}
            >
              <step.icon
                className={`h-4 w-4 ${activeStep >= i ? step.color : "text-muted-foreground/40"}`}
              />
              <div>
                <div
                  className={`text-xs font-medium ${activeStep >= i ? "text-foreground" : "text-muted-foreground/60"}`}
                >
                  {step.label}
                </div>
                <div className="text-[10px] text-muted-foreground/50">
                  {step.detail}
                </div>
              </div>
            </div>
            {i < PIPELINE_STEPS.length - 1 && (
              <ArrowRight
                className={`h-3.5 w-3.5 shrink-0 transition-colors duration-300 ${
                  activeStep > i ? "text-emerald-500" : "text-border"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Config section */}
      <div className="space-y-6 mb-8">
        {/* Step 1: Select program */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2 block">
            1. Select a program
          </label>
          {selected ? (
            <SelectedCard
              program={selected}
              onRemove={() => {
                setSelected(null);
                setOutput("");
              }}
              isPrimary
            />
          ) : (
            <ProgramSearch
              onSelect={setSelected}
              excludeSlugs={[]}
              placeholder={`Search ${PROGRAM_COUNT} affiliate programs...`}
            />
          )}
        </div>

        {/* Step 2: Content type */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2 block">
            2. Content type
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CONTENT_TYPES.map((type) => (
              <button
                key={type.id}
                onClick={() => {
                  setContentType(type.id);
                  setOutput("");
                }}
                className={`flex flex-col items-start gap-1.5 rounded-xl border px-4 py-3 text-left transition-all ${
                  contentType === type.id
                    ? "border-emerald-500/40 bg-emerald-500/5 shadow-sm"
                    : "border-border/40 bg-card/30 hover:border-border hover:bg-card/50"
                }`}
              >
                <type.icon
                  className={`h-4 w-4 ${contentType === type.id ? "text-emerald-500" : "text-muted-foreground/50"}`}
                />
                <div>
                  <div className="text-sm font-medium">{type.label}</div>
                  <div className="text-[11px] text-muted-foreground/60 leading-tight">
                    {type.description}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Step 2.5: Add more programs (toplist / comparison) */}
        {selectedType.needsCompare && selected && (
          <div>
            <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2 block">
              2b. Add programs to include
              {contentType === "toplist" && (
                <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground/40">
                  Optional — we auto-fill from {selected.category} category ({programs.filter(p => p.category === selected.category && p.slug !== selected.slug).length} available)
                </span>
              )}
            </label>
            <div className="space-y-2">
              {competitors.map((c) => (
                <SelectedCard
                  key={c.slug}
                  program={c}
                  onRemove={() =>
                    setCompetitors((prev) => prev.filter((x) => x.slug !== c.slug))
                  }
                />
              ))}
              {competitors.length < 9 && (
                <>
                  <ProgramSearch
                    onSelect={(p) => setCompetitors((prev) => [...prev, p])}
                    excludeSlugs={[
                      selected.slug,
                      ...competitors.map((c) => c.slug),
                    ]}
                    placeholder={`Add program... (${competitors.length}/9)`}
                  />
                  {/* Quick-add suggestions from same category */}
                  {contentType === "toplist" && competitors.length < 5 && (
                    <SuggestedPrograms
                      category={selected.category}
                      excludeSlugs={[selected.slug, ...competitors.map((c) => c.slug)]}
                      onAdd={(p) => setCompetitors((prev) => [...prev, p])}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className={`w-full flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-medium transition-all ${
            canGenerate
              ? "bg-foreground text-background hover:opacity-90 shadow-sm"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          }`}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Generate Content
            </>
          )}
        </button>
      </div>

      {/* Output */}
      <StreamOutput content={output} loading={loading} />

      {/* Code example */}
      {!output && !loading && (
        <div className="mt-16">
          <h2 className="text-sm font-semibold mb-4 text-muted-foreground/60">
            Build your own with the Kyma API
          </h2>
          <div className="rounded-xl border border-border/40 bg-card/30 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border/30 bg-muted/20">
              <div className="flex gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-border/50" />
                <div className="h-2.5 w-2.5 rounded-full bg-border/50" />
                <div className="h-2.5 w-2.5 rounded-full bg-border/50" />
              </div>
              <span className="text-[10px] text-muted-foreground/50 font-mono ml-2">
                generate.ts
              </span>
            </div>
            <pre className="p-4 text-xs font-mono text-muted-foreground overflow-x-auto leading-relaxed">
              <code>{`import OpenAI from "openai";

const kyma = new OpenAI({
  baseURL: "https://kymaapi.com/v1",
  apiKey: process.env.KYMA_API_KEY,
});

// Fetch program data from OpenAffiliate
const program = await fetch(
  "https://openaffiliate.dev/api/programs/notion"
).then(r => r.json());

// Generate affiliate content
const stream = await kyma.chat.completions.create({
  model: "deepseek-v3",
  stream: true,
  messages: [
    { role: "system", content: "You are an affiliate content expert." },
    { role: "user", content: \`Write a review for \${program.name}...\` },
  ],
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}`}</code>
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
