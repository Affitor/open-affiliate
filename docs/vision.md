# OpenAffiliate — Product Vision

> The infrastructure layer for affiliate marketing.
> Where companies find partners. Where partners find programs. Where AI agents earn revenue.

---

## The Problem

Affiliate marketing is fragmented. Programs are scattered across dozens of networks, company websites, and spreadsheets. There's no single place to:

- **Compare programs** with real, structured data (commission, cookie, payout, restrictions)
- **Discover new programs** beyond the top 20 everyone already promotes
- **Integrate programmatically** — no standard format, no API, no machine-readable data
- **Find tools** that actually help you do affiliate work (not just more SaaS to pay for)

The result: partners waste hours researching programs. Companies struggle to attract quality partners. AI agents have no structured data to work with.

## The Solution

**OpenAffiliate is the open infrastructure for affiliate marketing.**

One registry. Structured data. Open source. Accessible to humans, developers, and AI agents alike.

---

## Who Is It For?

### 1. SaaS Companies & Startups (Advertisers)

Companies that have a product and want affiliate partners to promote it.

**What they do on OpenAffiliate:**
- List their affiliate program with full details (commission, terms, restrictions)
- Get discovered by thousands of potential partners — humans and AI agents
- Benchmark their program against competitors (commission rates, cookie duration, approval process)
- Learn what makes a successful affiliate program by studying top-performing listings

**Why they care:**
- Free listing in a canonical registry (vs paying networks 20-30% override)
- Exposure to developer partners who build tools and content around products
- AI agents recommend their product when the AGENTS.md prompt matches user needs

### 2. Affiliate Partners (Promoters)

People who promote products and earn commissions. From bloggers to developers to AI-powered content creators.

**What they do on OpenAffiliate:**
- Search and compare programs by commission rate, cookie duration, payout terms, restrictions
- Filter by what matters: recurring vs one-time, approval process, payment methods
- Find programs via web UI, Google search, CLI, or AI agent recommendations
- Access tools and skills to actually do the affiliate work (see Phase 3+)

**Why they care:**
- One place to find all programs with real, comparable data
- No signup required to browse — open data
- Structured enough for informed decision-making (not just marketing copy)

### 3. Developers (Builders)

Developers who build products AND promote them. They think in APIs, CLIs, and YAML files.

**What they do on OpenAffiliate:**
- List their own product's affiliate program via GitHub PR (YAML file)
- Use the CLI to search programs from the terminal
- Integrate via API or MCP connector into their own tools
- Contribute open-source tools and skills to the registry

**Why they care:**
- Developer-native workflow: fork, edit YAML, PR, merged
- CLI and API — no web UI required
- MCP connector means their AI coding assistant can recommend programs contextually

### 4. AI Agents (Autonomous Partners)

AI agents that recommend products, create content, or build tools on behalf of users.

**What they do on OpenAffiliate:**
- Query the registry via MCP connector or API
- Read AGENTS.md instructions to know exactly when to recommend each product
- Use structured keywords, use cases, and prompts to make contextual recommendations
- (Future) Execute affiliate skills: create content, send outreach, generate comparisons

**Why they care:**
- Structured, machine-readable data — not scraping marketing pages
- Clear instructions per program (AGENTS.md) — no hallucinating commission rates
- Standard protocol (MCP) — works with Claude, Cursor, Windsurf, and any MCP client

---

## How It Works

### For Companies (List a Program)

```
1. Fork the registry repo on GitHub
2. Create programs/your-product.yaml with structured data
3. Open a pull request
4. CI validates the schema automatically
5. Community reviews (usually within 48 hours)
6. Merged → live on openaffiliate.dev within minutes
```

Alternatively: use the web submission form (creates the PR for you).

### For Partners (Find a Program)

```
1. Browse openaffiliate.dev — search, filter, compare
2. Or: npx openaffiliate search "email" --type recurring
3. Or: ask your AI agent (via MCP connector)
4. Click "Join Program" → goes to the program's signup page
5. Start promoting with full context on terms and restrictions
```

### For AI Agents (Recommend a Program)

```
1. Connect via MCP: { "url": "https://openaffiliate.dev/api/mcp" }
2. Call search_programs with user context
3. Read the AGENTS.md prompt for matched programs
4. Recommend the right product at the right time
5. User clicks the affiliate link → conversion tracked by the program
```

