import { type NextRequest, NextResponse } from "next/server"
import paths from "./agentic-paths.json"

const markdownPaths = new Set<string>(paths.markdown)
const patterns = (routes: string[]) => routes.map((path) => new RegExp("^" + path.split("/").map((part) =>
  part.startsWith("[") ? "[^/]+" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
).join("/") + "$"))
const htmlPatterns = patterns(paths.html)
const handlerPatterns = patterns(paths.handlers)
const assets = new Set(paths.assets)

/** Wildcards alone keep HTML. Explicit media types obey q and HTML wins ties. */
export function wantsMarkdown(accept: string): boolean {
  const quality = (type: string) => {
    const matches = accept.toLowerCase().split(",").map((entry) => entry.trim().split(";").map((x) => x.trim()))
      .filter(([media]) => media === type)
      .map(([, ...params]) => {
        const q = params.find((p) => p.startsWith("q="))
        const value = q === undefined ? 1 : Number(q.slice(2))
        return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0
      })
    return Math.max(0, ...matches)
  }
  return quality("text/markdown") > quality("text/html")
}

export function markdownNotFound() {
  return new NextResponse("# Page not found\n\nThis page does not exist. Start at [llms.txt](/llms.txt) or the [sitemap](/sitemap.xml).\n", {
    status: 404,
    headers: { "Content-Type": "text/markdown; charset=utf-8", Vary: "Accept", "Cache-Control": "no-store" },
  })
}

export function negotiateMarkdown(request: NextRequest) {
  const path = request.nextUrl.pathname.replace(/\/$/, "") || "/"
  if (path.startsWith("/api/") || path === "/api" || path === "/mcp" || assets.has(path) || handlerPatterns.some((pattern) => pattern.test(path))) return NextResponse.next()
  if (request.method !== "GET" && request.method !== "HEAD") return NextResponse.next()

  const explicit = path.endsWith(".md")
  const markdown = wantsMarkdown(request.headers.get("accept") ?? "")
  const twin = path === "/" ? "/index.md" : path + ".md"
  let response: NextResponse
  if (explicit) {
    response = markdownPaths.has(path) ? NextResponse.next() : markdownNotFound()
  } else if (markdown && markdownPaths.has(twin)) {
    const url = request.nextUrl.clone()
    url.pathname = twin
    response = NextResponse.rewrite(url)
  } else if (markdown && (
    // Dynamic directory pages exist only when their generated twin exists.
    /^\/(programs|categories|networks|best)\/[^/]+$/.test(path) ||
    !htmlPatterns.some((pattern) => pattern.test(path))
  )) {
    response = markdownNotFound()
  } else {
    response = NextResponse.next()
  }
  response.headers.set("Vary", "Accept")
  if (explicit || (markdown && markdownPaths.has(twin))) {
    response.headers.set("Content-Type", "text/markdown; charset=utf-8")
  }
  return response
}
