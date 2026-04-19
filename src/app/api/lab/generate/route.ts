import { type NextRequest } from "next/server";
import {
  getProgram,
  programs,
  type Program,
  parseCommissionRate,
} from "@/lib/programs";

const KYMA_API_URL = "https://kymaapi.com/v1/chat/completions";
const KYMA_API_KEY = process.env.KYMA_API_KEY ?? "";

const CONTENT_TYPES: Record<
  string,
  { model: string; buildPrompt: (p: Program, ps: Program[]) => string }
> = {
  toplist: {
    model: "deepseek-v3",
    buildPrompt: (p, ps) => buildTopListPrompt(p, ps),
  },
  howto: {
    model: "deepseek-v3",
    buildPrompt: (p) => buildHowToPrompt(p),
  },
  review: {
    model: "deepseek-v3",
    buildPrompt: (p) => buildReviewPrompt(p),
  },
  social: {
    model: "qwen-3.6-plus",
    buildPrompt: (p) => buildSocialPrompt(p),
  },
};

/* ── Helpers ──────────────────────────────────────────────────── */

function programContext(p: Program): string {
  return `
Product: ${p.name}
URL: ${p.url}
Category: ${p.category}
Description: ${p.description || p.shortDescription}
Commission: ${p.commission.rate} (${p.commission.type}${p.commission.duration ? `, ${p.commission.duration}` : ""})
${p.commission.conditions ? `Conditions: ${p.commission.conditions}` : ""}
Cookie Duration: ${p.cookieDays} days
Attribution: ${p.attribution || "last-click"}
Payout: $${p.payout.minimum} minimum, ${p.payout.frequency}
Tags: ${p.tags.join(", ")}
${p.signupUrl ? `Affiliate Signup: ${p.signupUrl}` : ""}
${p.network ? `Network: ${p.network}` : ""}
`.trim();
}

function programBrief(p: Program): string {
  return `- **${p.name}** (${p.url}) — ${p.category}. Commission: ${p.commission.rate} ${p.commission.type}. Cookie: ${p.cookieDays}d. ${p.shortDescription || p.description?.slice(0, 120) || ""}`;
}

/** Find top programs in the same category, sorted by commission rate */
function findCategoryPeers(p: Program, limit = 9): Program[] {
  return programs
    .filter((x) => x.slug !== p.slug && x.category === p.category)
    .sort((a, b) => parseCommissionRate(b.commission.rate) - parseCommissionRate(a.commission.rate))
    .slice(0, limit);
}

/* ── Prompt builders ──────────────────────────────────────────── */

function buildTopListPrompt(p: Program, extraPeers: Program[]): string {
  // Combine: selected program + auto-found category peers + manually added peers
  const autoPeers = findCategoryPeers(p, 9);
  const manualSlugs = new Set(extraPeers.map((x) => x.slug));
  const allPeers = [
    ...extraPeers,
    ...autoPeers.filter((x) => !manualSlugs.has(x.slug)),
  ].slice(0, 9);

  const allPrograms = [p, ...allPeers];
  const count = allPrograms.length;
  const listData = allPrograms.map((x) => programBrief(x)).join("\n");

  return `Write a "Top ${count} Best ${p.category} Tools" listicle article for affiliate marketers.

PRODUCT DATA (from our registry — use ONLY this data, do not invent products):
${listData}

## Article structure:

### Title
"Top ${count} Best ${p.category} Tools in 2026 (Honest Breakdown)"

### Introduction (3-4 sentences)
- What problem does this category solve?
- Why picking the right tool matters
- Brief mention: "We compared ${count} tools based on features, pricing, and affiliate earning potential"

### The List
For EACH product, write a numbered entry with:
- **Product Name** — one-line tagline
- **Best for:** (1 specific use case)
- **Key strength:** (1 standout feature, 2 sentences max)
- **Pricing signal:** (free tier? starting price? enterprise-only?)
- **Affiliate angle:** Commission rate + cookie duration in 1 line
- Keep each entry to 60-80 words. Tight and scannable.

### Quick Comparison Table
Markdown table with columns: Tool | Best For | Commission | Cookie | Type

### How We Ranked These
2-3 sentences on methodology (features, value, affiliate terms, real usage)

### Bottom Line
2 sentences: top pick + runner-up with reasoning

## Rules:
- Rank #1 = ${p.name} (the user's selected product) — but be subtle, don't oversell
- Be honest about limitations — readers trust lists that acknowledge tradeoffs
- Write for someone scanning on mobile: short paragraphs, bold key info
- Every product entry must use ONLY facts from the data above
- Do NOT invent features, pricing, or statistics
- Markdown formatting throughout
- Target: 600-900 words`;
}

