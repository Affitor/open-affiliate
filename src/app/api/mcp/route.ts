import { createMcpRoute } from "@/lib/mcp-route";

// Alias of /mcp, kept indefinitely: packages/mcp/server.json, the npm package
// README and external MCP registries published this path.
export const { GET, POST, DELETE, OPTIONS } = createMcpRoute("/api");
