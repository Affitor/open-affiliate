import { programs } from "@/lib/programs"

const BADGE_HEIGHT = 20
const FONT = 'font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11"'

function measureText(text: string): number {
  // Approximate character width for 11px sans-serif
  return text.length * 6.8 + 10
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function renderBadge(label: string, value: string, color: string, verified: boolean) {
  const verifiedText = verified ? " \u2713" : ""
  const valueWithVerified = value + verifiedText
  const labelWidth = measureText(label)
  const valueWidth = measureText(valueWithVerified)
  const totalWidth = labelWidth + valueWidth

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${BADGE_HEIGHT}" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="${BADGE_HEIGHT}" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="${BADGE_HEIGHT}" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="${BADGE_HEIGHT}" fill="${color}"/>
    <rect width="${totalWidth}" height="${BADGE_HEIGHT}" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" ${FONT}>
    <text x="${labelWidth / 2}" y="14" fill="#010101" fill-opacity=".3">${escapeXml(label)}</text>
    <text x="${labelWidth / 2}" y="13">${escapeXml(label)}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14" fill="#010101" fill-opacity=".3">${escapeXml(valueWithVerified)}</text>
    <text x="${labelWidth + valueWidth / 2}" y="13">${escapeXml(valueWithVerified)}</text>
  </g>
</svg>`
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug: rawSlug } = await params
  const slug = rawSlug.replace(/\.svg$/, "")
  const program = programs.find((p) => p.slug === slug)

  if (!program) {
    // Generic "not found" badge
    const svg = renderBadge("OpenAffiliate", "not found", "#999", false)
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, s-maxage=300",
      },
    })
  }

  const rate = typeof program.commission.rate === "string"
    ? program.commission.rate
    : `${program.commission.rate}%`
  const value = `${rate} ${program.commission.type}`

  const color = program.verified ? "#3b82f6" : "#6b7280"
  const svg = renderBadge("OpenAffiliate", value, color, program.verified)

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      "CDN-Cache-Control": "public, s-maxage=3600",
    },
  })
}
