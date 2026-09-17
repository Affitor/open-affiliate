import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

/**
 * SIFT Cron — Scores new social_items that haven't been scored yet.
 *
 * Runs daily via Vercel Cron (see vercel.json).
 * Secured by CRON_SECRET env var.
 *
 * Flow:
 *   1. Fetch unscored items (sift_score IS NULL), limit 500 per run
 *   2. Pre-filter obvious junk with rules (no LLM cost)
 *   3. Send remaining to Kyma API (qwen-3-32b) for scoring
 *   4. Write sift_score, sift_tag, sift_reason back to Supabase
 *
 * Source of truth for SIFT logic: scripts/sift-score.ts
 * This route calls the same scoring logic in a serverless-friendly way.
 */

export const maxDuration = 300 // 5 min max for Vercel Functions

const KYMA_API_KEY = process.env.KYMA_API_KEY
const KYMA_BASE_URL = "https://kymaapi.com/v1"
const MODEL = "qwen-3-32b"
const BATCH_SIZE = 50
const MAX_ITEMS_PER_RUN = 500

const SYSTEM_PROMPT = `You are SIFT — a content relevance classifier for affiliate marketing data.

Given a list of content items, each associated with a software product (program_slug), score how relevant the content is to that specific product or affiliate marketing of that product.

CRITICAL RULE: If the title and snippet do NOT explicitly mention the product name, brand name, or a very closely related term, the maximum score is 3. Topic similarity alone is NOT enough — the content must actually be ABOUT that specific product. Generic affiliate/marketing content assigned to a random program slug should score 0-1.

Scoring guide:
- 0: Completely unrelated. Wrong video/post entirely. OR generic affiliate content with no mention of the specific product.
- 1: Name collision — content mentions a word matching the product name but is about something else.
- 2: Spam — generic "#affiliate #fyp" hashtag spam with no product relevance.
- 3: Tangential — same broad industry but does NOT mention the specific product by name.
- 4-5: Mentions product — references the product name but only in passing.
- 6-7: Review/tutorial — the content is primarily about this product.
- 8-9: Dedicated affiliate content — explicit affiliate link, sponsored post, in-depth walkthrough.
- 10: Perfect match — detailed affiliate review with product demo, pros/cons, and signup link.

Common traps — score these LOW:
- Generic "#affiliate #fyp" hashtag spam with no actual product mention → score 0
- Music videos, comedy skits, or unrelated viral content matched by keyword → score 0
- Foreign language content where the product name matches a common word → score 1
- Content about a DIFFERENT product that happens to share the program slug → score 0-1
- "TikTok affiliate tutorial" or "how to make money online" assigned to a random SaaS product → score 0
- YouTube reaction channels with the same name as the software → score 1
- Physical products that share a name with software → score 1

For each item return:
- score (0-10): integer relevance score
- tag: one of ["junk", "name_collision", "spam", "tangential", "related", "review", "tutorial", "comparison", "affiliate_content"]
- reason: 1 concise sentence explaining why

Return JSON: {"results": [{"id": number, "score": number, "tag": string, "reason": string}]}`

// ── Pre-filter rules ──

const SPAM_PATTERNS = [
  /^i'?m new on tiktok/i,
  /please support me/i,
  /new on tiktok.*support/i,
  /please follow me/i,
  /follow for follow/i,
]

const JUNK_PATTERNS = [
  /residuals?\s*\(lyrics?\)/i,
  /official\s*(music\s*)?video/i,
  /full\s*(movie|episode|album)/i,
  /asmr/i,
]

interface SocialItem {
  id: number
  program_slug: string
  platform: string
  title: string
  author: string
  snippet: string | null
  views: number
}

interface SiftResult {
  id: number
  score: number
  tag: string
  reason: string
}

function preFilter(item: SocialItem): SiftResult | null {
  const title = item.title.toLowerCase()
  const slugWords = item.program_slug.replace(/-/g, " ").toLowerCase().split(" ").filter((w) => w.length > 2)

  for (const p of SPAM_PATTERNS) {
    if (p.test(item.title)) return { id: item.id, score: 0, tag: "spam", reason: "Auto-filtered: spam pattern" }
  }
  for (const p of JUNK_PATTERNS) {
    if (p.test(item.title)) return { id: item.id, score: 0, tag: "junk", reason: "Auto-filtered: unrelated content" }
  }

  const hasSlugWord = slugWords.some((w) => title.includes(w))
  const hasAffiliate = /#ad\b|sponsored|affiliate|review|tutorial|compared|alternative/i.test(item.title)
  if (!hasSlugWord && !hasAffiliate && item.views > 1_000_000) {
    return { id: item.id, score: 0, tag: "junk", reason: "Auto-filtered: high-view, no product mention" }
  }

  return null
}

function sanitize(text: string): string {
  return text.replace(/[\u{1F000}-\u{1FFFF}]/gu, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").trim()
}

async function scoreBatch(items: SocialItem[]): Promise<SiftResult[]> {
  const payload = items.map((item) => ({
    id: item.id,
    program: item.program_slug,
    platform: item.platform,
    title: sanitize(item.title).substring(0, 150),
    author: sanitize(item.author).substring(0, 50),
    ...(item.snippet ? { snippet: sanitize(item.snippet).substring(0, 200) } : {}),
  }))

  const res = await fetch(`${KYMA_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KYMA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(payload) },
      ],
    }),
  })

  if (!res.ok) throw new Error(`Kyma API ${res.status}`)

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error("Empty Kyma response")

  return JSON.parse(content).results as SiftResult[]
}

// ── Handler ──

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!KYMA_API_KEY) {
    return NextResponse.json({ error: "KYMA_API_KEY is not set" }, { status: 500 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  )

  // Fetch unscored items
  const { data: items, error } = await supabase
    .from("social_items")
    .select("id, program_slug, platform, title, author, snippet, views")
    .is("sift_score", null)
    .order("views", { ascending: false })
    .limit(MAX_ITEMS_PER_RUN)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!items || items.length === 0) {
    return NextResponse.json({ message: "No unscored items", scored: 0 })
  }

  // Pre-filter
  const preFiltered: SiftResult[] = []
  const needsLLM: SocialItem[] = []

  for (const item of items as SocialItem[]) {
    const result = preFilter(item)
    if (result) preFiltered.push(result)
    else needsLLM.push(item)
  }

  // Write pre-filtered
  for (const r of preFiltered) {
    await supabase
      .from("social_items")
      .update({ sift_score: r.score, sift_tag: r.tag, sift_reason: r.reason, sift_scored_at: new Date().toISOString() })
      .eq("id", r.id)
  }

  // LLM scoring in batches (sequential to stay within timeout)
  let llmScored = 0
  for (let i = 0; i < needsLLM.length; i += BATCH_SIZE) {
    const batch = needsLLM.slice(i, i + BATCH_SIZE)
    try {
      const results = await scoreBatch(batch)
      for (const r of results) {
        await supabase
          .from("social_items")
          .update({ sift_score: r.score, sift_tag: r.tag, sift_reason: r.reason, sift_scored_at: new Date().toISOString() })
          .eq("id", r.id)
      }
      llmScored += results.length
    } catch (err) {
      console.error(`SIFT batch failed:`, err)
      // Continue with next batch
    }
  }

  return NextResponse.json({
    message: "SIFT scoring complete",
    total: items.length,
    pre_filtered: preFiltered.length,
    llm_scored: llmScored,
    scored: preFiltered.length + llmScored,
  })
}
