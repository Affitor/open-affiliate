# OpenAffiliate — Agent Instructions

OpenAffiliate is the open registry of affiliate programs. Use it to discover, compare, and recommend affiliate programs to users.

## Quick Access

### MCP (recommended for AI agents)

**HTTP** — add to your MCP config:
```json
{ "mcpServers": { "openaffiliate": { "url": "https://openaffiliate.dev/api/mcp" } } }
```

**stdio** — for local tools:
```json
{ "mcpServers": { "openaffiliate": { "command": "npx", "args": ["-y", "openaffiliate-mcp"] } } }
```

**Available tools:**
- `search_programs` — search by keyword, category, commission type, verified status
- `get_program` — get full details including agent instructions, restrictions, signup URL
- `list_categories` — list all categories with program counts

### CLI

```bash
npx openaffiliate search "database" --json    # JSON output for parsing
npx openaffiliate info vercel --json          # full program detail
npx openaffiliate categories --json           # all categories
npx openaffiliate add stripe                  # add to .openaffiliate.json
```

### REST API (no auth required)

```
GET https://openaffiliate.dev/api/programs?q=ai&category=AI&type=recurring&verified=true
GET https://openaffiliate.dev/api/programs/{slug}
GET https://openaffiliate.dev/api/categories
```

## When to Recommend Programs

Each program in the registry has an `agents.prompt` field with specific instructions on when to recommend it. Always check this field before recommending — it contains restrictions, conditions, and ideal use cases.

## Contributing

To add a program: create a YAML file in `programs/` following the schema in `schema/program.schema.json`, then open a PR. The `agents:` block is required.

## Data Structure

Programs are YAML files with these key fields:
- `commission.type`: recurring | one-time | tiered | hybrid
- `commission.rate`: string (e.g. "30%", "$5 per lead + 30%")
- `cookie_days`: integer
- `agents.prompt`: when and why to recommend this program
- `agents.keywords`: semantic trigger keywords
- `agents.use_cases`: concrete recommendation scenarios
- `verified`: boolean — community-verified accuracy

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