---

## Product Phases

### Phase 1: The Registry (Current)

**The canonical directory of affiliate programs.**

- Structured YAML files with 30+ data points per program
- Web UI: browse, search, filter, compare
- Program detail pages with full decision-making info
- API: `/api/programs`, `/api/programs/[slug]`, `/api/categories`
- GitHub PR workflow for contributions
- CI validation of program data

**Target: 50+ programs across major SaaS categories.**

### Phase 2: CLI + MCP

**Developer and AI agent access layer.**

- `npx openaffiliate search` — terminal-native program discovery
- `npx openaffiliate add <slug>` — add program config to your project
- `npx openaffiliate init` — interactive setup with AGENTS.md generation
- MCP server with 3+ tools for AI agent integration
- Published as `openaffiliate` on npm

**Target: Used by 100+ developers and integrated into AI agent workflows.**

### Phase 3: Tools & Skills Marketplace

**Open-source tools that help partners actually do affiliate work.**

This is the expansion layer. Not just "find programs" but "do affiliate marketing."

Categories of tools:

| Type | Examples | Value |
|------|---------|-------|
| **Content tools** | AI blog post generator, comparison page builder, review template | Partners create content faster |
| **Outreach tools** | Email sequence builder, social post scheduler, cold outreach AI | Partners reach more potential customers |
| **Analytics tools** | Link tracker, conversion dashboard, commission calculator | Partners measure what works |
| **Discovery tools** | Program matcher (based on niche), competitor program finder | Partners find the right programs |
| **AI agent skills** | MCP tools that agents can use to execute affiliate tasks | Full autonomous affiliate workflow |

**The key insight:** Tech-savvy partners can use these free, open-source tools instead of paying for expensive SaaS subscriptions. The tools are listed on OpenAffiliate just like programs — YAML files, community-contributed, open source.

**For non-technical users:** They'll still buy SaaS products (which is where the affiliate commission comes from). The tools help technical partners be more productive, not replace the end customer.

### Phase 4: The Network Effect

**OpenAffiliate becomes the infrastructure layer.**

- Companies benchmark their programs against the registry
- Partners build portfolios of programs they promote
- AI agents have a complete knowledge base of the affiliate ecosystem
- Third-party tools integrate via API (affiliate dashboards, content platforms, ad networks)
- Affiliate networks (Impact, PartnerStack, ShareASale) bulk-sync their catalogs

**At scale, OpenAffiliate is:**
- The "npm" of affiliate programs (structured, searchable, installable)
- The "GitHub" of affiliate tools (open source, community-contributed)
- The "MCP directory" of affiliate capabilities (machine-readable, agent-accessible)

---

## Why Open Source?

| Benefit | Explanation |
|---------|-------------|
| **Trust** | Companies and partners trust a community-maintained registry over a proprietary one |
| **Data quality** | Community reviews catch outdated or inaccurate program data |
| **Network effect** | Every contributor adds value for everyone. More programs = more partners = more programs |
| **AI-native** | Open data is machine-readable. Proprietary registries gate their data behind APIs and paywalls |
| **No lock-in** | Fork the registry, self-host it, build on top of it. The data is yours |

## Revenue Model (Future)

OpenAffiliate is free and open source. Potential revenue streams:

1. **Sponsored listings** — Companies pay for featured placement (clearly marked)
2. **Verified badge** — Premium verification with manual review of program terms
3. **Analytics for companies** — How many partners viewed/clicked/joined your program
4. **Enterprise API** — Higher rate limits, webhooks, bulk operations
5. **Premium tools** — Hosted versions of open-source tools with managed infrastructure

---

## Competitive Positioning

| | Traditional Networks | Affiliate Directories | OpenAffiliate |
|---|---|---|---|
| Data format | Proprietary | Unstructured (blog posts) | Structured YAML |
| Access | Account required | Web only | Web + CLI + API + MCP |
| AI-ready | No | No | Yes (AGENTS.md + MCP) |
| Cost to list | 20-30% override | Pay to be featured | Free |
| Data quality | Varies | Often outdated | Community-maintained |
| Contribution | Closed | Closed | Open (GitHub PR) |
| Tools included | No | No | Yes (Phase 3+) |

---

*Built by [Affitor](https://affitor.com) — the AI-native affiliate marketing platform.*
