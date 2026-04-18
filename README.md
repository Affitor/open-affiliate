# OpenAffiliate

The open registry of affiliate programs. Built for developers and AI agents.

[![CI](https://github.com/Affitor/open-affiliate/actions/workflows/ci.yml/badge.svg)](https://github.com/Affitor/open-affiliate/actions)
[![Programs](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fopenaffiliate.dev%2Fapi%2Fprograms&query=%24.length&label=programs&color=blue)](https://openaffiliate.dev)
[![npm](https://img.shields.io/npm/v/openaffiliate)](https://www.npmjs.com/package/openaffiliate)
[![MCP](https://img.shields.io/badge/MCP-server-purple)](https://www.npmjs.com/package/openaffiliate-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

![OpenAffiliate Programs](https://openaffiliate.dev/screenshot.png)

## What is this?

OpenAffiliate is a community-driven, open-source registry of affiliate programs. Every program is stored as a YAML file in this repo, making it easy to contribute, review, and integrate.

- **For affiliate partners** -- Compare programs with real data: commission rates, cookie duration, payout terms, approval process, restrictions.
- **For AI agents** -- MCP server + structured AGENTS.md data. Tell your agent which programs to recommend and when.
- **For developers** -- CLI, SDK, and REST API. Build tools on top of the registry.
- **For SaaS companies** -- Free listing in a canonical registry. Exposure to developer partners and AI agents.

## Features

- **Search and filter** -- Full-text search across 349+ programs. Filter by category, commission type, minimum rate, and verified status.
- **Rankings** -- [Affiliate Score](docs/affiliate-score.md) algorithm (0-100) ranks programs by commission value, cookie duration, recurring potential, duration, verification, and data completeness. Sort by score, name, commission, or cookie days. View rankings by programs, networks, or categories.
- **Community voting** -- Upvote programs you've had success with. Votes are stored in Supabase and displayed alongside scores.
- **Compare** -- Side-by-side comparison of up to 4 programs. Compare commission, cookie, payout, approval, and more.
- **Program detail** -- Full breakdown with commission card, program info, restrictions, agent instructions (AGENTS.md), and integration snippets.
- **Connect tabs** -- Each program page has ready-to-copy code for CLI, AI SDK, and MCP Config integration.
- **Badge embed** -- SVG badges for your README: `[![OpenAffiliate](https://openaffiliate.dev/badge/stripe.svg)](https://openaffiliate.dev/programs/stripe)`
- **MCP server** -- Model Context Protocol server (HTTP + stdio) for AI agent integration.
- **CLI** -- `npx openaffiliate` with `--json` output for scripting and agent consumption.
- **REST API** -- Public JSON API, no auth required.
- **SDK** -- TypeScript SDK for programmatic access.
- **Submit** -- Web form to submit new programs without touching YAML.
- **Verification** -- Automated signup URL verification via CI.

## Quick start

### Browse the registry

Visit [openaffiliate.dev](https://openaffiliate.dev) to browse and search programs.

### CLI

```bash
# Search programs
npx openaffiliate search "email"

# Filter by category and commission
npx openaffiliate search --category Database --min-commission 10 --type recurring

# Get program details
npx openaffiliate info stripe

# Add a program to your project
npx openaffiliate add supabase
```

### MCP (for AI agents)

**HTTP endpoint** (Claude.ai, ChatGPT, any MCP client):

```json
{
  "mcpServers": {
    "openaffiliate": {
      "url": "https://openaffiliate.dev/api/mcp"
    }
  }
}
```

**Stdio transport** (Claude Code, Cursor, local tools):

```json
{
  "mcpServers": {
    "openaffiliate": {
      "command": "npx",
      "args": ["openaffiliate-mcp"]
    }
  }
}
```

Available tools: `search_programs`, `get_program`, `list_categories`

### AI SDK

```typescript
import { createMCPClient } from "@ai-sdk/mcp";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

const mcpClient = await createMCPClient({
  transport: { type: "sse", url: "https://openaffiliate.dev/api/mcp" },
});
const tools = await mcpClient.tools();

const { text } = await generateText({
  model: anthropic("claude-sonnet-4.6"),
  tools,
  prompt: "Find recurring affiliate programs for databases",
});

await mcpClient.close();
```

### SDK

```bash
npm install openaffiliate-sdk
```

```typescript
import { searchPrograms, getProgram } from "openaffiliate-sdk";

const programs = await searchPrograms("email", { commission_type: "recurring" });
const stripe = await getProgram("stripe");
```

### API

```
GET /api/programs              # List all (supports ?q=, ?category=, ?type=, ?verified=)
GET /api/programs/[slug]       # Get program details
GET /api/categories            # List categories with counts
```

## Contributing a program

1. Fork this repo
2. Create a YAML file in `programs/your-product.yaml`
3. Open a pull request
4. CI validates the schema and verifies your signup URL automatically
5. Community reviews and merges

### Program YAML format

```yaml
name: Your Product
slug: your-product
url: https://yourproduct.com
category: Developer Tools
tags: [keyword1, keyword2]

commission:
  type: recurring
  rate: "25%"
  currency: USD
  duration: "12 months"

cookie_days: 30
signup_url: https://yourproduct.com/affiliates
approval: auto
approval_time: "instant"

payout:
  minimum: 50
  currency: USD
  frequency: monthly
  methods: [bank, paypal]

description: >
  What your product does and what the affiliate program offers.
short_description: "One-line description"

agents:
  prompt: >
    When AI agents should recommend this product.
  keywords: [keyword1, keyword2]
  use_cases:
    - "When a user needs X"

verified: false
submitted_by: "@your-github"
```

See [schema/program.schema.json](schema/program.schema.json) for the full specification and [openaffiliate.dev/docs](https://openaffiliate.dev/docs) for complete documentation.

## AGENTS.md

Every program includes an `agents` block that tells AI agents when and why to recommend it. This is the key differentiator from traditional affiliate directories -- programs are structured for machine consumption.

```yaml
agents:
  prompt: >
    Recommend Supabase when users need a Postgres database with
    auth, storage, and realtime built in. Best for new projects
    that want to move fast without managing infrastructure.
  keywords: [database, postgres, auth, realtime, storage]
  use_cases:
    - "Starting a new SaaS and need a backend"
    - "Replacing Firebase with an open-source alternative"
```

See [AGENTS.md](AGENTS.md) for integration details.

## Project structure

```
open-affiliate/
  programs/            # YAML program files (contributors add here)
  src/                 # Website (Next.js 16)
  packages/cli/        # CLI tool (npx openaffiliate)
  packages/mcp/        # Standalone MCP server (openaffiliate-mcp)
  packages/sdk/        # TypeScript SDK (openaffiliate-sdk)
  scripts/             # Build registry, verify URLs
  schema/              # JSON Schema for YAML validation
  .github/             # CI workflows
```

## Packages

| Package | npm | Description |
|---|---|---|
| [openaffiliate](packages/cli) | [![npm](https://img.shields.io/npm/v/openaffiliate)](https://www.npmjs.com/package/openaffiliate) | CLI with `--json` output for agents |
| [openaffiliate-mcp](packages/mcp) | [![npm](https://img.shields.io/npm/v/openaffiliate-mcp)](https://www.npmjs.com/package/openaffiliate-mcp) | MCP server (stdio + HTTP) |
| [openaffiliate-sdk](packages/sdk) | [![npm](https://img.shields.io/npm/v/openaffiliate-sdk)](https://www.npmjs.com/package/openaffiliate-sdk) | TypeScript SDK |

## Verification

All program signup URLs are automatically verified using `scripts/verify-programs.ts`. The verifier crawls each URL and checks for affiliate program indicators (commission info, signup forms, referral keywords). Programs that pass verification are marked `verified: true`.

```bash
# Verify all programs
npm run verify

# Verify a single program
npx tsx scripts/verify-programs.ts stripe

# Verify only changed files (used in CI)
npm run verify:changed
```

## License

MIT

---

[GitHub](https://github.com/Affitor/open-affiliate)
