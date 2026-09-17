# Networks as a source of truth — spec

> Draft for approval, 2026-08-01. Nothing below is built yet.
> Every recall number here was measured, not estimated. The failures are
> recorded too, because they rule out the approaches that look obvious.

## The idea

models.dev separates **a model** from **the providers that serve it**. One model,
many providers, and you can browse from either side.

The same shape fits here: **a program** is the product, **a network** is how you
can join it. Kit runs its program on PartnerStack. PhotoRoom is on Awin. Some
brands run on two at once. Click a network, see everything reachable through it.

## What is wrong today

`network` is a single string, and the distribution gives the problem away:

| network | programs |
|---|---|
| partnerstack | 410 |
| in-house | 294 |
| impact | 22 |
| rewardful | 14 |
| firstpromoter | 8 |
| dub | 3 |
| awin | 2 |
| tolt | 1 |

PartnerStack is 54% of the registry because 410 programs arrived in one
PartnerStack bulk import. Tolt has 1. Dub has 3. Tolt and Dub each have hundreds
of real customers.

**The field records where we imported a program from, not where it can be
joined.** Those are different questions, and only the second is useful to a
partner or a brand.

It is also wrong in places. `customgpt` is labelled `in-house`; its affiliate
page links to `customgpt.firstpromoter.com`.

## Two kinds of thing, currently conflated

The enum mixes categories that behave differently:

- **Marketplaces** — PartnerStack, Impact, Awin, CJ. A directory you browse and
  apply through. Membership is public and listed.
- **Affiliate software** — Tolt, Rewardful, FirstPromoter, Dub, Tapfiliate,
  LemonSqueezy. The brand runs its own program on someone else's
  infrastructure. There is no directory; the only public trace is a portal
  hostname like `customgpt.firstpromoter.com`.

Detection differs completely between the two, so the model should name the
difference rather than flatten it.

## What I tested

Four detection methods, on real programs, before proposing any of them.

| Method | Result |
|---|---|
| Pattern-match `signup_url` / `dashboard_url` | **~112 of 760 (15%)**. High precision. Found 104 PartnerStack, 5 Dub, 2 LemonSqueezy, 1 FirstPromoter. |
| Fetch signup page HTML with curl, look for platform scripts | **~20% recall.** Most affiliate pages are JS-rendered or bot-protected, so curl gets a shell. |
| Render the page and watch network requests | **0 of 8.** Tested with a real browser capturing 31–241 requests per page. The platform script does not load on the public "join our program" page — it loads on the advertiser's main site for conversion tracking, or inside the portal after login. This approach looks right and does not work. |
| Render the page, inspect outbound links for platform portals | **2 of 8**, and both carried evidence: `ui.awin.com/merchant-profile/121800` for PhotoRoom, `customgpt.firstpromoter.com` for CustomGPT — which is currently mislabelled `in-house`. |

No single signal gets high coverage. Anyone promising one has not run it.

## The proposal

### 1. Model networks as a list with evidence

```yaml
networks:
  - id: firstpromoter
    kind: software
    evidence: https://customgpt.firstpromoter.com/
    method: portal-link
    verified_at: "2026-08-01"
  - id: partnerstack
    kind: marketplace
    evidence: https://partnerstack.com/marketplace/customgpt
    method: marketplace-listing
    verified_at: "2026-08-01"
```

The important part is not the list, it is that **every claim carries how it was
determined and when**. That is what makes it a source of truth rather than a
label. It also lets CI re-check a claim deterministically: fetch the evidence
URL, confirm it still resolves and still contains the fingerprint.

`network` stays as a deprecated alias for the first entry so nothing breaks
while the site migrates.

### 2. Classify in layers, and let `unknown` exist

Run cheapest first, stop at the first hit, record which layer produced it:

1. URL pattern on `signup_url` / `dashboard_url` — free, ~15%
2. Marketplace directories — PartnerStack and Awin publish public listings that
   can be matched by domain
3. Rendered signup page, outbound links only — the browser is already available
   on the Mac mini
4. Everything left is `unknown`, and says so on the page

**`unknown` is a feature.** 294 programs are labelled `in-house` today with no
evidence, and some of them are not. Saying "we have not confirmed this" is worth
more to a partner than a confident wrong answer, and it is the same discipline
the verified/unverified split already uses.

### 3. CI gate

The existing program PR workflow gains a step: for each network claim, fetch the
evidence URL and confirm the fingerprint. Pass, fail, or `unknown` — no
guessing. A claim whose evidence has gone dead becomes `unknown` rather than
silently staying true.

### 4. What ships to a reader

- `/networks/<id>` already exists — it gains the kind, the detection method
  breakdown, and an honest count
- A program page lists every network it can be joined through, not one
- The markdown surface carries the same, since that is what an agent reads

## Deliberately not in scope

- Scraping behind a login. Marketplace data that needs an account is not worth
  the fragility.
- Guessing with an LLM. A model asked "which network is this on" will answer
  confidently and be wrong, and the whole point of this work is to stop having
  unevidenced labels.
- Backfilling all 760 in one pass. Layer 1 and 2 run over everything; layer 3
  costs a browser page-load each and should run against the top programs first.

## Open question for Son

The re-crawl will move numbers that are currently on the homepage. PartnerStack
will drop from 410 to whatever can be evidenced — possibly ~104. In-house will
drop too. The registry gets smaller-looking and more honest at the same time.

Confirm that is the trade you want before I build it.