function buildHowToPrompt(p: Program): string {
  return `Write a practical "How to Use ${p.name}" getting-started guide.

PRODUCT DATA:
${programContext(p)}

## Article structure:

### Title
"How to Get Started with ${p.name}: A Step-by-Step Guide"

### Who This Is For (2 sentences)
Describe the target reader and what they'll accomplish by the end.

### Prerequisites
Bullet list: what you need before starting (account, plan level, etc.)

### Step-by-Step Guide (5-7 steps)
For EACH step:
- **Step N: [Action verb] [what]**
- 2-3 sentences explaining what to do and why
- A practical tip or gotcha in *italics*

Structure the steps as a real onboarding flow:
1. Sign up / create account
2. Initial setup / configuration
3. Core feature walkthrough (the main value)
4. Intermediate feature (the "aha" moment)
5. Integration or automation setup
6. Optimization / pro tip
7. Measure results / next steps

### 3 Pro Tips
Numbered list of power-user advice that most guides miss.

### Common Mistakes to Avoid
3 bullet points — things beginners get wrong.

### What's Next?
2 sentences on advanced features to explore. Naturally mention that ${p.name} has an affiliate program for those who want to recommend it.

## Rules:
- Write as a practitioner who actually uses the tool, not a marketer
- Be specific: "Click Settings > Integrations" not "Go to settings"
- Include realistic examples (e.g., "Create a database called 'Client Tracker'")
- Do NOT fabricate UI elements or features not implied by the product data
- If you're unsure about specific UI details, use general but plausible descriptions
- Markdown formatting with clear headers
- Target: 600-800 words`;
}

function buildReviewPrompt(p: Program): string {
  return `Write a comprehensive, honest product review for affiliate marketers.

PRODUCT DATA:
${programContext(p)}

Write a review article with these sections:
1. **Hook** (2-3 sentences that grab attention with a real problem this product solves)
2. **What is ${p.name}?** (brief overview, who it's for)
3. **Key Features** (5-7 features with brief explanations)
4. **Pricing & Value** (1 paragraph, honest)
5. **Pros & Cons** (3 each, bullet points)
6. **Who Should Use ${p.name}?** (3 specific personas)
7. **Verdict** (2-3 sentences with clear recommendation)

Rules:
- Conversational, authoritative tone
- Include specific details from the product data
- Mention the affiliate program naturally once
- Do NOT fabricate statistics or testimonials
- Use markdown formatting
- Keep each section concise — no filler
- Target length: 500-700 words`;
}

function buildSocialPrompt(p: Program): string {
  return `Create a social media content pack for promoting this product.

PRODUCT DATA:
${programContext(p)}

Create ALL of the following:

## 1. X/Twitter Thread (5 tweets)
- Tweet 1: Hook (problem or bold claim)
- Tweet 2-4: Value (features, use cases, proof)
- Tweet 5: CTA with affiliate angle
- Include relevant hashtags

## 2. LinkedIn Post
- Professional tone, 150-200 words
- Lead with insight or industry trend
- Mention the product as a solution
- End with engagement question

## 3. Reddit Post (r/SaaS or relevant subreddit)
- Title: genuine question or discovery format
- Body: personal experience tone, 200-300 words
- NOT salesy — Reddit hates obvious promotion
- Mention affiliate program only if asked in comments

## 4. Short-form Video Script (30-60 seconds)
- Hook (3 seconds)
- Problem (5 seconds)
- Solution demo (15-20 seconds)
- CTA (5 seconds)
- Include visual directions in [brackets]

Rules:
- Each platform should feel native to that platform
- Use markdown formatting with clear section headers
- Be authentic — no hype language`;
}

/* ── Route handler ────────────────────────────────────────────── */

export async function POST(request: NextRequest) {
  if (!KYMA_API_KEY) {
    return new Response(
      JSON.stringify({ error: "KYMA_API_KEY not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const body = await request.json();
  const { slug, type, compareSlugs } = body as {
    slug: string;
    type: string;
    compareSlugs?: string[];
  };

  const program = getProgram(slug);
  if (!program) {
    return new Response(JSON.stringify({ error: "Program not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const config = CONTENT_TYPES[type];
  if (!config) {
    return new Response(JSON.stringify({ error: "Invalid content type" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // For toplist: use manually selected peers + auto-find category peers
  const peers =
    compareSlugs
      ?.map((s) => getProgram(s))
      .filter(Boolean) as Program[] ?? [];

  const prompt = config.buildPrompt(program, peers);

  const response = await fetch(KYMA_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KYMA_API_KEY}`,
      "Content-Type": "application/json",
      "X-App-Name": "OpenAffiliate Content Lab",
    },
    body: JSON.stringify({
      model: config.model,
      stream: true,
      messages: [
        {
          role: "system",
          content:
            "You are an expert affiliate content writer. You create high-converting, authentic content based on real product data. Always use markdown formatting. Never fabricate statistics, testimonials, or features not present in the product data.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 8192,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    return new Response(
      JSON.stringify({ error: "Kyma API error", detail: err }),
      {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return new Response(response.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
