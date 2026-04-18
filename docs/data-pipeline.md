# Data Pipeline — Adding Programs at Scale

The canonical 8-step flow for importing affiliate programs into the registry.
Use this as the operational playbook for any batch import session.

> **Companion docs**
> - [sources.md](./sources.md) — where to discover new programs
> - [discovery-keywords.md](./discovery-keywords.md) — how to detect that a program exists

---

## The 8 Steps

```
 0. Dedup check         ← NEW (before touching YAML)
 1. YAML creation
 2. Logo download
 3. Signup URL enrichment
 4. Data validation audit
 5. URL verification
 6. Build registry
 7. Freshness tracking   ← NEW (post-merge cron)
```

### Step 0 — Pre-flight fingerprint + refresh tier

**Goal:** decide per candidate whether it's worth running the full 8-step pipeline, *before* doing any expensive work.

Run `scripts/pre-check.ts` against your candidate list. It loads `src/lib/registry-index.json` (a lightweight fingerprint of every program — slugs, domains, aliases, freshness) and classifies each candidate into one of 5 tiers.

```bash
# Default: skip anything already in registry
npm run pre-check candidates.txt

# Monthly refresh: include programs last verified > 30 days ago
npm run pre-check candidates.txt -- --refresh=stale

# Data-quality sweep: force full re-scan everything
npm run pre-check candidates.txt -- --refresh=all

# Custom threshold
npm run pre-check candidates.txt -- --stale-days=60
```

**Outputs** (written to cwd or `--out=DIR`):

| File | Meaning |
|---|---|
| `new.txt` | Truly new — proceed to Step 1 |
| `stale.txt` | Exists but `last_verified_at` exceeds threshold — light or full refresh |
| `skip.txt` | Exists and fresh — log only, do not touch |
| `flag.txt` | Fuzzy match (Levenshtein < 3) — **human review required** before decision |
| `pre-check-report.json` | Full per-candidate detail (match type, age, reason) |

**The 5 tiers:**

| Tier | Condition | Action | Cost |
|---|---|---|---|
| `NEW` | No match in registry | Full 8-step | ~10-90s |
| `REFRESH-LIGHT` | Match + `last_verified_at` between `stale-days` and `3 × stale-days` | Re-verify URL, bump `last_verified_at`, update changed fields only | ~3s |
| `REFRESH-FULL` | Match + `last_verified_at > 3 × stale-days` **or** `--refresh=all` | Re-scan commission/payout, overwrite YAML fully | ~40s |
| `SKIP` | Match + fresh, refresh=none | Log only | ~0s |
| `FLAG` | Fuzzy match (name or domain close but not exact) | **Stop, human decides** | — |

**Fuzzy match example:** candidate `chatgpt.com` — no exact match, but `openai.com` is in the index. Levenshtein distance on slugs `chatgpt` vs `openai` is 6 (no flag); but if `aliases: [chatgpt]` is on the openai.yaml, the alias lookup catches it directly. **Always add `aliases` to programs with multiple brand names.**

**Why this matters:** 89% of current programs come from PartnerStack. Re-syncing without pre-check creates mass duplicates and wastes 60-90% of scraping budget.

### Step 1 — YAML creation

