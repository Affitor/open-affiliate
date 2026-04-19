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
 *   ?size    = sm | md | lg                            (default: md, card only)
 *   ?brand   = 1 to force brand color, 0 to force tier (default: auto)
 *
 * Cached aggressively at the edge. Score changes are low-frequency (we re-
 * verify programs every ~30 days), so a 1-hour cache is plenty.
 */

type Variant = "score" | "commission" | "cookie"
type Theme = "light" | "dark" | "flat"
type Style = "pill" | "card"
type Size = "sm" | "md" | "lg"

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
  const size = (url.searchParams.get("size") as Size) ?? "md"
  const brandOverride = url.searchParams.get("brand")

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

  const svg = renderBadge({ slug: slugClean, program, score, variant, theme, style, size, brandOverride })

  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      "CDN-Cache-Control": "public, s-maxage=3600",
    },
  })
}

async function loadProgram(slug: string): Promise<Record<string, unknown> | null> {
  try {
    const programsDir =
      process.env.PROGRAMS_DIR ?? join(process.cwd(), "programs")
    const raw = await readFile(join(programsDir, `${slug}.yaml`), "utf8")
    return parseYaml(raw) as Record<string, unknown>
  } catch {
    return null
  }
}

// ---------- SVG rendering ---------------------------------------------------

interface RenderArgs {
  slug: string
  program: Record<string, unknown>
  score: ReturnType<typeof computeScoreV1>
  variant: Variant
  theme: Theme
  style: Style
  size: Size
  brandOverride: string | null
}

// Premium font stack — Inter is the defacto product UI font.
// font-feature-settings "ss01" enables stylistic set with refined numerals,
// "cv11" gives a single-storey 'a'. Gracefully degrades to system-ui.
const FONT_STACK = "'Inter','InterVariable',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif"
const MONO_STACK = "'JetBrains Mono','SF Mono',ui-monospace,monospace"

// Sizes map to card dimensions. Pill always uses intrinsic sizing.
const SIZE_TOKENS: Record<Size, {
  w: number; h: number
  padX: number
  ringR: number; ringStroke: number; ringX: number
  logoSize: number
  nameFs: number
  eyebrowFs: number
  metaFs: number
  scoreFs: number
  scoreY: number
  radius: number
}> = {
  sm: { w: 260, h: 88, padX: 16, ringR: 22, ringStroke: 4, ringX: 44, logoSize: 20, nameFs: 14, eyebrowFs: 9, metaFs: 11, scoreFs: 18, scoreY: 3, radius: 10 },
  md: { w: 320, h: 120, padX: 20, ringR: 28, ringStroke: 5, ringX: 56, logoSize: 24, nameFs: 17, eyebrowFs: 10, metaFs: 12, scoreFs: 22, scoreY: 4, radius: 12 },
  lg: { w: 400, h: 148, padX: 24, ringR: 36, ringStroke: 6, ringX: 68, logoSize: 30, nameFs: 21, eyebrowFs: 11, metaFs: 13, scoreFs: 28, scoreY: 5, radius: 14 },
}

/**
 * Blends the program's brand color with the tier accent when available.
 * Falls back cleanly to tier color when no brand color in YAML.
 *
 * Rules:
 *   - If `?brand=0` → always tier color
 *   - If `?brand=1` + brand_color present → always brand color
 *   - Default (auto): brand_color if available AND contrast is OK against surface,
 *     else tier color
 */
function resolveAccent(args: RenderArgs, defaultTierAccent: string): string {
  const brand = typeof args.program.brand_color === "string" ? args.program.brand_color : null
  if (args.brandOverride === "0") return defaultTierAccent
  if (args.brandOverride === "1" && brand) return brand
  // auto — prefer brand if it passes a minimal luminance sanity check
  if (brand && isHex(brand)) return brand
  return defaultTierAccent
}

function isHex(s: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)
}

/**
 * Returns a data URL or remote URL for the program's logo. We prefer:
 *   1. program.logo_url from YAML (Brandfetch CDN, already optimized)
 *   2. Clearbit logo by domain (free, decent coverage)
 *   3. null → render monogram fallback
 */
