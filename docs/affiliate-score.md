# Affiliate Score

The Affiliate Score is a composite metric (0-100) that ranks affiliate programs based on their value to affiliates. It is used across the OpenAffiliate platform for rankings, recommendations, and comparisons.

## Score Components

| Component | Max Points | Description |
|---|---|---|
| Commission Value | 40 | How much affiliates earn per conversion |
| Cookie Duration | 15 | How long the tracking cookie lasts |
| Type + Duration | 25 | Recurring programs score higher, especially lifetime |
| Verified | 10 | Community-verified accuracy bonus |
| Completeness | 10 | Programs with full data rank higher |
| **Total** | **100** | |

## Commission Value (40 pts)

Scoring depends on commission structure:

**Percentage-based** (e.g., "30%"):
```
score = min(rate / 50, 1) * 40
```
- 50%+ commission = maximum 40 points
- 25% commission = 20 points
- 10% commission = 8 points

**Flat fee** (e.g., "$500"):
| Amount | Score |
|---|---|
| $1 - $49 | 8 |
| $50 - $99 | 16 |
| $100 - $499 | 28 |
| $500+ | 40 |

**"Varies"**: 15 points (neutral midpoint)

**Compound rates** (e.g., "$5 per lead + 30%"): the percentage component is used.

## Cookie Duration (15 pts)

```
score = min(cookie_days / 90, 1) * 15
```
- 90+ days = maximum 15 points
- 30 days (standard) = 5 points
- 7 days = ~1 point

## Type + Duration (25 pts)

| Commission Type | Duration | Score |
|---|---|---|
| One-time | — | 5 |
| Tiered | — | 12 |
| Recurring | unknown | 18 |
| Recurring | 12 months | 21 |
| Recurring | 24 months | 23 |
| Recurring | Lifetime | 25 |

Recurring programs are significantly more valuable because affiliates earn on every renewal, not just the initial sale.

## Verified (10 pts)

Programs with the `verified` badge receive 10 bonus points. Verification means the community has confirmed the program's commission rates, cookie duration, and signup URL are accurate.

## Completeness (10 pts)

| Field | Points |
|---|---|
| Description (20+ chars) | 4 |
| Agent prompt (10+ chars) | 3 |
| Signup URL | 3 |

Programs that provide complete data help both human affiliates and AI agents make better decisions.

## Examples

| Program | Commission | Cookie | Type | Verified | Complete | **Total** |
|---|---|---|---|---|---|---|
| 30% recurring/lifetime, 90d, verified, complete | 24 | 15 | 25 | 10 | 10 | **84** |
| 50% recurring/12mo, 30d, verified, complete | 40 | 5 | 21 | 10 | 10 | **86** |
| $500 one-time, 30d, not verified, partial | 40 | 5 | 5 | 0 | 4 | **54** |
| 10% one-time, 30d, not verified, minimal | 8 | 5 | 5 | 0 | 0 | **18** |

## Implementation

The scoring function is defined in [`src/lib/programs.ts`](../src/lib/programs.ts) as `affiliateScore()`. It is a pure function with no external dependencies.

```typescript
import { affiliateScore } from "@/lib/programs";
const score = affiliateScore(program); // 0-100
```

## Rate Parsing

Commission rates come in various formats from YAML data. The `parseCommissionRate()` function handles:

| Input | Parsed As |
|---|---|
| `"30%"` | 30 (percentage) |
| `"$1,000"` | 1000 (flat fee) |
| `"20-30%"` | 30 (takes higher) |
| `"$5 per lead + 30%"` | 30 (prefers percentage) |
| `"varies"` | 0 (scored separately) |

Commas in dollar amounts are stripped before parsing.
