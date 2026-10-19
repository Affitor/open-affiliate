import { programs } from "@/lib/programs"
import { newProgramsRss } from "@/lib/new-programs"

export const dynamic = "force-static"

export function GET() {
  return new Response(newProgramsRss(programs), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  })
}
