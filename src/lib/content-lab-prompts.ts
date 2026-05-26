import { GenerateRequest, Platform, Language, Formula, Tone } from "./content-lab-types";

const PLATFORM_RULES: Record<Platform, string> = {
  linkedin: `Platform: LinkedIn
- Professional but not boring
- Max 3000 characters for text posts
- Use line breaks generously (every 1-2 sentences)
- Start with a hook (first line visible before "see more")
- End with a question or CTA to drive engagement
- No hashtags in body, max 3-5 hashtags at the end
- NO markdown, NO asterisks, NO bullet symbols
- Use plain text with line breaks for structure
- Emojis sparingly (max 2-3 per post)`,

  x: `Platform: X (Twitter)
- Thread format: number each tweet (1/, 2/, etc.)
- Each tweet max 280 characters
- First tweet must hook — no fluff
- Last tweet = CTA with link
- 5-8 tweets for a thread
- Short sentences, high density
- No hashtags in thread body, 1-2 in last tweet
- NO markdown, plain text only`,

  blog: `Platform: Blog/SEO Article
- Use markdown formatting (## headings, **bold**, bullet lists)
- Start with a compelling intro paragraph (no "In this article...")
- Include H2 and H3 subheadings for scannability
- 800-2000 words depending on length setting
- Include a TL;DR at the top
- Natural keyword usage (no stuffing)
- End with clear CTA section
- Include comparison tables where relevant (markdown tables)`,

  reddit: `Platform: Reddit
- Authentic, non-promotional tone (Reddit hates obvious marketing)
- Write as a real user sharing genuine experience
- Include specific details, numbers, timelines
- Acknowledge downsides honestly
- DO NOT use affiliate link in post body — mention product naturally
- Format: story/experience first, then recommendation
- Use markdown formatting (Reddit supports it)
- Add a "TLDR:" at the bottom
- Suggest adding affiliate link only in profile or follow-up comment`,
};

const LANGUAGE_INSTRUCTIONS: Record<Language, string> = {
  en: "Write entirely in English. Use clear, direct language.",
  vi: "Viết hoàn toàn bằng tiếng Việt. Sử dụng ngôn ngữ tự nhiên, không dịch máy. Giữ thuật ngữ tech bằng tiếng Anh khi cần (VD: hosting, SEO, API).",
  ja: "日本語で書いてください。自然な日本語を使い、技術用語は必要に応じて英語のままにしてください。敬体（です・ます調）を使用してください。",
  zh: "请用中文撰写。使用自然流畅的中文表达，技术术语可保留英文。语气专业但不生硬。",
};

const FORMULA_PROMPTS: Record<Formula, string> = {
  aida: `Formula: AIDA
Structure your content as:
1. ATTENTION: Bold opening statement or surprising fact
2. INTEREST: Explain the problem/opportunity with specifics
3. DESIRE: Show what the solution enables (benefits, results)
4. ACTION: Clear next step / CTA`,

  pas: `Formula: PAS (Problem-Agitate-Solution)
Structure your content as:
1. PROBLEM: State the pain point clearly
2. AGITATE: Make it worse — show consequences of not solving it
3. SOLUTION: Present the product as the answer with proof`,

  bab: `Formula: BAB (Before-After-Bridge)
Structure your content as:
1. BEFORE: Paint the current painful situation
2. AFTER: Show the ideal state after using the solution
3. BRIDGE: Connect them — explain how the product gets you there`,

  toplist: `Formula: Top List
Structure as a numbered ranking:
- Clear criteria for ranking
- 3-7 items with brief description of each
- Highlight the recommended option
- Include comparison points (price, features, best for)`,

  storytelling: `Formula: Storytelling
Structure as a narrative:
1. HOOK: Start with a specific moment or scenario
2. CONFLICT: What went wrong / the challenge
3. JOURNEY: What was tried, what failed
4. RESOLUTION: How the product solved it
5. LESSON: Takeaway for the reader`,

  "how-to": `Formula: How-to Guide
Structure as actionable steps:
1. What you'll achieve (outcome)
2. Prerequisites / what you need
3. Step-by-step instructions (numbered)
4. Pro tips for each step
5. Expected results / next steps`,

  review: `Formula: Honest Review
Structure:
1. TL;DR verdict (1 sentence)
2. What it is (brief)
3. What I liked (specific features + results)
4. What could be better (honest cons)
5. Who it's for / not for
6. Verdict + recommendation`,

  comparison: `Formula: VS Comparison
Structure:
1. The decision context (why compare these)
2. Quick comparison table/overview
3. Category-by-category breakdown
4. Use case recommendations (X is better for..., Y is better for...)
5. Final verdict`,

  "case-study": `Formula: Case Study
Structure:
1. The result (lead with the outcome)
2. The starting point (where they were)
3. The process (what they did, step by step)
4. Key decisions that mattered
5. Reproducible takeaways for the reader`,

  thread: `Formula: Thread/Series
Structure as connected multi-part content:
- Part 1: Hook + promise what they'll learn
- Parts 2-6: One key insight per part, each standalone valuable
- Final part: Summary + CTA
- Each part references the next ("More in part 2...")`,
};

