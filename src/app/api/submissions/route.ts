import { liveSubmissionDeps } from "@/lib/submissions/live"
import { disabledAnswer, handlePost, logFailure, serverError, toResponse } from "@/lib/submissions/service"

// POST /api/submissions: queue a program by URL (src/lib/submissions/service.ts).
// 503 until the database and the IP-hash key are set.
export async function POST(req: Request): Promise<Response> {
  const deps = liveSubmissionDeps()
  if (!deps) return toResponse(disabledAnswer())
  try {
    return toResponse(await handlePost(req, deps))
  } catch (err) {
    logFailure("submit", err)
    return toResponse(serverError())
  }
}
