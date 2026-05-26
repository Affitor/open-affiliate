export type Platform = "linkedin" | "x" | "blog" | "reddit";
export type Language = "en" | "vi" | "ja" | "zh";
export type Formula =
  | "aida"
  | "pas"
  | "bab"
  | "toplist"
  | "storytelling"
  | "how-to"
  | "review"
  | "comparison"
  | "case-study"
  | "thread";
export type Tone =
  | "professional"
  | "bold"
  | "educational"
  | "storytelling"
  | "analytical"
  | "casual"
  | "provocative"
  | "inspirational"
  | "humorous"
  | "custom";

export interface Program {
  name: string;
  slug: string;
  url: string;
  commission: string;
  cookie_days: number;
  category: string;
  description: string;
  features?: string[];
  pros?: string[];
  cons?: string[];
}

export interface GenerateRequest {
  program: Program;
  platform: Platform;
  language: Language;
  formula: Formula;
  tone: Tone;
  customTone?: string;
  customTemplate?: string;
  length: "short" | "medium" | "long";
  includeAffiliate: boolean;
  affiliateLink?: string;
  model?: string;
}

export interface GenerateResponse {
  content: string;
  model: string;
  platform: Platform;
  language: Language;
}

export const PLATFORMS: Record<Platform, { label: string; icon: string; description: string }> = {
  linkedin: { label: "LinkedIn", icon: "💼", description: "Professional post (text or carousel)" },
  x: { label: "X (Twitter)", icon: "𝕏", description: "Thread or single tweet" },
  blog: { label: "Blog", icon: "📝", description: "SEO article, listicle, or review" },
  reddit: { label: "Reddit", icon: "🤖", description: "Post + comment strategy" },
};

export const LANGUAGES: Record<Language, { label: string; native: string }> = {
  en: { label: "English", native: "English" },
  vi: { label: "Vietnamese", native: "Tiếng Việt" },
  ja: { label: "Japanese", native: "日本語" },
  zh: { label: "Chinese", native: "中文" },
};

export const FORMULAS: Record<Formula, { label: string; description: string }> = {
  aida: { label: "AIDA", description: "Attention → Interest → Desire → Action" },
  pas: { label: "PAS", description: "Problem → Agitate → Solution" },
  bab: { label: "BAB", description: "Before → After → Bridge" },
  toplist: { label: "Top List", description: "Numbered list with comparison" },
  storytelling: { label: "Story", description: "Narrative hook → lesson → CTA" },
  "how-to": { label: "How-to", description: "Step-by-step guide with tips" },
  review: { label: "Review", description: "Honest review with pros/cons/verdict" },
  comparison: { label: "VS Compare", description: "X vs Y vs Z breakdown" },
  "case-study": { label: "Case Study", description: "Real result → how → takeaway" },
  thread: { label: "Thread/Series", description: "Multi-part connected posts" },
};

export const TONES: Record<Tone, { label: string }> = {
  professional: { label: "Professional" },
  bold: { label: "Bold & Provocative" },
  educational: { label: "Educational" },
  storytelling: { label: "Storytelling" },
  analytical: { label: "Analytical" },
  casual: { label: "Casual & Friendly" },
  provocative: { label: "Contrarian" },
  inspirational: { label: "Inspirational" },
  humorous: { label: "Humorous" },
  custom: { label: "Custom (paste below)" },
};

export const MODELS = [
  { id: "qwen-3.6-plus", label: "Qwen 3.6 Plus", best_for: "VN/CN content, high quality" },
  { id: "deepseek-v3", label: "DeepSeek V3", best_for: "Long-form, multilingual" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", best_for: "Fast drafts, short content" },
  { id: "minimax-m2.7", label: "MiniMax M2.7", best_for: "Cost-optimized bulk" },
  { id: "qwen-3-coder", label: "Qwen 3 Coder", best_for: "Structured output" },
  { id: "glm-5.1", label: "GLM 5.1", best_for: "Chinese content" },
];
