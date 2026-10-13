# Affiliate Score

The Affiliate Score is a composite metric (0-100) that ranks affiliate programs based on their value to affiliates. It is used across the OpenAffiliate platform for rankings, recommendations, and comparisons.

Every input is a structured field of the program's YAML file. The free-text rate is shown on the program's page but never read by the score, so rewording it cannot move a program.

## Score Components

| Component | Max Points | Description |
|---|---|---|
| Commission Value | 40 | A single percentage, or a flat amount in US dollars |
| Cookie Duration | 15 | How long the tracking cookie lasts, once the terms are verified |
| Type + Duration | 25 | Recurring programs score higher, especially lifetime |
| Verified | 10 | Terms checked against the program's own page |
| Completeness | 10 | Programs with full data rank higher |
| **Total** | **100** | |

## Commission Value (40 pts)

Read from the structured commission fields (`mode`, `value`, `currency`) and the program's `kind`. Two kinds of commission count:

**Percentage-based** (mode `percentage`, in any currency):
```
score = min(value / 50, 1) * 40
```
- 50%+ commission = maximum 40 points
- 25% commission = 20 points
- 10% commission = 8 points

**Flat fee** (mode `flat` with currency set to `USD`):
| Amount | Score |
|---|---|
| $1 - $49 | 8 |
| $50 - $99 | 16 |
| $100 - $499 | 28 |
| $500+ | 40 |

**Everything else: 0 points**
- Tiered and hybrid deals (mode `tiered` or `hybrid`, e.g. "$5 per lead + 30%"): no single rate to compare
- No rate published (mode `unknown`, including "varies")
- A flat amount in another currency, or with no currency set
- A zero amount
- Referral rewards paid in credit or gift cards (kind `referral`)

The program's own page shows those terms in full. The /best topic lists and the category pages count commission by the same rule.

## Cookie Duration (15 pts)

```
score = verified ? min(cookie_days / 90, 1) * 15 : 0
```
- 90+ days = maximum 15 points
- 30 days (standard) = 5 points
- 7 days = ~1 point

Counted only for verified programs. An unverified program's stored cookie window is often an import default, and the site does not show it, so it scores 0 until the terms are checked.

## Type + Duration (25 pts)

| Commission Type | Duration | Score |
|---|---|---|
| One-time | — | 5 |
| Hybrid | — | 5 |
| Tiered | — | 12 |
| Recurring | unknown | 18 |
| Recurring | 12 months | 21 |
| Recurring | 24 months | 23 |
| Recurring | Lifetime | 25 |

Recurring programs are significantly more valuable because affiliates earn on every renewal, not just the initial sale.

## Verified (10 pts)

Programs with the `verified` badge receive 10 bonus points. A verified program had its terms checked against its own affiliate page. Verification also lets the cookie window count.

## Completeness (10 pts)

| Field | Points |
|---|---|
| Description (21+ chars) | 4 |
| Agent prompt (11+ chars) | 3 |
| Signup URL | 3 |

Programs that provide complete data help both human affiliates and AI agents make better decisions.

## Examples

| Program | Commission | Cookie | Type | Verified | Complete | **Total** |
|---|---|---|---|---|---|---|
| 30% recurring/lifetime, 90d, verified, complete | 24 | 15 | 25 | 10 | 10 | **84** |
| 50% recurring/12mo, 30d, verified, complete | 40 | 5 | 21 | 10 | 10 | **86** |
| Tiered 20-40%, 60d, verified, complete | 0 | 10 | 12 | 10 | 10 | **42** |
| $200 gift card per referral, 30d, verified, complete | 0 | 5 | 5 | 10 | 10 | **30** |
| $500 USD one-time, 30d, not verified, partial | 40 | 0 | 5 | 0 | 4 | **49** |
| 10% one-time, 30d, not verified, minimal | 8 | 0 | 5 | 0 | 0 | **13** |

## Implementation

The scoring function is defined in [`src/lib/programs.ts`](../src/lib/programs.ts) as `affiliateScore()`. It is a pure function of the program's structured fields. The commission it counts comes from `rankedCommission()` in the same file, which the list pages use too. The embeddable score badge shows the same number.

```typescript
import { affiliateScore } from "@/lib/programs";
const score = affiliateScore(program); // 0-100
```

## Fields Read

| YAML field | Used for |
|---|---|
| `commission.mode`, `commission.value` | Commission value |
| `commission.currency` | Flat amounts count only when it is USD |
| `kind` | Referral rewards earn no commission points |
| `commission.type`, `commission.duration` | Type + Duration |
| `cookie_days` | Cookie duration, verified programs only |
| `verified` | Verified, and whether the cookie window counts |
| `description`, `agents.prompt`, `signup_url` | Completeness |

The rate text (`commission.rate`) and `commission.conditions` are shown on the program's page and never scored.
