import type { CaptureResult } from "posthog-js"

type Frame = { filename?: unknown }

const NOISE_VALUE_INCLUDES = [
  "zaloJSV2",
  "Error invoking postMessage",
  "Receiving end does not exist",
]

function isNoiseFilename(filename: string): boolean {
  return (
    filename.startsWith("iabjs://") ||
    filename.startsWith("chrome-extension://") ||
    filename.startsWith("moz-extension://") ||
    filename.startsWith("safari-extension:") ||
    filename.startsWith("safari-web-extension:")
  )
}

function framesOf(properties: CaptureResult["properties"]): Frame[] {
  const list = properties.$exception_list
  const first = Array.isArray(list) ? list[0] : undefined
  if (!first || typeof first !== "object") return []
  const stack = (first as { stacktrace?: { frames?: unknown } }).stacktrace
  const frames = stack?.frames
  return Array.isArray(frames) ? (frames as Frame[]) : []
}

function exceptionValue(properties: CaptureResult["properties"]): string {
  const list = properties.$exception_list
  const first = Array.isArray(list) ? list[0] : undefined
  if (!first || typeof first !== "object") return ""
  const value = (first as { value?: unknown }).value
  return typeof value === "string" ? value : ""
}

/**
 * Drop browser noise before it leaves the page. Real exceptions stay.
 * A stack is noise only when every named frame is an in-app browser or
 * an extension. One app frame keeps the event.
 */
export function dropNoisyException(event: CaptureResult | null): CaptureResult | null {
  if (!event || event.event !== "$exception") return event
  const value = exceptionValue(event.properties)
  if (value === "Script error.") return null
  if (NOISE_VALUE_INCLUDES.some((part) => value.includes(part))) return null
  const named = framesOf(event.properties)
    .map((frame) => frame.filename)
    .filter((filename): filename is string => typeof filename === "string" && filename.length > 0)
  if (named.length > 0 && named.every(isNoiseFilename)) return null
  return event
}

/** A submission id is the only key to its status page, so it never goes to analytics. */
// The whole segment, not only a literal UUID: Next decodes /submissions/%30b9c… to the same id.
const SUBMISSION_ID = /\/submissions\/[^/?#\s"'<>]+/g
export const SUBMISSION_ID_MASK = "/submissions/{id}"

function masked(value: unknown): unknown {
  if (typeof value === "string") return value.replace(SUBMISSION_ID, SUBMISSION_ID_MASK)
  if (Array.isArray(value)) return value.map(masked)
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, masked(v)]))
  return value
}

/**
 * Every string in the event ($current_url, $pathname, $referrer, the
 * $set_once initial referrer, autocaptured link hrefs and $elements_chain)
 * with submission ids replaced.
 */
export function maskSubmissionIds(event: CaptureResult | null): CaptureResult | null {
  if (!event) return null
  return masked(event) as CaptureResult
}