Create `programs/{slug}.yaml` per `schema/program.schema.json`. See
[CONTRIBUTING.md](../CONTRIBUTING.md#yaml-template) for the template.

**Required fields:** `name`, `slug`, `url`, `category`, `commission`, `cookie_days`, `payout`, `signup_url`, `description`, `short_description`, `agents`.

**Also record** (recommended additions — see "Schema evolution" below):
- `source`: which discovery channel (`partnerstack-api`, `product-hunt`, `yc-directory`, `reditus`, `manual`, etc.)
- `last_verified_at`: ISO date of last URL verification

Validate immediately:

```bash
npm run registry:build   # runs scripts/build-registry.ts
```

### Step 2 — Logo download

Logos live in `public/logos/{slug}.{ext}`. Fallback chain: apple-touch-icon → favicon.ico → Google Favicon API.

> **Note:** The memory index references `scripts/download-logos.ts`, but that script does not exist in-repo yet. Until it lands, logos are fetched manually or via the web-form submit flow. If you batch-import, write logos out with a one-off script in the session and delete it after — do not commit ad-hoc scripts.

### Step 3 — Signup URL enrichment

The `signup_url` must point to the actual affiliate signup page, not the product homepage.

**Fast path (HTML scrape):**
- Fetch the program homepage
- Scan `<a href>` for affiliate keyword patterns (see [discovery-keywords.md](./discovery-keywords.md))
- Follow the top-scored link; confirm it's an affiliate signup page

**Fallback (AI crawl, for ~15% of cases):**

```bash
B=~/.claude/skills/gstack/browse/dist/browse
$B goto https://example.com
$B text                # extract visible text
$B snapshot -i         # get interactive elements with @refs
```

Use 5 parallel sub-agents, ~8 sites each.

### Step 4 — Data validation audit

After any batch add, run:

```bash
python3 -c "
import json
d = json.load(open('src/lib/registry.json'))
programs = d['programs']

# Duplicate slugs
slugs = [p['slug'] for p in programs]
dup_slugs = [s for s in slugs if slugs.count(s) > 1]
print('Dup slugs:', set(dup_slugs) or 'none')

# Duplicate URLs
urls = [p['url'].rstrip('/').lower() for p in programs]
dup_urls = [u for u in urls if urls.count(u) > 1]
print('Dup URLs:', set(dup_urls) or 'none')

# Non-standard networks
nets = {p.get('network') for p in programs if p.get('network')}
bad = [n for n in nets if n != n.lower().replace(' ', '-')]
print('Non-standard networks:', bad or 'none')

# Approval values
approvals = {p.get('approval') for p in programs}
print('Approval values:', approvals)

# Singleton categories
from collections import Counter
cats = Counter(p['category'] for p in programs)
singletons = [(c,n) for c,n in cats.items() if n <= 2]
print('Singleton categories:', singletons or 'none')
"
```

**Data standards:**

| Field | Format | Examples |
|---|---|---|
| `network` | lowercase, hyphenated | `partnerstack`, `cj-affiliate`, `in-house`, `dub` |
| `approval` | `auto` or `manual` | never `automatic` |
| `commission.rate` | string | `25%`, `$100`, `20-30%`, `varies` |
| `category` | Title Case, from allowlist | see below |
| `created_at` | ISO date | `2026-04-18` |

**Category allowlist (enforce — current drift):**
`AI`, `Analytics`, `Business Operations`, `Communication`, `Content Management`, `CRM`, `Customer Support`, `Design`, `Developer Tools`, `E-Commerce`, `Email Marketing`, `Finance`, `HR & Recruiting`, `Infrastructure`, `Marketing`, `Productivity`, `Sales`, `SaaS`, `Security`, `Social Media`.

> **Known drift:** registry has 20 categories today vs. the 17 target in early docs. Pick one set and enforce via schema `enum`.

### Step 5 — URL verification

```bash
npm run verify                          # all programs
npm run verify:changed                  # CI mode — only changed files
npx tsx scripts/verify-programs.ts stripe   # single program
```

> Package.json also lists `verify:deep` / `verify:deep:unverified`, but `scripts/verify-deep.ts` is **missing**. Either land that script or remove the npm entries.

### Step 6 — Build + push

```bash
npm run build                           # prebuild rebuilds registry.json
git add programs/ src/lib/registry.json public/logos/
git commit -m "data: add {N} {source} programs"
# → PR to main; CI verifies changed files
```

### Step 7 — Freshness tracking (post-merge)

AI startups pivot or die fast. Stale data erodes trust.

- Weekly cron: re-verify `last_verified_at > 30 days` programs
- Monthly cron: re-sync PartnerStack API, diff against registry, open PR with delta
- Quarterly: remove programs that 404 three checks in a row

---

## Timing & Batch Sizing

Measured per-program costs (approximate):

| Step | Structured (API) | Semi-structured (marketplace) | Unstructured (launch page) |
|---|---|---|---|
| YAML creation | ~5s | ~30s | ~60s (LLM extract) |
| Logo download | ~3s | ~3s | ~5s |
| Signup URL enrich | 0s (already in API) | ~5s scrape | ~25s (AI crawl) |
| URL verify | ~2s | ~2s | ~3s |
| **Per-program total** | **~10s** | **~40s** | **~90s** |

Batch overhead (once per run): dedup ~1s, validate ~5s, build ~10s, commit/push ~5s = **~20s fixed**.

### Throughput per session

A single focused Claude Code session (~2-3 hours of effective work before context gets heavy) can complete end-to-end:

| Source profile | Programs per session | Recommended batch size per PR |
|---|---|---|
| Structured API (PartnerStack delta, CJ) | **200-400** | 50-100 per PR |
| Semi-structured (Reditus, Dub, Rewardful marketplace) | **80-150** | 30-50 per PR |
| Unstructured (Product Hunt, YC, HN "Show HN") | **30-60** | 15-25 per PR |

### Can one session do steps 0 → 6 end-to-end?

**Yes**, provided:
- Batch stays ≤ 50 programs for semi/unstructured sources (review fatigue)
- Batch can go up to ~100 for structured API imports (less judgment per item)
- You pre-commit to **one source per session** — don't mix PartnerStack + Product Hunt in the same PR

Step 7 (freshness) is **always async** — it's a scheduled cron, never part of an import session.

### Anti-patterns

- ❌ One PR with 300 programs → reviewer abandons
- ❌ Mixing structured + unstructured sources in one PR → hard to QA
- ❌ Skipping Step 0 after PartnerStack already imported → silent duplicates
- ❌ Importing without `source` field → can't refresh that channel later

---

## Scaling to 1000+ Programs

For volumes beyond hand-curation:

1. **Discovery API**: Firecrawl ($19/mo, 3000 pages) or Apify for structured scrapes
2. **Extraction**: `claude-haiku-4-5` ~$0.001/page → $1 per 1000 programs
3. **Pipeline shape**:
   ```
   homepage HTML → regex-score affiliate link
                 → fetch affiliate page HTML
                 → Claude API structured extract
                 → schema validate → write YAML
   ```
4. **Rate limiting**: 5 concurrent requests, 500ms between batches

---

## Schema (as of Batch 1)

Fields relevant to this pipeline (see `schema/program.schema.json` for full definition):

- `kind` (enum, default `affiliate`) — `affiliate | referral | creator-payout | revenue-share | cashback | partner-network`. Use `partner-network` for programs like Amazon Associates / Shopify Partners that don't fit the traditional affiliate mold but are still valid income sources for creators/partners.
- `source` (enum) — discovery channel (`partnerstack-api`, `product-hunt`, `yc-directory`, `reditus`, `dub`, `rewardful`, ..., `community`, `manual`, `legacy`). Used by Step 7 to schedule source-level refreshes.
- `last_verified_at` (ISO date) — freshness marker. Set/bumped by Step 5. Used by Step 0 to compute age.
- `aliases` (string[]) — alternative brand names. Used by Step 0 fuzzy matcher (e.g. OpenAI → `aliases: [chatgpt, gpt-4, dall-e]`).
- `category` is now an **enum** (20 allowed values, see Step 4 table). Adding a new category requires a schema change.
- `network` is now an **enum** (11 allowed values). Same rule.

Still pending / future:

- `completeness_score` (0-100, computed at build) — quality tier UI signal
