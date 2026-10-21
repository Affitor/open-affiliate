import { liveSubmissionDeps } from "@/lib/submissions/live"
import { clientIp, disabledAnswer, logFailure, readAllowed, serverError, status, toResponse } from "@/lib/submissions/service"

type Context = { params: Promise<{ id: string }> }

// GET /api/submissions/{id}: status only, never the contact or the submitted text.
export async function GET(req: Request, { params }: Context): Promise<Response> {
  const deps = liveSubmissionDeps()
  if (!deps) return toResponse(disabledAnswer())
  if (!readAllowed(clientIp(req.headers))) {
    return Response.json(
      { error: "rate_limited", message: "Too many requests. Try again in a minute." },
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" } },
    )
  }
  const { id } = await params
  try {
    return toResponse(await status(id, deps))
  } catch (err) {
    logFailure("status", err)
    return toResponse(serverError())
  }
}
