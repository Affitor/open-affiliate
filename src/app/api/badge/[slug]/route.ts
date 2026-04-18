import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { parse as parseYaml } from "yaml"
import { computeScoreV1 } from "@openaffiliate/scoring"

/**
 * GET /api/badge/[slug].svg
 *
 * Returns an SVG "Affiliate Score" badge for a program. Pure HTTP — no JS on
 * the consumer side — works in GitHub READMEs, Markdown docs, Notion, etc.
 *
 * Query params (all optional):
 *   ?variant = score | commission | cookie            (default: score)
 *   ?theme   = light | dark | flat                     (default: light)
 *   ?style   = pill | card                             (default: pill)
 *
 * Cached aggressively at the edge. Score changes are low-frequency (we re-
 * verify programs every ~30 days), so a 1-hour cache is plenty.
 */

type Variant = "score" | "commission" | "cookie"
type Theme = "light" | "dark" | "flat"
type Style = "pill" | "card"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params
  const slugClean = slug.toLowerCase().replace(/\.svg$/, "")
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slugClean)) {
    return svgError("invalid slug", 400)
  }

  const url = new URL(req.url)
  const variant = (url.searchParams.get("variant") as Variant) ?? "score"
  const theme = (url.searchParams.get("theme") as Theme) ?? "light"
  const style = (url.searchParams.get("style") as Style) ?? "pill"

  const program = await loadProgram(slugClean)
  if (!program) return svgError("program not found", 404)

  const score = computeScoreV1({
    commission: program.commission ?? null,
    cookie_days: program.cookie_days ?? null,
    verified: program.verified ?? false,
    description: program.description ?? program.short_description ?? null,
    agents: program.agents ?? null,
    signup_url: program.signup_url ?? null,
  })

  const svg = renderBadge({ slug: slugClean, program, score, variant, theme, style })

  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      "CDN-Cache-Control": "public, s-maxage=3600",
    },
  })
}

async function loadProgram(slug: string): Promise<Record<string, any> | null> {
  try {
    const programsDir =
      process.env.PROGRAMS_DIR ?? join(process.cwd(), "programs")
    const raw = await readFile(join(programsDir, `${slug}.yaml`), "utf8")
    return parseYaml(raw) as Record<string, any>
  } catch {
    return null
  }
}

// ---------- SVG rendering ---------------------------------------------------

interface RenderArgs {
  slug: string
  program: Record<string, any>
  score: ReturnType<typeof computeScoreV1>
  variant: Variant
  theme: Theme
  style: Style
}

function renderBadge(args: RenderArgs): string {
  const label = args.variant === "score" ? "Affiliate Score" : args.variant === "commission" ? "Commission" : "Cookie"
  const value = args.variant === "score"
    ? `${args.score.total.toFixed(0)} · ${args.score.tier}`
    : args.variant === "commission"
    ? (args.program.commission?.rate ?? "unknown").toString()
    : args.program.cookie_days ? `${args.program.cookie_days}d` : "—"

  if (args.style === "card") return renderCard(args, label, value)
  return renderPill(args, label, value)
}

const THEMES: Record<Theme, { bg: string; labelBg: string; labelFg: string; valueBg: string; valueFg: string; accent: string }> = {
  light: { bg: "#ffffff", labelBg: "#334155", labelFg: "#f8fafc", valueBg: "#0f172a", valueFg: "#f8fafc", accent: "#155DFC" },
  dark: { bg: "#0a0a0a", labelBg: "#27272a", labelFg: "#d4d4d8", valueBg: "#155DFC", valueFg: "#ffffff", accent: "#155DFC" },
  flat: { bg: "transparent", labelBg: "#f1f5f9", labelFg: "#334155", valueBg: "#0f172a", valueFg: "#f8fafc", accent: "#0f172a" },
}

