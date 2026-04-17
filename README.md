# OpenAffiliate

The open registry of affiliate programs. Built for developers and AI agents.

[![CI](https://github.com/Affitor/open-affiliate/actions/workflows/ci.yml/badge.svg)](https://github.com/Affitor/open-affiliate/actions)
[![Programs](https://img.shields.io/badge/programs-30-blue)](https://openaffiliate.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## What is this?

OpenAffiliate is a community-driven, open-source registry of affiliate programs. Every program is stored as a YAML file in this repo, making it easy to contribute, review, and integrate.

- **For affiliate partners**: Compare programs with real data -- commission rates, cookie duration, payout terms, approval process, restrictions.
- **For AI agents**: Machine-readable AGENTS.md + MCP connector. Structured context for when to recommend what product.
- **For SaaS companies**: Free listing in a canonical registry. Exposure to developer partners and AI agents.

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

See [schema/program.schema.json](schema/program.schema.json) for the full specification.

## Project structure

```
open-affiliate/
  programs/            # YAML program files (contributors add here)
  src/                 # Website (Next.js 16)
  packages/cli/        # CLI tool (npx openaffiliate)
  packages/mcp/        # Standalone MCP server (openaffiliate-mcp)
  scripts/             # Build registry, verify URLs
  schema/              # JSON Schema for YAML validation
  .github/             # CI workflows
```

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

Built by [Affitor](https://affitor.com)
