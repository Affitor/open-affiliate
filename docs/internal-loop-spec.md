# Daily optimisation loop — spec

> Status: v1, 2026-08-01. Runs unattended. Son reviews outcomes after the fact,
> not before each run.

## What it is

A cron job that wakes once a day, measures the site against sources it can
actually read, and — only when it finds something real — opens a pull request
and decides for itself whether to merge it.

## Why it exists

Every fix in this repo so far started with a human noticing something. The two
best finds of this session were invisible to anyone looking at the site: 48
programs whose logo silently 404'd, and pagination that lost your place on every
back. Both sat in analytics for weeks. A loop that reads the same sources every
day catches that class of thing without anyone having to look.

## Sources it reads

| Source | What it answers | Access |
|---|---|---|
| PostHog | Web vitals per page, rageclicks, event volume, funnel drop-off | Personal API key in `~/kyma-api/.env` |
| The live site | Status codes, response times, canonical tags, JSON-LD, broken assets | curl |
| The rendered `<head>` | Title template collisions, missing `og:image`, missing canonical | curl + the built site on a local port |
| The repo | Type errors, lint, build, registry drift | local |
| GitHub | Open community PRs, red CI, stale branches | `gh` |

### Reading the rendered `<head>`

Added 2026-08-01, after the first run found 31 pages sharing with no preview
image and 9 rendering `… | OpenAffiliate | OpenAffiliate`. Neither was visible
in analytics, in the build, or in any check the loop had.

Two rules make this surface worth re-checking every run:

- Next.js merges metadata **shallowly**. A route that declares its own
  `openGraph` block *replaces* the parent's, including the `opengraph-image`
  the root layout contributes by file convention. Any route with an `openGraph`
  key and no `images` key and no `opengraph-image.tsx` of its own is silently
  shipping no preview image.
- `title` is templated (`%s | OpenAffiliate`), `openGraph.title` is not. A page
  that spells the brand into its own `title` gets it twice; one that strips it
  from `openGraph.title` loses it entirely. The two fields are not
  interchangeable and a fix to one is not a fix to the other.

Check both against the **built** site, not the source. Grepping source files
found 9 of these; rendering the routes found 28 more, because the dynamic
`/categories/[slug]` and `/networks/[slug]` routes build their titles at
request time. Static grep is a starting point, never the verification.

Match the brand suffix (`" | OpenAffiliate"` occurring more than once), not the
bare word — `/docs` is legitimately titled "What is OpenAffiliate?" and a
substring check reports it as a defect every run.

Ahrefs Site Audit is deliberately not in the list — it returns "Insufficient
plan" on the current subscription.

## The decision it makes

Each run ends in exactly one of four outcomes, and the reasoning is written to
the log either way:

1. **Nothing found** — log the measurements and exit. This is the expected
   outcome most days, and a run that finds nothing is a success, not a failure.
2. **Found, fixed, merged** — the fix is small, verified, and low-risk: a broken
   asset, a stale artifact, a missing tag. CI green, merge.
3. **Found, fixed, left open** — the fix touches product behaviour, copy, or
   anything a person should look at. PR opened and left for Son.
4. **Found, not fixed** — the issue is real but the fix needs a decision the
   loop should not make alone. Logged with the evidence, no PR.

## What it must never do

- Merge anything with red CI. No exceptions, including "the failure looks
  unrelated".
- Merge a change to pricing, commission data, or any program's published terms.
  Wrong commission data costs a partner real money; that stays human-reviewed.
- Merge anything that touches auth, secrets, or the admin surface.
- Open a PR with no measurement behind it. Every PR states the number that
  triggered it and the number after the fix.
- Delete or rewrite program YAML. Community data is not the loop's to edit.
- Chase a metric it has not verified is real. A P75 over 36 samples is noise;
  the loop checks sample size and distinct users before acting, because the
  first pass of this session's analytics review nearly shipped a fix for three
  pages whose median was fine.

### Qualifying a web-vitals number

A page-level vitals figure is not actionable below **20 samples and 10 distinct
users**. Under that, widen the window before believing it, and compare the
median against the percentile — a bad P75 over a good median is a tail.

Worked example from the first run, kept because it is the exact shape of the
mistake: `/docs` showed LCP p50 3576ms / p75 6551ms over 7 days, which reads
like a broken page. The sample was 4 events from 3 users. The same query over
30 days gave p50 830ms / p75 1129ms over 12 events, and curl put the page's
TTFB at 280ms — the *fastest* on the site. There was nothing to fix. Three
other candidates died the same way that run: `/programs/copy-ai` INP p75 2700ms
over 3 samples with a 216ms median, `/programs/userpilot` FCP p50 2740ms from a
single user, and `/rankings` INP p50 168ms, which is inside the good band.

Cross-check a slow-looking page against curl before treating it as slow. A
server-side number disagreeing with the field data usually means the field data
is thin, not that the page is broken.

## Improving itself

If a run finds that its own checks are wrong — a false positive, a blind spot, a
threshold that fires too often — it edits this spec and the script in the same
PR as the finding, and says so in the PR body. The loop is allowed to change the
loop.

Known-noisy checks, and what to do instead:

- **Registry drift.** `npm run registry:build` rewrites a `generated_at`
  timestamp on every invocation, so a plain `git status` after it reports drift
  every single run and means nothing. Compare ignoring that field, and restore
  the working tree afterwards — the cron entrypoint refuses to run on a dirty
  tree, so a run that leaves the timestamp modified blocks tomorrow's run.
- **Lint warnings.** The repo sits at 20 warnings / 0 errors. Only a change in
  that count is a signal; the standing warnings are not a finding.

## Where it lives

- `scripts/daily-audit.sh` — the cron entrypoint
- `docs/internal-loop-spec.md` — this file, which the run reads as its brief
- `~/.openaffiliate-loop/` — logs, one file per run, plus `state.json` carrying
  what the previous run already reported so the same finding is not raised twice

## Schedule

`17 9 * * *` local. Off the hour on purpose — every scheduled job in the world
fires at :00.