const TONE_INSTRUCTIONS: Record<Tone, string> = {
  professional: "Tone: Professional and credible. Data-driven, confident but not arrogant. Like a senior consultant writing for peers.",
  bold: "Tone: Bold and provocative. Challenge conventional wisdom. Use strong statements. Like a founder who's seen the industry from inside.",
  educational: "Tone: Educational and clear. Teach, explain, break down complexity. Like a patient expert mentor.",
  storytelling: "Tone: Narrative and emotional. Use specific scenes, dialogue, sensory details. Like a journalist telling a human story.",
  analytical: "Tone: Analytical and data-heavy. Numbers, comparisons, percentages. Like a research analyst presenting findings.",
  casual: "Tone: Casual and friendly. Conversational, relatable, like texting a smart friend. Use contractions, humor, real talk.",
  provocative: "Tone: Contrarian and thought-provoking. Go against popular opinion with evidence. Make people stop scrolling.",
  inspirational: "Tone: Inspirational and motivating. Uplift, encourage action, share possibility. Like a coach before the big game.",
  humorous: "Tone: Humorous and witty. Use analogies, unexpected comparisons, self-deprecating humor. Entertain while informing.",
  custom: "", // Will be replaced with user's custom tone
};

const LENGTH_RULES = {
  short: "Keep it SHORT. 80-200 words max. Every word must earn its place.",
  medium: "MEDIUM length. 200-500 words. Enough detail to be useful, short enough to hold attention.",
  long: "LONG form. 500-1500 words. Comprehensive, detailed, authoritative. But never pad — every paragraph must add value.",
};

export function buildPrompt(req: GenerateRequest & { programs?: import("./content-lab-types").Program[] }): { system: string; user: string } {
  const { program, platform, language, formula, tone, customTone, customTemplate, length, includeAffiliate, affiliateLink, programs } = req;

  const toneInstruction = tone === "custom" && customTone ? `Tone: ${customTone}` : TONE_INSTRUCTIONS[tone];

  const affiliateInstruction = includeAffiliate
    ? `\nAffiliate Integration:
- Naturally weave in the affiliate link: ${affiliateLink || `[${program.name} link]`}
- Don't be salesy — the content should be valuable even without the link
- Place the link where it feels natural (after proving value, not before)
- For Reddit: mention the link belongs in profile/bio, not the post body`
    : "\nDo NOT include any links or CTAs. Pure informational content.";

  const templateInstruction = customTemplate
    ? `\n\nIMPORTANT — Match this writing style/format exactly (this is a sample from the user):
---
${customTemplate}
---
Mimic the structure, sentence patterns, formatting, and voice of the sample above. Adapt the content to be about ${program.name} but keep the STYLE identical.`
    : "";

  const system = `You are an expert affiliate content writer. You create high-converting, authentic content that provides genuine value to readers while naturally recommending products.

RULES:
- Never start with "I" as the first word
- Never use cliches like "game-changer", "revolutionary", "unlock your potential"
- Be specific — use numbers, timeframes, concrete examples
- Write like a human who actually used the product, not a marketing bot
- Every claim must be believable and specific
- If you don't know exact numbers, use realistic approximations

${PLATFORM_RULES[platform]}

${LANGUAGE_INSTRUCTIONS[language]}

${FORMULA_PROMPTS[formula]}

${toneInstruction}

${LENGTH_RULES[length]}
${affiliateInstruction}${templateInstruction}`;

  const allPrograms = programs && programs.length > 1 ? programs : [program];
  const programContexts = allPrograms.map((p) => `Product: ${p.name}
Category: ${p.category}
URL: ${p.url}
Commission: ${p.commission}
Cookie Duration: ${p.cookie_days} days
Description: ${p.description}
${p.features ? `Key Features: ${p.features.join(", ")}` : ""}
${p.pros ? `Pros: ${p.pros.join(", ")}` : ""}
${p.cons ? `Cons: ${p.cons.join(", ")}` : ""}`).join("\n\n---\n\n");

  const multiProgramNote = allPrograms.length > 1
    ? `\n\nYou are writing about ${allPrograms.length} products. Compare them fairly, highlight strengths of each, and recommend based on use case. The primary product to promote is ${program.name}.`
    : "";

  const user = `Write affiliate content for ${allPrograms.length > 1 ? "these products" : "this product"}:

${programContexts}${multiProgramNote}

Generate the content now. Follow the formula, platform rules, tone, and language specified in your instructions exactly.`;

  return { system, user };
}
