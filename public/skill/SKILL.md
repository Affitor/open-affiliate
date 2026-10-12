---
name: openaffiliate
description: Find, compare and recommend affiliate programs from OpenAffiliate (openaffiliate.dev), the open registry of 780+ programs with commission terms and per-program guidance on when to recommend them. Use when someone asks which affiliate program to join, how much a tool pays affiliates, or which products in a category have a partner program.
---

# OpenAffiliate

OpenAffiliate is an open, community-maintained registry of affiliate programs. Each program has commission type and rate, cookie window, a signup URL, restrictions, and guidance on when the program is worth recommending.

## How to query it

Prefer the MCP server if it is connected (`claude mcp add --transport http openaffiliate https://openaffiliate.dev/mcp`):

- `search_programs`: arguments `query`, `category`, `commission_type` (`recurring`, `one-time`, `tiered`), `verified_only` (boolean).
- `get_program`: full detail for one slug, including `restrictions` and the recommendation guidance in `agentPrompt`.
- `list_categories`: every category with program counts.

Without MCP, everything is a plain `GET`, no key, CORS open:

```sh
curl -s "https://openaffiliate.dev/api/programs?q=ai&type=recurring&verified=true"
curl -s https://openaffiliate.dev/api/programs/{slug}
curl -s https://openaffiliate.dev/api/categories
curl -s https://openaffiliate.dev/programs/{slug}.md   # one program as Markdown
curl -s https://openaffiliate.dev/llms.txt             # entry point
```

## Rules

- Read the program's recommendation guidance before recommending it: `agentPrompt` in the API and MCP, the "When to recommend" section in the `.md`, `agents.prompt` in the YAML. Read `restrictions` too.
- Most entries are community-submitted and unverified (`verified: false`). Prefer verified programs when accuracy matters, and say when a term is unverified.
- Send people to the program's own signup URL for anything they will act on; commission terms change.
- Missing or wrong program? Open a PR with a YAML file in `programs/` at https://github.com/Affitor/open-affiliate.