function renderPill(args: RenderArgs, label: string, value: string): string {
  const t = THEMES[args.theme]
  const labelW = textWidth(label) + 16
  const valueW = textWidth(value) + 16
  const totalW = labelW + valueW
  const h = 22

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${h}" viewBox="0 0 ${totalW} ${h}">
  <title>${escapeXml(label)}: ${escapeXml(value)} — openaffiliate.dev</title>
  <linearGradient id="g" x2="0" y2="100%">
    <stop offset="0" stop-color="#fff" stop-opacity=".12"/>
    <stop offset="1" stop-opacity=".12"/>
  </linearGradient>
  <clipPath id="c"><rect width="${totalW}" height="${h}" rx="4"/></clipPath>
  <g clip-path="url(#c)">
    <rect width="${labelW}" height="${h}" fill="${t.labelBg}"/>
    <rect x="${labelW}" width="${valueW}" height="${h}" fill="${t.valueBg}"/>
    <rect width="${totalW}" height="${h}" fill="url(#g)"/>
  </g>
  <g fill="${t.labelFg}" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif" font-size="11">
    <text x="${labelW / 2}" y="15">${escapeXml(label)}</text>
  </g>
  <g fill="${t.valueFg}" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif" font-size="11" font-weight="600">
    <text x="${labelW + valueW / 2}" y="15">${escapeXml(value)}</text>
  </g>
</svg>`
}

function renderCard(args: RenderArgs, _label: string, _value: string): string {
  const t = THEMES[args.theme]
  const w = 280
  const h = 88
  const name = String(args.program.name ?? args.slug)
  const scoreStr = args.score.total.toFixed(0)
  const tier = args.score.tier

  const bars: Array<[string, number]> = [
    ["Commission", args.score.breakdown.commissionValue / 40 * 100],
    ["Cookie", args.score.breakdown.cookieScore / 15 * 100],
    ["Type", args.score.breakdown.typeBonus / 25 * 100],
    ["Completeness", args.score.breakdown.completeness / 10 * 100],
  ]

  const barsSvg = bars
    .map(
      ([name, pct], i) => `
    <g transform="translate(96, ${18 + i * 15})">
      <text x="0" y="8" fill="${t.labelFg}" font-size="9" font-family="system-ui">${escapeXml(name)}</text>
      <rect x="68" y="3" width="100" height="5" rx="2" fill="${t.labelBg}" opacity="0.3"/>
      <rect x="68" y="3" width="${pct}" height="5" rx="2" fill="${t.accent}"/>
    </g>`,
    )
    .join("")

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <title>${escapeXml(name)}: Affiliate Score ${scoreStr} (${tier}) — openaffiliate.dev</title>
  <rect width="${w}" height="${h}" rx="6" fill="${t.bg === "transparent" ? "#ffffff00" : t.bg}" stroke="${t.labelBg}" stroke-opacity="0.2"/>
  <g transform="translate(14, 16)">
    <circle cx="32" cy="32" r="30" fill="none" stroke="${t.labelBg}" stroke-opacity="0.2" stroke-width="4"/>
    <circle cx="32" cy="32" r="30" fill="none" stroke="${t.accent}" stroke-width="4"
            stroke-dasharray="${(args.score.total / 100) * 188.5} 188.5"
            transform="rotate(-90 32 32)" stroke-linecap="round"/>
    <text x="32" y="35" text-anchor="middle" fill="${t.accent}" font-size="18" font-weight="700" font-family="system-ui">${scoreStr}</text>
    <text x="32" y="52" text-anchor="middle" fill="${t.labelFg}" font-size="9" font-family="system-ui">${escapeXml(tier)} tier</text>
  </g>
  <text x="96" y="14" fill="${t.valueFg}" font-size="13" font-weight="600" font-family="system-ui">${escapeXml(name.slice(0, 26))}</text>
  ${barsSvg}
</svg>`
}

function textWidth(text: string): number {
  // Approximate pixel width for Segoe/system font at 11px
  // Mix of narrow/wide chars; coefficient 6.4 lands close enough
  return Math.ceil(text.length * 6.4)
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function svgError(message: string, status: number): Response {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="22" viewBox="0 0 160 22">
  <rect width="160" height="22" rx="4" fill="#7f1d1d"/>
  <text x="80" y="15" text-anchor="middle" fill="#fff" font-family="system-ui" font-size="11">${escapeXml(message)}</text>
</svg>`
  return new Response(svg, {
    status,
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "no-store" },
  })
}
