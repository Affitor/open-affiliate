# Registry data audit — before any crawl

> 2026-08-01, against 760 programs. Every number here was measured.
> The question this answers: is the existing data organised correctly enough
> to be worth replicating? Partly. Three problems have to be fixed first,
> because a crawl multiplies whatever shape it lands in.

## What is already right

- **No duplicates.** 0 groups sharing a domain, 0 near-identical names. The
  dedup in the PR pipeline works.
- **Core fields are populated.** description, short_description, tags at 100%;
  cookie_days 99.9%; payout 99.5%; approval 99.7%; attribution 98.9%.
- **The agents block is complete.** 760/760 have a prompt and keywords,
  757 have use cases. This is the most valuable content in the registry and it
  is the best-maintained part of it.
- **Verification dates exist** on 754/760.

## Problem 1 — a quarter of the registry has no commission figure

**192 programs (25.3%) have `commission.rate: "varies"`.** Not a range, not an
estimate — no number at all. Commission is the field the whole product exists to
answer, and a quarter of the answers are blank.

The cluster is coherent:

| | |
|---|---|
| from `source: community` | 172 |
| labelled `network: in-house` | 182 |
| **verified** | **0** |

A further **10 programs carry a bare number with no unit** — `"175"`, `"200"`,
`"50"`, `"4"`. Is 175 a percentage or dollars? The UI renders it as-is, so
`/categories` currently shows *"Top: Sendcloud (200)"* with no unit at all.

## Problem 2 — a quarter of signup links go nowhere useful

**207 programs (27.2%) have a `signup_url` that is a bare homepage** — no path.
`https://ahrefs.com`, `https://agenta.ai`. **180 of them are byte-identical to
the program's `url`**, so the field was filled by copying the website.

That makes "signup_url: 100% complete" a false comfort. It is populated; a
quarter of it is not a signup link.

Separately, a 40-program sample found **~5% of signup URLs dead** (extrapolates
to ~38 across the registry), and at least one resolves to the wrong kind of page
entirely — `flippa-com` points at a search results page.

## Problem 3 — network labels are provenance, not fact

Covered in `network-classification-spec.md` and unchanged: PartnerStack holds
54% of the registry because 410 programs arrived in one import, and only 104 of
those can be evidenced. Tolt has 1. `customgpt` is labelled `in-house` while its
affiliate page links to `customgpt.firstpromoter.com`.

## The 98

Problems 1 and 2 overlap on **98 programs (12.9%)** that have both: no
commission figure *and* a homepage as their signup link.

| | |
|---|---|
| `source: community` | 91 |
| `network: in-house` | 95 |
| verified | 0 |
| top categories | Developer Tools 34, AI 25 |

These are entries where we know the product exists and essentially nothing about
its affiliate program. Drop them and the registry is 662 programs that mostly
say something true.

## What to fix before replicating

### Make commission a typed object

The single change that makes standardisation possible. `commission.rate` is
free text today, which is how `"varies"`, `"175"`, `"$5 per lead + 30%"` and
`"20-30%"` all coexist in one field and why `parseCommissionRate` has to guess.

kyma-api solved the same problem for model pricing: `pricing` is an object with
an explicit `mode`, so a consumer never has to parse prose.

```yaml
commission:
  mode: percentage | flat | hybrid | tiered | unknown
  value: 30            # null when mode is unknown
  currency: USD
  duration: 12 months
  raw: "30% recurring for 12 months"   # what the source actually said
```

`mode: unknown` is the point. It makes the 192 honest instead of invisible, it
lets the UI say "not published" rather than printing "varies", and it lets CI
reject a bare `"175"` that means nothing.

### Require a signup link that is not the homepage

Schema check: reject a `signup_url` whose path is `/` or which equals `url`.
That is a two-line CI rule and it stops problem 2 from growing.

### Then crawl

With the shape fixed, an import produces typed rows or fails loudly, instead of
adding to a pile that has to be re-parsed later.

## Recommendation

Fix the shape first. The 98 either get real data or get marked `unknown` and
stop pretending. A crawl before that multiplies the current shape by however
many programs it adds — which is exactly how PartnerStack came to be 54% of the
registry with 25% of it evidenced.
