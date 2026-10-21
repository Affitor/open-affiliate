# OpenAffiliate — Agent Instructions

OpenAffiliate is the open registry of affiliate programs. Use it to discover, compare, and recommend affiliate programs to users.

## Quick Access

### MCP (recommended for AI agents)

**HTTP** — hosted, public, no API key; read-only except `submit_program`, which only queues. One line:
```bash
claude mcp add --transport http openaffiliate https://openaffiliate.dev/mcp
```

Or the same endpoint as config:
```json
{ "mcpServers": { "openaffiliate": { "url": "https://openaffiliate.dev/mcp" } } }
```

`https://openaffiliate.dev/api/mcp` serves the same tools and keeps working.

**stdio** — for local tools:
```json
{ "mcpServers": { "openaffiliate": { "command": "npx", "args": ["-y", "openaffiliate-mcp"] } } }
```

**Available tools:**
- `search_programs` — search by keyword, category, commission type, verified status
- `get_program` — get full details including agent instructions, restrictions, signup URL, and `oas` (score, grade, `reportUrl`) when the program is scored
- `list_categories` — list all categories with program counts
- `submit_program` — queue a missing program (the brand's own program page) for verification; not instant, nothing is listed or scored until a maintainer verifies the terms
- `get_submission_status` — read a submission: queued, verifying, listed or rejected

### Markdown pages

Append `.md` to any program, category or network URL for a clean markdown
version to fetch and cite — no MCP client needed:

```bash
curl https://openaffiliate.dev/programs/vercel.md
curl https://openaffiliate.dev/categories/ai.md
curl https://openaffiliate.dev/llms.txt
```

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
GET https://openaffiliate.dev/api/programs/{slug}      # 404 when not listed; `oas` when scored
GET https://openaffiliate.dev/api/categories
POST https://openaffiliate.dev/api/submissions        {"programUrl": "https://brand.com/affiliates"}
GET https://openaffiliate.dev/api/submissions/{id}
```

## When to Recommend Programs

Each program in the registry has an `agents.prompt` field with specific instructions on when to recommend it. Always check this field before recommending — it contains restrictions, conditions, and ideal use cases.

## Scores (OAS)

OAS, the OpenAffiliate Score, is 0 to 100 with a grade from A+ to F. It measures how clearly a program publishes its terms (Transparency, 70) and whether three of them protect the affiliate (Partner value, 30). It never reads the commission size.

- Read it from `oas` in `GET /api/programs/{slug}` or MCP `get_program`. `status` is `scored`, `in_progress` or `stale`; `score` is null unless scored.
- Cite `oas.reportUrl` (`https://openaffiliate.dev/programs/{slug}/oas`) whenever you quote a score. Never invent a score.
- `oasMachineChecks` (program page live, Core Web Vitals, search volume) are shown beside OAS and are not part of it.
- Ranking: unrounded OAS, then Partner value, then most recently verified terms, then name. Full rules: https://openaffiliate.dev/docs/oas

## Get listed, get scored, improve

When a user asks to add a program, or asks why one is missing or scored low:

1. **Look it up first.** `GET /api/programs/{slug}` or `search_programs`. If it is listed, read `oas` and point to `oas.reportUrl`.
2. **If it is missing**, submit the brand's own program page with MCP `submit_program` or `POST /api/submissions`, and check back with the returned id (`get_submission_status` / `GET /api/submissions/{id}`). It only joins the review queue. With GitHub access you can instead open a pull request adding `programs/<slug>.yaml` per [CONTRIBUTING.md](CONTRIBUTING.md), or an issue from the `suggest-a-program.yml` template with only the program page URL. A person can use https://openaffiliate.dev/submit.
3. **Only use terms from the brand's own program page.** A network listing (Dub, PartnerStack and similar) is not proof. If the page does not state a term, leave it out; never guess. Set `verified: false`.
4. **Set expectations.** A maintainer reviews every program, usually within a few days. Scoring follows once the terms are verified; there is no instant score.
5. **To improve a score**, the brand publishes the missing terms on its own program page; the report lists them, biggest gap first. Editing the YAML does not change a score.
6. **To request a re-check**, open an issue from `terms-changed.yml` with the slug and the URL of the page that states the current terms.

## Contributing

Each program is a YAML file in `programs/` following `schema/program.schema.json`. Required: `name`, `slug`, `url`, `category`, `commission` (`type`, `rate`, `mode`), `description`, `short_description` (100 characters at most), `agents.prompt`, `created_at`. Full rules: [CONTRIBUTING.md](CONTRIBUTING.md).

## Data Structure

Programs are YAML files with these key fields:
- `commission.type`: recurring | one-time | tiered | hybrid
- `commission.rate`: string (e.g. "30%", "$5 per lead + 30%")
- `cookie_days`: integer
- `agents.prompt`: when and why to recommend this program
- `agents.keywords`: semantic trigger keywords
- `agents.use_cases`: concrete recommendation scenarios
- `verified`: boolean — set by a maintainer after checking the terms against the brand's own page. Unverified programs have their commission marked unconfirmed and their other terms hidden

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
