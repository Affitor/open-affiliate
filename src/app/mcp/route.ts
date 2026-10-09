import { createMcpRoute } from "@/lib/mcp-route";

// Canonical hosted endpoint:
//   claude mcp add --transport http openaffiliate https://openaffiliate.dev/mcp
export const { GET, POST, DELETE, OPTIONS } = createMcpRoute("");
