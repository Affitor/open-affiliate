# Contributing to OpenAffiliate

OpenAffiliate is an open registry of affiliate programs. Each program is one YAML file in `programs/`. Listing is free, and no program can pay for a position. OpenAffiliate is maintained by Affitor.

This guide covers adding a program, correcting one, and what happens to it after merge.

## Ways to add a program

| Way | You need | You give |
|---|---|---|
| [Submit by URL](https://openaffiliate.dev/submit#by-url), MCP `submit_program` or `POST /api/submissions` | nothing | the link to the program page; it joins the review queue with a status link, and nothing is listed, scored or opened as a pull request until a maintainer verifies the terms |
| [Full web form](https://openaffiliate.dev/submit) | a GitHub account | the terms; the form writes the file and opens GitHub, where you create the pull request |
| Pull request | a GitHub account | `programs/<slug>.yaml` (template below) |
| [Suggest a program](https://github.com/Affitor/open-affiliate/issues/new?template=suggest-a-program.yml) issue | a GitHub account | only the link to the program page |
| Email to hello@affitor.com | nothing | the link to the program page |

GitHub is faster than email and shows where your request stands.

## The proof bar

A maintainer checks every term against the brand's own program page before merging. So:

- **Use the brand's own page.** The source is the affiliate or terms page on the brand's domain. A listing on a network such as Dub or PartnerStack is not proof on its own. Put the page's link in the pull request description.
- **Unknown means empty.** If the page does not state a term, leave the field out. Do not fill a default cookie window, a `payout.minimum` of 0, or an `approval_time`. An empty field is never read as zero.
- **Factual wording.** Say what the product does and what the program pays. No ranking words such as "best", "dependable" or "reliable".
- **`verified: false`.** Maintainers set `verified: true` and `last_verified_at` after checking. Leave both alone.

## File template

```yaml
name: Your Product
slug: your-product              # same as the file name
url: https://yourproduct.com
category: Developer Tools       # one of the 20 values in the schema
tags: [saas, api]

commission:
  type: recurring               # recurring | one-time | tiered | hybrid
  rate: "25%"                   # as the program page says it
  mode: percentage              # percentage | flat | tiered | hybrid | unknown
  value: 25                     # the number; null when mode is unknown
  currency: USD                 # required for a flat amount
  duration: "12 months"         # a bare length, or "lifetime"

# Only what the program page states. Leave out anything it does not.
cookie_days: 60
signup_url: https://yourproduct.com/affiliates   # the program page, not the homepage
approval: manual                # auto | manual | invite-only

payout:
  minimum: 50
  currency: USD
  frequency: monthly            # daily | weekly | bi-weekly | twice-monthly | monthly | quarterly | on-request | net-30 | net-60
  methods: [bank, paypal]       # bank | paypal | wise | crypto | check | stripe

short_description: "One line, 100 characters at most"
description: >
  What your product does and what the affiliate program offers.

agents:
  prompt: >
    When an AI agent should recommend this product, and when not.
  keywords: [keyword1, keyword2]
  use_cases:
    - "When a user needs X"

verified: false
submitted_by: "@your-github"
created_at: "2026-10-20"        # the date you add the file; it never changes
```

[`schema/program.schema.json`](schema/program.schema.json) is the full specification.

### Rules the file must pass

- Required: `name`, `slug`, `url`, `category`, `commission` (`type`, `rate`, `mode`), `description`, `short_description`, `agents.prompt`, `created_at`.
- `commission.mode` other than `unknown` needs `value`. A flat amount needs `currency`; give it for a percentage too.
- `short_description` is 100 characters or fewer.
- `signup_url` is an https link to the program page, not the homepage and not the same as `url`. URLs use a lowercase domain.
- `restrictions` is a list. `duration` is a bare length ("12 months", "lifetime"); put conditions in `commission.conditions`.
- A payout paid more than 30 days after the sale is `net-60` (31 to 60 days), not `monthly`.
- Do not add `also_on`; maintainers link Affitor listings.
- One program per file, named `<slug>.yaml`.

## What happens to a pull request

1. **Fork check, at once.** A fork pull request that only adds files under `programs/` is validated by `.github/workflows/fork-yaml-ci.yml`: schema, registry build and markdown build. It fails on any other path and on edits to existing files.
2. **Full CI, after a maintainer approves the run.** `.github/workflows/ci.yml` builds the site and crawls the signup URL. A red Vercel status on a fork is expected; Vercel does not build forks.
3. **Maintainer review.** A maintainer compares every term with the program page and asks for changes in the pull request. Reviews usually take a few days. Reply to the review and push fixes to the same branch.
4. **Merge.** New files only, at most 3 files, with the shape checks in `.github/scripts/auto-merge-policy.cjs` passing, can merge automatically once a maintainer adds the `reviewed` label. Everything else is merged by hand.

## After merge

1. The program appears on [openaffiliate.dev](https://openaffiliate.dev) after the next deploy, as not verified: its commission is marked unconfirmed, and its cookie window, payout and approval stay hidden.
2. A maintainer verifies the terms on the program page and marks it verified.
3. Once every check is assessed, the program gets an OpenAffiliate Score (OAS), a report at `https://openaffiliate.dev/programs/<slug>/oas`, and a place on [/rankings](https://openaffiliate.dev/rankings). There is no instant score.

OAS reads only the verified terms: how clearly the program publishes them (Transparency, 70 points) and whether three of them protect the affiliate (Partner value, 30 points: a cookie of 60 days or more, a minimum payout of USD 50 or less, payment at least monthly). It never reads the size of the commission. Grades run from A+ to F. Equal scores are ordered by Partner value, then the most recently verified terms, then name. Details: [openaffiliate.dev/docs/oas](https://openaffiliate.dev/docs/oas).

### Improving a score

Publish the missing terms on your own program page, in plain words. The report lists the gaps worth the most points first. Editing the YAML alone does not change the score, because every term is verified against the page. The report also shows machine checks (program page is live, Core Web Vitals on mobile, brand search volume); they are not counted in OAS.

## Correcting a program

Terms changed, or a check looks wrong:

- Open a [Terms changed](https://github.com/Affitor/open-affiliate/issues/new?template=terms-changed.yml) issue with the slug and the URL of the page that states the current terms, or use **Report an error** on the program's OAS report. A maintainer verifies the page again, and the score follows the verified terms. Nobody edits a score by hand.
- A pull request that edits an existing file also works, with the source link in its description. The fork check accepts only new files, so it shows as failed until a maintainer runs the full checks. Edits are never merged automatically. Do not change `created_at`, `verified` or `last_verified_at`.

## Code and docs

Code changes are welcome. Open an issue first for anything large. A pull request that touches code needs a maintainer to approve its CI run.

## Maintainer docs

For batch imports and discovery work:

- [docs/data-pipeline.md](docs/data-pipeline.md): import flow, timing, batch sizing
- [docs/sources.md](docs/sources.md): where to discover new programs
- [docs/discovery-keywords.md](docs/discovery-keywords.md): keyword and URL patterns for detecting affiliate programs
