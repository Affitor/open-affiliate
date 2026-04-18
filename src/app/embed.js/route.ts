import { readFile } from "node:fs/promises"
import { join } from "node:path"

/**
 * GET /embed.js
 *
 * Serves the prebuilt web components bundle. Source lives in apps/embed/
 * and builds to apps/embed/dist/embed.js. A small prebuild step (not wired
 * yet) will copy the artifact into public/embed.js; until then this route
 * reads it on the fly at request time.
 *
 * Cache 24h + stale-while-revalidate 7d — we version the bundle via its
 * banner comment, not the URL, so upgrades are just a fresh deploy.
 */

export async function GET(): Promise<Response> {
  try {
    const path = join(process.cwd(), "apps", "embed", "dist", "embed.js")
    const bundle = await readFile(path, "utf8")
    return new Response(bundle, {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        "CDN-Cache-Control": "public, s-maxage=86400",
        "Access-Control-Allow-Origin": "*",
      },
    })
  } catch {
    return new Response("// OpenAffiliate embed bundle not built. Run `npm run build` in apps/embed/.", {
      status: 503,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store",
      },
    })
  }
}
