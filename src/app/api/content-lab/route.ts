import OpenAI from "openai";
import { GenerateRequest, Program } from "@/lib/content-lab-types";
import { buildPrompt } from "@/lib/content-lab-prompts";
export const maxDuration = 120;

// In-memory rate limiter: IP -> { count, resetAt }
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const MAX_GENERATIONS = 30;
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

function getRateLimitKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  const ip = forwarded?.split(",")[0]?.trim() || realIp || "unknown";
  return ip;
}

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimits.get(ip);

  if (!entry || now >= entry.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_GENERATIONS - 1 };
  }

  if (entry.count >= MAX_GENERATIONS) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: MAX_GENERATIONS - entry.count };
}

// Clean up stale entries every hour
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimits) {
    if (now >= entry.resetAt) rateLimits.delete(ip);
  }
}, 60 * 60 * 1000);

export async function POST(req: Request) {
  const ip = getRateLimitKey(req);
  const { allowed, remaining } = checkRateLimit(ip);

  if (!allowed) {
    return Response.json(
      { error: "Rate limit reached (30 generations per day). Sign up at kymaapi.com for your own API key with free credits." },
      { status: 429 }
    );
  }

  const body = (await req.json()) as GenerateRequest & { programs?: Program[] };
  const { model, programs, ...request } = body;
  if (programs && programs.length > 1) {
    (request as GenerateRequest & { programs?: Program[] }).programs = programs;
  }

  const key = process.env.KYMA_API_KEY;
  if (!key) {
    return Response.json(
      { error: "Server configuration error. Please try again later." },
      { status: 500 }
    );
  }

  const client = new OpenAI({
    apiKey: key,
    baseURL: "https://kymaapi.com/v1",
  });

  const selectedModel = model || getRecommendedModel(request.language, request.platform);
  const { system, user } = buildPrompt(request);

  let stream;
  try {
    stream = await client.chat.completions.create({
      model: selectedModel,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      stream: true,
      max_tokens: getMaxTokens(request.length, request.platform),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to connect to AI";
    return Response.json({ error: message }, { status: 502 });
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      let totalTokens = 0;
      let reasoningChunks = 0;
      try {
        for await (const chunk of stream) {
          const rawDelta = chunk.choices[0]?.delta;
          const text = rawDelta?.content || "";
          const reasoning = (rawDelta as Record<string, unknown>)?.reasoning_content || (rawDelta as Record<string, unknown>)?.reasoning || "";

          if (text) {
            totalTokens++;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
          } else if (reasoning) {
            reasoningChunks++;
            // Forward reasoning text to client for thinking UI
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ reasoning: String(reasoning) })}\n\n`));
          }
        }
        console.log(`[content-lab] Stream complete: ${totalTokens} tokens via ${selectedModel} (IP: ${ip}, remaining: ${remaining})`);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, model: selectedModel, tokens: totalTokens, remaining })}\n\n`));
        controller.close();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Generation failed";
        console.error(`[content-lab] Stream error: ${message}`);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-RateLimit-Remaining": remaining.toString(),
    },
  });
}

function getRecommendedModel(language: string, platform: string): string {
  if (platform === "x") return "gemini-2.5-flash";
  if (platform === "blog") return "deepseek-v3";
  if (language === "ja" || language === "zh") return "deepseek-v3";
  return "gemini-2.5-flash";
}

function getMaxTokens(length: string, platform: string): number {
  if (platform === "blog" && length === "long") return 4000;
  if (length === "long") return 2000;
  if (length === "medium") return 1000;
  return 500;
}
