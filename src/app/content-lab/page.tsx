"use client";

import { useState, useRef, useEffect } from "react";
import {
  Program,
  Platform,
  Language,
  Formula,
  Tone,
  PLATFORMS,
  LANGUAGES,
  FORMULAS,
  TONES,
  MODELS,
} from "@/lib/content-lab-types";
import { searchPrograms } from "@/lib/content-lab-programs";

const MAX_PROGRAMS = 5;

export default function ContentLab() {
  const [step, setStep] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPrograms, setSelectedPrograms] = useState<Program[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [platform, setPlatform] = useState<Platform>("linkedin");
  const [language, setLanguage] = useState<Language>("en");
  const [formula, setFormula] = useState<Formula>("pas");
  const [tone, setTone] = useState<Tone>("professional");
  const [customTone, setCustomTone] = useState("");
  const [customTemplate, setCustomTemplate] = useState("");
  const [length, setLength] = useState<"short" | "medium" | "long">("medium");
  const [model, setModel] = useState("");
  const [includeAffiliate, setIncludeAffiliate] = useState(true);
  const [affiliateLink, setAffiliateLink] = useState("");
  const [output, setOutput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [usedModel, setUsedModel] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [reasoning, setReasoning] = useState("");
  const [showThinking, setShowThinking] = useState(false);
  const [showTemplateInput, setShowTemplateInput] = useState(false);
  const [genPhase, setGenPhase] = useState<"connecting" | "thinking" | "streaming" | "done">("connecting");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [tokenCount, setTokenCount] = useState(0);
  const outputRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Synchronous local search — no debounce needed
  const suggestions =
    searchQuery.length >= 1
      ? searchPrograms(searchQuery)
          .filter((p) => !selectedPrograms.some((s) => s.slug === p.slug))
          .slice(0, 8)
      : [];

  // Auto-scroll output while streaming
  useEffect(() => {
    if (isGenerating && output && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output, isGenerating]);

  // Close suggestions on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function addProgram(p: Program) {
    if (selectedPrograms.length >= MAX_PROGRAMS) return;
    setSelectedPrograms((prev) => [...prev, p]);
    setSearchQuery("");
    setShowSuggestions(false);
  }

  function removeProgram(slug: string) {
    setSelectedPrograms((prev) => prev.filter((p) => p.slug !== slug));
  }

  async function handleGenerate() {
    if (selectedPrograms.length === 0) return;
    setIsGenerating(true);
    setOutput("");
    setUsedModel("");
    setReasoning("");
    setShowThinking(false);
    setGenPhase("connecting");
    setElapsedMs(0);
    setTokenCount(0);
    setStep(3);

    // Start elapsed timer
    const startTime = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTime);
    }, 100);

    try {
      setGenPhase("thinking");
      const res = await fetch("/api/content-lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          program: selectedPrograms[0],
          programs: selectedPrograms,
          platform,
          language,
          formula,
          tone,
          customTone: tone === "custom" ? customTone : undefined,
          customTemplate: showTemplateInput ? customTemplate : undefined,
          length,
          model: model || undefined,
          includeAffiliate,
          affiliateLink: affiliateLink || undefined,
        }),
      });

      if (!res.ok) {
        let errMsg = `Error ${res.status}`;
        if (res.status === 504) {
          errMsg = "Request timed out. The AI model is slow right now — try a faster model like Gemini 2.5 Flash, or try again.";
        } else if (res.status === 429) {
          errMsg = "Rate limit reached (30/day). Sign up at kymaapi.com for your own API key with free credits.";
        } else {
          try {
            const err = await res.json();
            errMsg = err.error || errMsg;
          } catch {
            try { errMsg = await res.text() || errMsg; } catch { /* noop */ }
          }
        }
        setOutput(errMsg);
        setGenPhase("done");
        setIsGenerating(false);
        if (timerRef.current) clearInterval(timerRef.current);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let content = "";
      let tokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const json = JSON.parse(line.slice(6));
            if (json.done) {
              setUsedModel(json.model);
              if (json.remaining !== undefined) setRemaining(json.remaining);
            } else if (json.reasoning) {
              setGenPhase("thinking");
              setReasoning((prev) => prev + json.reasoning);
            } else if (json.error) {
              content += `\n\nError: ${json.error}`;
              setOutput(content);
            } else if (json.text) {
              if (tokens === 0) setGenPhase("streaming");
              content += json.text;
              tokens++;
              setTokenCount(tokens);
              setOutput(content);
            }
          } catch {
            // skip malformed chunks
          }
        }
      }
      // Stream finished but no content generated
      if (tokens === 0 && !content) {
        setOutput("Error: AI returned no content. This may be a temporary issue or model overload. Try a different model or try again in a moment.");
      }
    } catch (err) {
      setOutput(`Error: ${err instanceof Error ? err.message : "Network error"}`);
    } finally {
      setGenPhase("done");
      setIsGenerating(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }

  function copyToClipboard() {
    navigator.clipboard.writeText(output);
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Steps */}
        <div className="flex items-center gap-2 mb-8">
          {["Program", "Pipeline", "Generate", "Output"].map((s, i) => (
            <button
              key={s}
              onClick={() => i < step && setStep(i)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition ${
                i === step
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                  : i < step
                  ? "text-white/60 hover:text-white/80 cursor-pointer"
                  : "text-white/30"
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                  i < step
                    ? "bg-emerald-500/20 text-emerald-400"
                    : i === step
                    ? "bg-emerald-500 text-black"
                    : "bg-white/10 text-white/30"
                }`}
              >
                {i < step ? "✓" : i + 1}
              </span>
              {s}
            </button>
          ))}
        </div>

        {/* Step 0: Select Program(s) */}
        {step === 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-2">Select Programs</h2>
            <p className="text-white/50 text-sm mb-6">
              Search 750+ affiliate programs. Select up to {MAX_PROGRAMS} for comparison or focused content.
            </p>

            {/* Search input with dropdown */}
            <div ref={searchRef} className="relative mb-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => searchQuery.length >= 1 && setShowSuggestions(true)}
                placeholder={
                  selectedPrograms.length >= MAX_PROGRAMS
                    ? `Max ${MAX_PROGRAMS} programs selected`
                    : "Type to search (e.g., hosting, SEO, design, Vercel...)"
                }
                disabled={selectedPrograms.length >= MAX_PROGRAMS}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500/50 disabled:opacity-40 disabled:cursor-not-allowed"
              />

              {/* Suggestions dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-xl border border-white/10 bg-[#141414] shadow-2xl overflow-hidden max-h-[400px] overflow-y-auto">
                  {suggestions.map((p) => (
                    <button
                      key={p.slug}
                      onClick={() => addProgram(p)}
                      className="w-full text-left px-4 py-3 hover:bg-emerald-500/10 transition border-b border-white/5 last:border-0"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm">{p.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-white/50">
                          {p.category}
                        </span>
                      </div>
                      <p className="text-xs text-white/40 line-clamp-1 mb-1">
                        {p.description}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-emerald-400">
                        <span>{p.commission}</span>
                        <span className="text-white/20">|</span>
                        <span>{p.cookie_days}d cookie</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* No results hint */}
              {showSuggestions && searchQuery.length >= 1 && suggestions.length === 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-xl border border-white/10 bg-[#141414] p-4 text-sm text-white/40 text-center">
                  No programs found for &ldquo;{searchQuery}&rdquo;
                </div>
              )}
            </div>

            {/* Selected programs chips — below search */}
            {selectedPrograms.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {selectedPrograms.map((p) => (
                  <span
                    key={p.slug}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-sm"
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-white/40">{p.commission}</span>
                    <button
                      onClick={() => removeProgram(p.slug)}
                      className="text-white/40 hover:text-white ml-1"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <span className="text-xs text-white/30 self-center">
                  {selectedPrograms.length}/{MAX_PROGRAMS}
                </span>
              </div>
            )}

            {/* Continue button */}
            {selectedPrograms.length > 0 && (
              <button
                onClick={() => setStep(1)}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-semibold hover:opacity-90 transition"
              >
                Continue with {selectedPrograms.length} program{selectedPrograms.length > 1 ? "s" : ""} →
              </button>
            )}
          </div>
        )}

        {/* Step 1: Configure */}
        {step === 1 && selectedPrograms.length > 0 && (
          <div className="space-y-8">
            <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  {selectedPrograms.map((p) => (
                    <span key={p.slug} className="inline-flex items-center gap-1.5">
                      <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-white/40">{p.category}</span>
                      {selectedPrograms.length > 1 && (
                        <span className="text-white/20">·</span>
                      )}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => setStep(0)}
                  className="text-xs text-white/40 hover:text-white/60 shrink-0"
                >
                  Change
                </button>
              </div>
            </div>

            {/* Platform */}
            <Section title="Platform">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(Object.entries(PLATFORMS) as [Platform, typeof PLATFORMS.linkedin][]).map(
                  ([key, val]) => (
                    <button
                      key={key}
                      onClick={() => setPlatform(key)}
                      className={`p-3 rounded-xl border text-left transition ${
                        platform === key
                          ? "border-emerald-500/60 bg-emerald-500/10"
                          : "border-white/10 hover:border-white/20"
                      }`}
                    >
                      <div className="text-lg mb-1">{val.icon}</div>
                      <div className="text-sm font-medium">{val.label}</div>
                      <div className="text-xs text-white/40">{val.description}</div>
                    </button>
                  )
                )}
              </div>
            </Section>

            {/* Language */}
            <Section title="Language">
              <div className="flex flex-wrap gap-2">
                {(Object.entries(LANGUAGES) as [Language, typeof LANGUAGES.en][]).map(
                  ([key, val]) => (
                    <button
                      key={key}
                      onClick={() => setLanguage(key)}
                      className={`px-4 py-2 rounded-lg border text-sm transition ${
                        language === key
                          ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400"
                          : "border-white/10 text-white/60 hover:border-white/20"
                      }`}
                    >
                      {val.native}
                    </button>
                  )
                )}
              </div>
            </Section>

            {/* Formula */}
            <Section title="Writing Formula">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {(Object.entries(FORMULAS) as [Formula, typeof FORMULAS.aida][]).map(
                  ([key, val]) => (
                    <button
                      key={key}
                      onClick={() => setFormula(key)}
                      className={`p-3 rounded-xl border text-left transition ${
                        formula === key
                          ? "border-emerald-500/60 bg-emerald-500/10"
                          : "border-white/10 hover:border-white/20"
                      }`}
                    >
                      <div className="text-sm font-medium">{val.label}</div>
                      <div className="text-xs text-white/40 mt-1">
                        {val.description}
                      </div>
                    </button>
                  )
                )}
              </div>
            </Section>

            {/* Tone */}
            <Section title="Tone">
              <div className="flex flex-wrap gap-2">
                {(Object.entries(TONES) as [Tone, typeof TONES.professional][]).map(
                  ([key, val]) => (
                    <button
                      key={key}
                      onClick={() => setTone(key)}
                      className={`px-3 py-1.5 rounded-lg border text-sm transition ${
                        tone === key
                          ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400"
                          : "border-white/10 text-white/60 hover:border-white/20"
                      }`}
                    >
                      {val.label}
                    </button>
                  )
                )}
              </div>
              {tone === "custom" && (
                <textarea
                  value={customTone}
                  onChange={(e) => setCustomTone(e.target.value)}
                  placeholder="Describe your desired tone (e.g., 'Like Paul Graham writing about startups')"
                  className="mt-3 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/50 h-20 resize-none"
                />
              )}
            </Section>

            {/* Length */}
            <Section title="Length">
              <div className="flex gap-3">
                {(["short", "medium", "long"] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLength(l)}
                    className={`px-4 py-2 rounded-lg border text-sm capitalize transition ${
                      length === l
                        ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400"
                        : "border-white/10 text-white/60 hover:border-white/20"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </Section>

            {/* Model */}
            <Section title="Model (optional)">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setModel("")}
                  className={`px-3 py-1.5 rounded-lg border text-sm transition ${
                    !model
                      ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400"
                      : "border-white/10 text-white/60 hover:border-white/20"
                  }`}
                >
                  Auto (recommended)
                </button>
                {MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setModel(m.id)}
                    className={`px-3 py-1.5 rounded-lg border text-sm transition ${
                      model === m.id
                        ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400"
                        : "border-white/10 text-white/60 hover:border-white/20"
                    }`}
                    title={m.best_for}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              {model && (
                <p className="text-xs text-white/40 mt-2">
                  Best for: {MODELS.find((m) => m.id === model)?.best_for}
                </p>
              )}
            </Section>

            {/* Affiliate Link */}
            <Section title="Affiliate Link">
              <div className="flex items-center gap-4 mb-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={includeAffiliate}
                    onChange={(e) => setIncludeAffiliate(e.target.checked)}
                    className="rounded border-white/20 bg-white/5 accent-emerald-500"
                  />
                  Include affiliate CTA
                </label>
              </div>
              {includeAffiliate && (
                <input
                  type="text"
                  value={affiliateLink}
                  onChange={(e) => setAffiliateLink(e.target.value)}
                  placeholder="https://partner.example.com/ref=you (optional)"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/50"
                />
              )}
            </Section>

            {/* Custom Template */}
            <Section title="Custom Template (optional)">
              <button
                onClick={() => setShowTemplateInput(!showTemplateInput)}
                className="text-sm text-emerald-400 hover:text-emerald-300"
              >
                {showTemplateInput
                  ? "Hide template input"
                  : "Paste a sample — AI mimics your style"}
              </button>
              {showTemplateInput && (
                <textarea
                  value={customTemplate}
                  onChange={(e) => setCustomTemplate(e.target.value)}
                  placeholder="Paste a content sample here. The AI will mimic the structure, tone, and formatting of your sample while adapting the content for the selected program."
                  className="mt-3 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/50 h-40 resize-none font-mono"
                />
              )}
            </Section>

            {/* Generate Button */}
            <button
              onClick={() => setStep(2)}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-semibold hover:opacity-90 transition"
            >
              Review & Generate
            </button>
          </div>
        )}

        {/* Step 2: Review & Generate */}
        {step === 2 && selectedPrograms.length > 0 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Review Configuration</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-6 rounded-xl border border-white/10 bg-white/[0.02]">
              <ConfigItem label={selectedPrograms.length > 1 ? "Programs" : "Program"} value={selectedPrograms.map(p => p.name).join(", ")} />
              <ConfigItem label="Platform" value={PLATFORMS[platform].label} />
              <ConfigItem label="Language" value={LANGUAGES[language].native} />
              <ConfigItem label="Formula" value={FORMULAS[formula].label} />
              <ConfigItem
                label="Tone"
                value={
                  tone === "custom"
                    ? `Custom: ${customTone.slice(0, 30)}...`
                    : TONES[tone].label
                }
              />
              <ConfigItem label="Length" value={length} />
              <ConfigItem label="Model" value={model || "Auto"} />
              <ConfigItem label="Affiliate" value={includeAffiliate ? "Yes" : "No"} />
              {showTemplateInput && customTemplate && (
                <ConfigItem label="Template" value="Custom sample provided" />
              )}
            </div>

            {/* Kyma Sponsor Badge */}
            <div className="p-4 rounded-xl border border-[#fcbb00]/15 bg-gradient-to-r from-[#fcbb00]/5 to-[#fcbb00]/[0.02]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/40">AI by</span>
                  <a
                    href="https://kymaapi.com"
                    target="_blank"
                    className="text-sm font-medium text-[#fcbb00] hover:text-[#fdd44a] transition"
                  >
                    Kyma API
                  </a>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-[#fcbb00]/10 text-[#fcbb00]/70 border border-[#fcbb00]/20">
                    sponsor
                  </span>
                </div>
                <a
                  href="https://kymaapi.com/signup"
                  target="_blank"
                  className="text-xs text-[#fcbb00]/50 hover:text-[#fcbb00] transition"
                >
                  Get your own API key — free credits →
                </a>
              </div>
              <p className="text-xs text-white/30 mt-2">
                Free to use (max 30 generations/day). Need more? Sign up for your own Kyma API key.
              </p>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setStep(1)}
                className="flex-1 py-3 rounded-xl border border-white/10 text-white/60 hover:text-white hover:border-white/20 transition"
              >
                Back to Edit
              </button>
              <button
                onClick={handleGenerate}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-semibold hover:opacity-90 transition"
              >
                Generate Content
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Output */}
        {step === 3 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold">Generated Content</h2>
                {isGenerating && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 animate-pulse">
                    {genPhase === "connecting" && "Connecting..."}
                    {genPhase === "thinking" && "AI is thinking..."}
                    {genPhase === "streaming" && "Writing..."}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* Elapsed time */}
                {(isGenerating || usedModel) && (
                  <span className="text-xs text-white/30 tabular-nums">
                    {(elapsedMs / 1000).toFixed(1)}s
                  </span>
                )}
                {usedModel && (
                  <span className="text-xs text-white/40">
                    {usedModel} · {tokenCount} tokens
                  </span>
                )}
                {output && !isGenerating && (
                  <>
                    <button
                      onClick={copyToClipboard}
                      className="px-3 py-1.5 rounded-lg border border-white/10 text-sm hover:border-white/20 transition"
                    >
                      Copy
                    </button>
                    <button
                      onClick={() => {
                        setOutput("");
                        setStep(1);
                      }}
                      className="px-3 py-1.5 rounded-lg border border-white/10 text-sm hover:border-white/20 transition"
                    >
                      Regenerate
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Progress bar while generating */}
            {isGenerating && (
              <div className="mb-4">
                <div className="flex items-center gap-3 mb-2">
                  {/* Phase dots */}
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full transition-all ${
                      genPhase === "connecting" ? "bg-amber-400 animate-pulse" : "bg-emerald-500"
                    }`} />
                    <span className="text-xs text-white/40">Connect</span>
                  </div>
                  <div className="w-4 h-px bg-white/10" />
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full transition-all ${
                      genPhase === "thinking" ? "bg-amber-400 animate-pulse" :
                      genPhase === "streaming" || genPhase === "done" ? "bg-emerald-500" : "bg-white/10"
                    }`} />
                    <span className="text-xs text-white/40">Think</span>
                  </div>
                  <div className="w-4 h-px bg-white/10" />
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full transition-all ${
                      genPhase === "streaming" ? "bg-emerald-400 animate-pulse" :
                      genPhase === "done" ? "bg-emerald-500" : "bg-white/10"
                    }`} />
                    <span className="text-xs text-white/40">Stream</span>
                  </div>
                </div>
                {/* Streaming progress bar */}
                {genPhase === "streaming" && (
                  <div className="h-0.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 rounded-full animate-pulse" style={{ width: "100%" }} />
                  </div>
                )}
                {genPhase !== "streaming" && (
                  <div className="h-0.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400/60 rounded-full origin-left animate-[indeterminate_1.5s_ease-in-out_infinite]" style={{ width: "30%" }} />
                  </div>
                )}
              </div>
            )}

            {/* Thinking panel — collapsible like Claude/Grok */}
            {reasoning && (
              <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/5 overflow-hidden">
                <button
                  onClick={() => setShowThinking(!showThinking)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-amber-400/80 hover:text-amber-400 transition"
                >
                  <div className="flex items-center gap-2">
                    {isGenerating && genPhase === "thinking" && (
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    )}
                    <span>
                      {isGenerating && genPhase === "thinking" ? "Thinking..." : "Thought process"}
                    </span>
                    <span className="text-xs text-white/20">
                      {reasoning.length > 100 ? `${Math.round(reasoning.length / 4)} tokens` : ""}
                    </span>
                  </div>
                  <span className="text-xs">{showThinking ? "▲ Hide" : "▼ Show"}</span>
                </button>
                {showThinking && (
                  <div className="px-4 pb-3 max-h-[200px] overflow-y-auto text-xs text-white/40 leading-relaxed whitespace-pre-wrap font-mono border-t border-amber-500/10">
                    {reasoning}
                  </div>
                )}
              </div>
            )}

            <div
              ref={outputRef}
              className="p-6 rounded-xl border border-white/10 bg-white/[0.02] min-h-[300px] max-h-[600px] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed font-mono"
            >
              {output ? (
                <>
                  {output.startsWith("Error") ? (
                    <div className="flex flex-col items-center justify-center h-[250px] gap-4">
                      <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-400 text-lg">!</div>
                      <p className="text-red-400 text-sm text-center max-w-md">{output}</p>
                      <button
                        onClick={() => { setOutput(""); setStep(2); }}
                        className="px-4 py-2 rounded-lg border border-white/10 text-sm hover:border-white/20 transition"
                      >
                        Try Again
                      </button>
                    </div>
                  ) : (
                    <>
                      {output}
                      {isGenerating && <span className="inline-block w-2 h-4 bg-emerald-400 ml-0.5 animate-pulse" />}
                    </>
                  )}
                </>
              ) : isGenerating ? (
                <div className="flex flex-col items-center justify-center h-[250px] gap-4">
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                  <p className="text-white/40 text-sm">
                    {genPhase === "connecting" && "Connecting to AI..."}
                    {genPhase === "thinking" && "Analyzing program data & building prompt..."}
                  </p>
                  <p className="text-white/20 text-xs">
                    First tokens usually arrive within 3-8 seconds
                  </p>
                </div>
              ) : (
                <span className="text-white/30">Waiting for content...</span>
              )}
            </div>

            {output && !isGenerating && (
              <div className="mt-6 p-4 rounded-xl border border-white/10 bg-white/[0.02]">
                <p className="text-xs text-white/40 mb-2">Quick actions:</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      setFormula(formula === "pas" ? "aida" : "pas");
                      handleGenerate();
                    }}
                    className="px-3 py-1.5 rounded-lg border border-white/10 text-xs hover:border-emerald-500/30 transition"
                  >
                    Try different formula
                  </button>
                  <button
                    onClick={() => {
                      const platforms: Platform[] = ["linkedin", "x", "blog", "reddit"];
                      const next =
                        platforms[(platforms.indexOf(platform) + 1) % platforms.length];
                      setPlatform(next);
                      handleGenerate();
                    }}
                    className="px-3 py-1.5 rounded-lg border border-white/10 text-xs hover:border-emerald-500/30 transition"
                  >
                    Try next platform
                  </button>
                  <button
                    onClick={() => {
                      const langs: Language[] = ["en", "vi", "ja", "zh"];
                      const next = langs[(langs.indexOf(language) + 1) % langs.length];
                      setLanguage(next);
                      handleGenerate();
                    }}
                    className="px-3 py-1.5 rounded-lg border border-white/10 text-xs hover:border-emerald-500/30 transition"
                  >
                    Try next language
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Kyma + usage info */}
        <div className="mt-12 flex items-center justify-between text-xs text-white/30">
          <span>
            AI by{" "}
            <a
              href="https://kymaapi.com"
              target="_blank"
              className="text-[#fcbb00]/60 hover:text-[#fcbb00]"
            >
              Kyma API
            </a>{" "}
            · {remaining !== null
              ? `${remaining} generations remaining today`
              : "Free — 30 generations/day"}
          </span>
          <a
            href="https://kymaapi.com/signup"
            target="_blank"
            className="text-[#fcbb00]/40 hover:text-[#fcbb00]/70 transition"
          >
            Get free API credits →
          </a>
        </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-sm font-medium text-white/70 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function ConfigItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-white/40">{label}</div>
      <div className="text-sm font-medium capitalize">{value}</div>
    </div>
  );
}