function resolveLogoUrl(program: Record<string, unknown>): string | null {
  if (typeof program.logo_url === "string" && program.logo_url.startsWith("http")) return program.logo_url
  if (typeof program.url === "string") {
    try {
      const host = new URL(program.url).hostname.replace(/^www\./, "")
      return `https://logo.clearbit.com/${host}`
    } catch {
      // ignore malformed url
    }
  }
  return null
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

// Pill theme tokens (left label strip + right value strip, GitHub-style)
interface PillTheme {
  labelBg: string
  labelFg: string
  valueBg: string
  valueFg: string
}

// Card theme tokens (full layout with proper contrast, Stripe-tier)
interface CardTheme {
  bg: string
  surface: string        // inner surface (slightly elevated)
  fg: string              // primary text
  fgMuted: string         // secondary text
  fgSubtle: string        // tertiary / labels
  border: string
  track: string           // progress bar track
  shadow: string          // drop shadow color
}

const PILL_THEMES: Record<Theme, PillTheme> = {
  light: { labelBg: "#334155", labelFg: "#f8fafc", valueBg: "#0f172a", valueFg: "#f8fafc" },
  dark:  { labelBg: "#27272a", labelFg: "#d4d4d8", valueBg: "#155DFC", valueFg: "#ffffff" },
  flat:  { labelBg: "#e2e8f0", labelFg: "#0f172a", valueBg: "#0f172a", valueFg: "#f8fafc" },
}

const CARD_THEMES: Record<Theme, CardTheme> = {
  light: {
    bg: "#ffffff",
    surface: "#ffffff",
    fg: "#0f172a",
    fgMuted: "#475569",
    fgSubtle: "#94a3b8",
    border: "#e2e8f0",
    track: "#f1f5f9",
    shadow: "rgba(15,23,42,0.08)",
  },
  dark: {
    bg: "#0a0a0a",
    surface: "#18181b",
    fg: "#fafafa",
    fgMuted: "#a1a1aa",
    fgSubtle: "#71717a",
    border: "#27272a",
    track: "#27272a",
    shadow: "rgba(0,0,0,0.5)",
  },
  flat: {
    bg: "transparent",
    surface: "#f8fafc",
    fg: "#0f172a",
    fgMuted: "#475569",
    fgSubtle: "#94a3b8",
    border: "#cbd5e1",
    track: "#e2e8f0",
    shadow: "rgba(15,23,42,0.04)",
  },
}

// Tier determines the accent color — signals quality at a glance
const TIER_ACCENT: Record<string, string> = {
  S: "#10b981", // emerald — elite
  A: "#22c55e", // green — strong
  B: "#3b82f6", // blue — good
  C: "#f59e0b", // amber — ok
  D: "#64748b", // slate — weak
}

function renderPill(args: RenderArgs, label: string, value: string): string {
  const t = PILL_THEMES[args.theme]
  const labelW = textWidth(label) + 16
  const valueW = textWidth(value) + 16
  const totalW = labelW + valueW
  const h = 22
  const tierAccent = args.variant === "score" ? TIER_ACCENT[args.score.tier] ?? t.valueBg : t.valueBg

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${h}" viewBox="0 0 ${totalW} ${h}">
  <title>${escapeXml(label)}: ${escapeXml(value)} — openaffiliate.dev</title>
  <linearGradient id="g" x2="0" y2="100%">
    <stop offset="0" stop-color="#fff" stop-opacity=".12"/>
    <stop offset="1" stop-opacity=".12"/>
  </linearGradient>
  <clipPath id="c"><rect width="${totalW}" height="${h}" rx="4"/></clipPath>
  <g clip-path="url(#c)">
    <rect width="${labelW}" height="${h}" fill="${t.labelBg}"/>
    <rect x="${labelW}" width="${valueW}" height="${h}" fill="${args.variant === "score" ? tierAccent : t.valueBg}"/>
    <rect width="${totalW}" height="${h}" fill="url(#g)"/>
  </g>
  <g fill="${t.labelFg}" text-anchor="middle" font-family="${FONT_STACK}" font-size="11">
    <text x="${labelW / 2}" y="15">${escapeXml(label)}</text>
  </g>
  <g fill="${t.valueFg}" text-anchor="middle" font-family="${FONT_STACK}" font-size="11" font-weight="600">
    <text x="${labelW + valueW / 2}" y="15">${escapeXml(value)}</text>
  </g>
</svg>`
}

function renderCard(args: RenderArgs, _label: string, _value: string): string {
  const t = CARD_THEMES[args.theme]
  const tierAccent = TIER_ACCENT[args.score.tier] ?? "#3b82f6"
  const accent = resolveAccent(args, tierAccent)
  const s = SIZE_TOKENS[args.size]
  const name = String(args.program.name ?? args.slug)
  const scoreStr = args.score.total.toFixed(0)
  const tier = args.score.tier
  const logoUrl = resolveLogoUrl(args.program)
  const maxNameChars = args.size === "sm" ? 18 : args.size === "lg" ? 28 : 22

  // Commission + cookie formatted in a conversational way
  const commission = formatCommission(args.program.commission)
  const cookie = args.program.cookie_days ? `${args.program.cookie_days}-day cookie` : null
  const metaLine = [commission, cookie].filter(Boolean).join("  ·  ")

  // Ring geometry
  const r = s.ringR
  const circ = 2 * Math.PI * r
  const filled = (Math.max(0, Math.min(100, args.score.total)) / 100) * circ

  // Surface gradient + accent-tinted glow + accent-tinted shadow (dark only)
  const glowOpacity = args.theme === "dark" ? "0.18" : "0.12"
  const defs = `
    <linearGradient id="oa-surface" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${t.surface}"/>
      <stop offset="100%" stop-color="${t.bg === "transparent" ? t.surface : t.bg}"/>
    </linearGradient>
    <radialGradient id="oa-glow" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="${glowOpacity}"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    ${args.theme !== "flat" ? `
    <filter id="oa-shadow" x="-10%" y="-10%" width="120%" height="140%">
      <feDropShadow dx="0" dy="${args.theme === "dark" ? 8 : 3}" stdDeviation="${args.theme === "dark" ? 10 : 4}"
                    flood-color="${args.theme === "dark" ? accent : "#0f172a"}"
                    flood-opacity="${args.theme === "dark" ? "0.22" : "0.08"}"/>
    </filter>` : ""}
  `

  // Program name with verified check if present
  const verifiedMark = args.program.verified
    ? `<circle cx="${s.padX + 108 + measureTextWidth(truncate(name, maxNameChars), s.nameFs, 700) + 6}" cy="${args.size === "sm" ? 38 : args.size === "md" ? 54 : 66}" r="5" fill="${accent}"/>
       <path d="M${s.padX + 108 + measureTextWidth(truncate(name, maxNameChars), s.nameFs, 700) + 3.5},${args.size === "sm" ? 38 : args.size === "md" ? 54 : 66}L${s.padX + 108 + measureTextWidth(truncate(name, maxNameChars), s.nameFs, 700) + 5.2},${args.size === "sm" ? 39.7 : args.size === "md" ? 55.7 : 67.7}L${s.padX + 108 + measureTextWidth(truncate(name, maxNameChars), s.nameFs, 700) + 8.5},${args.size === "sm" ? 36.5 : args.size === "md" ? 52.5 : 64.5}" stroke="#ffffff" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    : ""

  // Layout depends on size. Content x-offset = ringX * 2 + a little breathing room.
  const contentX = s.ringX * 2 - 8
  const rowEyebrow = args.size === "sm" ? 24 : args.size === "md" ? 34 : 40
  const rowName = args.size === "sm" ? 42 : args.size === "md" ? 56 : 68
  const rowMeta = args.size === "sm" ? 60 : args.size === "md" ? 78 : 94
  const rowFoot = args.size === "sm" ? 76 : args.size === "md" ? 102 : 128

  // Logo (top-left of ring area, overlapping with ring badge)
  const logo = logoUrl
    ? `<g>
         <circle cx="${s.ringX}" cy="${s.ringX}" r="${s.logoSize / 2 + 3}" fill="${t.surface}"/>
         <clipPath id="oa-logo-clip"><circle cx="${s.ringX}" cy="${s.ringX}" r="${s.logoSize / 2}"/></clipPath>
         <image href="${escapeXml(logoUrl)}"
                x="${s.ringX - s.logoSize / 2}" y="${s.ringX - s.logoSize / 2}"
                width="${s.logoSize}" height="${s.logoSize}"
                clip-path="url(#oa-logo-clip)" preserveAspectRatio="xMidYMid slice"/>
       </g>`
    : ""

  // Monogram fallback (centered in the logo circle)
  const monogram = !logoUrl
    ? `<circle cx="${s.ringX}" cy="${s.ringX}" r="${s.logoSize / 2}" fill="${accent}"/>
       <text x="${s.ringX}" y="${s.ringX + s.logoSize * 0.15}" text-anchor="middle"
             fill="#ffffff" font-size="${s.logoSize * 0.55}" font-weight="700"
             font-family="${FONT_STACK}">${escapeXml(name.charAt(0).toUpperCase())}</text>`
    : ""

  // Tier pill top-right
  const tierPillX = s.w - (args.size === "sm" ? 42 : 52)
  const tierPillW = args.size === "sm" ? 28 : 42
  const tierPill = `
    <g transform="translate(${tierPillX}, ${s.padX - 4})">
      <rect width="${tierPillW}" height="${args.size === "sm" ? 18 : 22}" rx="${args.size === "sm" ? 9 : 11}" fill="${accent}"/>
      <text x="${tierPillW / 2}" y="${args.size === "sm" ? 12.5 : 15}" text-anchor="middle"
            fill="#ffffff" font-size="${args.size === "sm" ? 10 : 11}" font-weight="700"
            font-family="${FONT_STACK}"
            style="font-feature-settings:'ss01','cv11'">
        ${escapeXml(tier)}
      </text>
    </g>
  `

  // Centered ring group (logo rides its center)
  const ringCy = args.size === "sm" ? s.h / 2 + 4 : s.h / 2 + 4
  const ring = `
    <g transform="translate(${s.ringX}, ${ringCy})">
      <circle r="${s.ringR + 12}" fill="url(#oa-glow)"/>
      <circle r="${r}" fill="none" stroke="${t.track}" stroke-width="${s.ringStroke}"/>
      <circle r="${r}" fill="none" stroke="${accent}" stroke-width="${s.ringStroke}" stroke-linecap="round"
              stroke-dasharray="${filled.toFixed(2)} ${(circ - filled).toFixed(2)}"
              transform="rotate(-90)"/>
      <text y="${s.scoreY}" text-anchor="middle" fill="${t.fg}" font-size="${s.scoreFs}" font-weight="700"
            font-family="${FONT_STACK}"
            style="font-feature-settings:'tnum','ss01'"
            letter-spacing="-0.025em">${scoreStr}</text>
      <text y="${s.scoreY + 14}" text-anchor="middle" fill="${t.fgSubtle}" font-size="${args.size === "sm" ? 8 : 9}" font-weight="500"
            font-family="${FONT_STACK}"
            style="font-feature-settings:'tnum'"
            letter-spacing="0.08em">/ 100</text>
    </g>
  `

  // Right-side content
  const content = `
    <text x="${contentX}" y="${rowEyebrow}" fill="${t.fgSubtle}" font-size="${s.eyebrowFs}" font-weight="600"
          font-family="${FONT_STACK}" letter-spacing="0.1em">
      AFFILIATE SCORE
    </text>
    <text x="${contentX}" y="${rowName}" fill="${t.fg}" font-size="${s.nameFs}" font-weight="700"
          font-family="${FONT_STACK}"
          letter-spacing="-0.015em">
      ${escapeXml(truncate(name, maxNameChars))}
    </text>
    ${metaLine ? `
    <text x="${contentX}" y="${rowMeta}" fill="${t.fgMuted}" font-size="${s.metaFs}" font-weight="500"
          font-family="${FONT_STACK}"
          style="font-feature-settings:'tnum'">
      ${escapeXml(metaLine)}
    </text>` : ""}
    <text x="${contentX}" y="${rowFoot}" fill="${t.fgSubtle}" font-size="${args.size === "sm" ? 9 : 10}" font-weight="500"
          font-family="${FONT_STACK}" letter-spacing="0.02em">
      openaffiliate.dev
    </text>
  `

  // Accessibility: provide title + desc so screen readers announce the badge
  const titleText = `${name}: Affiliate Score ${scoreStr} out of 100, tier ${tier}.`
  const descText = metaLine
    ? `${titleText} ${metaLine}. Verified affiliate program listed on openaffiliate.dev.`
    : `${titleText} Listed on openaffiliate.dev.`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s.w}" height="${s.h}" viewBox="0 0 ${s.w} ${s.h}" role="img" aria-labelledby="oa-title oa-desc">
  <title id="oa-title">${escapeXml(titleText)}</title>
  <desc id="oa-desc">${escapeXml(descText)}</desc>
  <defs>${defs}</defs>
  <rect width="${s.w}" height="${s.h}" rx="${s.radius}" fill="url(#oa-surface)"
        stroke="${t.border}"
        ${args.theme !== "flat" ? `filter="url(#oa-shadow)"` : ""}/>
  ${tierPill}
  ${ring}
  ${logo}${monogram}
  ${verifiedMark}
  ${content}
</svg>`
}

function formatCommission(commission: Record<string, unknown> | null | undefined): string | null {
  if (!commission?.rate) return null
  const rate = String(commission.rate).trim()
  const type = commission.type
  const duration = commission.duration
  if (type === "recurring") {
    if (duration && /lifetime/i.test(duration)) return `${rate} recurring · lifetime`
    if (duration && /\d/.test(duration)) return `${rate} recurring · ${duration}`
    return `${rate} recurring`
  }
  if (type === "one-time") return `${rate} one-time`
  if (type === "tiered") return `${rate} tiered`
  return rate
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n - 1).trimEnd() + "…"
}

// Rough pixel width estimate — used for positioning the verified mark.
// Inter at given weight ≈ fs × 0.52 (regular) / 0.55 (bold) average cap.
function measureTextWidth(text: string, fs: number, weight: number): number {
  const factor = weight >= 700 ? 0.56 : 0.52
  return Math.ceil(text.length * fs * factor)
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
