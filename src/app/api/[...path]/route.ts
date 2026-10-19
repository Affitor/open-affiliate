import { apiError } from "@/lib/api-error"

function missing() {
  return apiError(404, "NOT_FOUND", "API route not found.", "See /openapi.json for public REST endpoints.")
}

export { missing as GET, missing as POST, missing as PUT, missing as PATCH, missing as DELETE, missing as OPTIONS }
