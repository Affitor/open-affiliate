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
