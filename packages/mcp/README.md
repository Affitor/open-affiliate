# openaffiliate-mcp

MCP server for the [OpenAffiliate](https://openaffiliate.dev) registry. Search affiliate programs from Claude, Cursor, or any MCP client.

## Setup

### HTTP (recommended)

Add to your MCP config (Claude.ai, ChatGPT, any MCP client):

```json
{
  "mcpServers": {
    "openaffiliate": {
      "url": "https://openaffiliate.dev/mcp"
    }
  }
}
```

### Stdio (local)

For Claude Code, Cursor, and local tools:

```json
{
  "mcpServers": {
    "openaffiliate": {
      "command": "npx",
      "args": ["-y", "openaffiliate-mcp"]
    }
  }
}
```

## Tools

| Tool | Description |
|---|---|
| `search_programs` | Search by keyword, category, commission type, verified status |
| `get_program` | Get full details including agent instructions, restrictions, signup URL |
| `list_categories` | List all categories with program counts |

## Examples

**Search**: "Find recurring commission AI tools"
- Calls `search_programs` with `query: "ai"`, `commission_type: "recurring"`

**Details**: "Tell me about the Vercel affiliate program"
- Calls `get_program` with `slug: "vercel"`

## Environment

| Variable | Default | Description |
|---|---|---|
| `OPENAFFILIATE_API` | `https://openaffiliate.dev` | API base URL |

## Related

- [openaffiliate](https://www.npmjs.com/package/openaffiliate) — CLI tool
- [openaffiliate-sdk](https://www.npmjs.com/package/openaffiliate-sdk) — TypeScript SDK
- [openaffiliate.dev](https://openaffiliate.dev) — Browse the registry

## License

MIT
