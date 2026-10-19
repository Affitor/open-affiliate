"use client"

import { useEffect } from "react"
import { registerWebMcpTools } from "@/lib/webmcp"

/** Exposes the read-only registry tools to browser agents (WebMCP). Renders nothing. */
export function WebMcpTools() {
  useEffect(() => {
    const controller = new AbortController()
    registerWebMcpTools(controller.signal)
    return () => controller.abort()
  }, [])
  return null
}
