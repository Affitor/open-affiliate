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
| The repo | Type errors, lint, build, registry drift | local |
| GitHub | Open community PRs, red CI, stale branches | `gh` |

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

## Improving itself

If a run finds that its own checks are wrong — a false positive, a blind spot, a
threshold that fires too often — it edits this spec and the script in the same
PR as the finding, and says so in the PR body. The loop is allowed to change the
loop.

## Where it lives

- `scripts/daily-audit.sh` — the cron entrypoint
- `docs/internal-loop-spec.md` — this file, which the run reads as its brief
- `~/.openaffiliate-loop/` — logs, one file per run, plus `state.json` carrying
  what the previous run already reported so the same finding is not raised twice

## Schedule

`17 9 * * *` local. Off the hour on purpose — every scheduled job in the world
fires at :00.
