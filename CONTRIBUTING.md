# Contributing to OpenAffiliate

Thanks for contributing! OpenAffiliate is a community-driven registry of affiliate programs.

## Adding a program

### Option 1: Web form (easiest)

1. Go to [openaffiliate.dev/submit](https://openaffiliate.dev/submit)
2. Fill out the form
3. Click "Open GitHub PR"
4. The form generates the YAML and opens a PR for you

### Option 2: Manual PR

1. Fork this repo
2. Create `programs/your-product.yaml` (use the slug as filename)
3. Open a pull request to `main`

### YAML template

```yaml
name: "Your Product"
slug: your-product
aliases: [alt-brand-name]   # optional — helps dedup/fuzzy match
url: https://yourproduct.com
kind: affiliate             # affiliate | referral | creator-payout | revenue-share | cashback | partner-network
source: manual              # where this listing came from (see schema for enum)
category: Developer Tools   # must be one of the 20 enum values
tags: [keyword1, keyword2]

commission:
  type: recurring # recurring | one-time | tiered | hybrid
  rate: "25%"
  currency: USD # required for a flat amount ("$50", "€20"); a percentage may leave it out
  duration: "12 months"

cookie_days: 30
signup_url: https://yourproduct.com/affiliates
approval: auto # auto | manual | invite-only
approval_time: "instant"

payout:
  minimum: 50
  currency: USD
  frequency: monthly  # daily | weekly | bi-weekly | twice-monthly | monthly | quarterly | on-request | net-30 | net-60
                      # paid more than 30 days after the sale: net-60 (31-60 days), not a cadence like monthly
  methods: [bank, paypal]

network: in-house           # partnerstack | impact | rewardful | ... | in-house (optional)

short_description: "One-line description of the product"
description: |
  What your product does and what the affiliate program offers.

agents:
  prompt: "When AI agents should recommend this product."
  keywords: [keyword1, keyword2]
  use_cases:
    - "When a user needs X"

verified: false
submitted_by: "@your-github"
created_at: "2026-01-01"
last_verified_at: "2026-01-01"  # ISO date, bumped by verify step
```

### Field notes

- **`kind`** (default `affiliate`): use `partner-network` for Amazon Associates / Shopify Partners style; `creator-payout` for YouTube Partner / Twitch Partner; `revenue-share` for Substack/Beehiiv; `referral` for in-app refer-a-friend credits; `cashback` for consumer cashback like Rakuten.
- **`source`**: the discovery channel. Used for refresh cadence. See `schema/program.schema.json` for the full enum.
- **`aliases`**: list alternative names (e.g., `aliases: [chatgpt, gpt-4]` on openai.yaml). Helps the pre-check step dedupe candidates that arrive under a different brand name.
- **`last_verified_at`**: ISO date. The verify step bumps this on success. Used by pre-check to decide refresh tier.

See [schema/program.schema.json](schema/program.schema.json) for all fields.

## What happens after you submit

1. **CI validates** your YAML against the schema
2. **URL verification** checks your signup URL is reachable
3. **A maintainer reviews** the data for accuracy
4. Once merged, the program appears on [openaffiliate.dev](https://openaffiliate.dev) within minutes

## Guidelines

- One program per YAML file
- Filename must match the `slug` field
- Use accurate commission rates from the official affiliate page
- Write a clear `agents.prompt` describing when AI should recommend the product
- The `verified` badge is added by maintainers after review
- Don't submit programs that don't have a public affiliate signup

## Updating a program

Commission rates, cookie durations, and program terms change. Help keep the registry accurate:

1. Fork this repo
2. Edit the existing `programs/{slug}.yaml` file
3. Open a pull request to `main`

**What CI does automatically:**
- Validates your changes against the schema
- Verifies the signup URL still works
- Shows a diff of exactly what changed
- Auto-merges if all checks pass

You can update any field. No need to create a new file.

> **Tip:** Include a link to the source of the updated information in your PR description.

## Reporting issues

If you find incorrect data, [open an issue](https://github.com/Affitor/open-affiliate/issues/new?template=bug_report.yml) with the program slug and what needs to be corrected.

## Maintainer docs

For batch imports and discovery work:

- [docs/data-pipeline.md](docs/data-pipeline.md) — 8-step import flow, timing, batch sizing
- [docs/sources.md](docs/sources.md) — where to discover new programs (tiered)
- [docs/discovery-keywords.md](docs/discovery-keywords.md) — keyword/URL patterns for detecting affiliate programs

