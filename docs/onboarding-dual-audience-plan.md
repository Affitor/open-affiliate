# OpenAffiliate — Dual-Audience Onboarding Plan

> 2026-06-14. Goal: make OpenAffiliate work for **technical** (founders/devs, AI agents) **and non-technical** (growth/marketing/BizDev, affiliate partners) users, on **both** sides of the marketplace (list a program / find + promote), plus affiliate **networks** (bulk). Today there is exactly one path — a GitHub PR — and it's wrong for 3 of the 4 personas.

---

## 1. The core reframe

Stop thinking "one apply page." There are **two axes** and **five cells**:

```
                 SUPPLY (list a program)            DEMAND (find + get a link)
   TECHNICAL     A · Founder / Developer            D-agent · Dev / AI agent
                 → GitHub PR + CLI + MCP            → MCP/CLI read (exists) + write tools
   NON-TECHNICAL B · Growth / Marketing / BizDev    D-creator · Affiliate partner / creator
                 → no-code form (GAP #1)            → "Get my link" (GAP #2)
   BULK          C · Affiliate network — CSV/API import + review gate (spans supply)
```

**The two missing flows (both P0):** a *no-code/no-GitHub* way to **list** (B), and a *real "get a link"* instead of an outbound bounce (D-creator). They converge on the **same two primitives**: (1) a server intake that doesn't end on GitHub, and (2) an account-light **email magic-link** identity. Build those two → B, C, and D all unlock.

---

## 2. Current state (verified in code, the gap)

- **One real write path = a GitHub PR adding `programs/{slug}.yaml`.** Even `/submit` (marketed "easiest, no GitHub") just generates YAML in the browser and `window.open()`s GitHub's new-file editor — the user still needs a GitHub account and must understand fork/branch/commit/PR. A marketer hits a hard wall here; conversion ≈ 0.
- **No backend for programs.** 755 static YAML → `programs.json` at build. Supabase exists but only for **analytics/votes** (no `programs`/`users`/`applications` tables). No auth, no dashboard, no claim.
- **Demand side does not exist.** A program page's only action is an outbound `Apply to program` → the brand's *external* signup. OpenAffiliate mints no link, captures no partner, knows no one applied.
- **CI is solid but has a hole:** `pr-programs.yml` validates + URL-verifies + auto-merges, but it calls `scripts/enrich-program.ts` **which doesn't exist** (`|| true` no-op). Dedup/logo/enrich silently don't run.

---

## 3. The five flows (concrete)

### Flow A — Founder / Developer lists a program  ·  *technical supply*  ·  [keep + enhance, P2]
GitHub PR already works for this persona. Enhancements:
1. `npx openaffiliate submit` — CLI auto-drafts the YAML **from the product URL** (AI fills commission/category/agent-prompt), then posts it through the new server intake (opens the PR for them).
2. MCP/SDK `submit_program` tool — "Add my program to OpenAffiliate" works from Cursor/Claude.
3. After it's live: **claim + owner dashboard** (live status, search rank, clicks, applies) so submission isn't a black hole.
4. The reward/upsell: "Listed free here. Run the program for real on **Affitor** (Stripe-native tracking + payouts)."

### Flow B — Growth / Marketing / BizDev lists a program  ·  *non-technical supply*  ·  **[GAP #1, P0]**
A true no-code wizard at `/list` (replaces the GitHub dead-end of `/submit`):
1. **Paste your product URL** → AI auto-drafts the listing from your public affiliates page (name, category, commission, cookie, payout).
2. **Review/edit** in a friendly form — **YAML is never shown.**
3. Enter **email** (magic-link — no GitHub, no password).
4. **"Submit for review"** → lands in a `submissions` table → a status page ("under review").
5. **Auto-approve when clean** (URL reachable + no duplicate + low spam score) → a **GitHub App bot opens the PR for them** → existing CI auto-merges → live in minutes. Otherwise a one-click admin review.
6. Email: "You're live → **claim & verify** to earn the Verified badge."
**They never see GitHub.** This single change makes the "no GitHub needed" promise finally true.

### Flow C — Affiliate network bulk-lists  ·  *bulk supply*  ·  [P1]
1. Network gets an **API key / partner account** (gated, not anonymous — bulk is trusted/partnered).
2. Upload **CSV/JSON** (or connect a feed) mapped to the schema.
3. `scripts/import-bulk.ts` normalizes → validates (zod + schema) → **dedupes by domain** against the 755 → emits N YAML files → **one batched PR** tagged `source: <network>`, `verified: false`.
4. **Maintainer reviews the batch** (aggregate report: "312 ok / 11 dup / 4 url-fail"). **No auto-merge above N files.**
5. Network attribution + a network landing page (this is distribution they can sell upstream).

### Flow D — Affiliate partner gets a link  ·  *non-technical demand*  ·  **[GAP #2, P0]**
Replace the dumb outbound `Apply` with a smart CTA on `/programs/{slug}`, branched on **one new YAML field** `powered_by`:
- **`powered_by: affitor`** → **"Get your affiliate link"** → deep-link into Affitor's magic-link partner apply → **instant tracked link + dashboard + payouts**. Trust anchor: "Verified by Stripe."
- **External program** → **"Apply to program"** → `signup_url` (+ `?utm_source=openaffiliate`), keep the existing `outbound_click` event. Plus optional **"Save to my list" / applied-tracker** (magic-link account) so a creator managing many programs isn't lost.
- Surfaced trust signals: Verified badge, real commission/cookie data, votes/Sift rank, "instant approval."

### Flow E — AI agent  ·  *technical, both sides*  ·  [P2]
Read tools exist (`search_programs`, `get_program`). Add the long-promised **write tools** — `submit_program`, `claim_program`, `get_link`/`apply` — to MCP + CLI + SDK, all proxying the same server intake. One canonical pipeline for dev, non-tech human, and agent alike.

---

## 4. Architecture — non-technical intake without breaking the open ethos

**Invariant:** YAML-in-Git stays the **single source of truth** (it powers `programs.json`, the API, MCP, SEO, the open story). A database is added **only as a staging buffer for un-published state** — pending submissions, claim tokens, bulk batches. Nothing *published* lives only in the DB; if the DB vanished, the public registry/API/agents keep working.

```
   Developer ─ direct PR ───────────────────────────────────┐
   Non-tech  ─ POST /api/submit ─┐                           │
   AI agent  ─ submit_program ───┤                           │
   Network   ─ import-bulk CLI ──┤                           │
                                 ▼                           │
                    Supabase STAGING (already wired)         │
                    submissions │ claims  (pending only)     │
                    validate · enrich(shared) · dedup ·      │
                    spam-score · DNS/email claim-verify       │
                                 │ auto-approve OR /admin     │
                                 ▼                           │
                    GitHub App bot opens/updates PR ─────────┤
                                                             ▼
                    GIT = SOURCE OF TRUTH (programs/*.yaml)
                                 │ existing pr-programs.yml (dedup·verify·auto-merge)
                                 ▼
                    build-registry.ts → programs.json  (unchanged)
                                 ▼
              Web · REST API · MCP · CLI/SDK · AGENTS.md
                                 │  /programs/{slug} CTA
                    powered_by:affitor? ── yes → affitor.com/p/{slug} (tracked link)
                                        └─ no  → signup_url (+utm)
```

**Keystone (do first):** write the missing **`scripts/lib/enrich.ts`** and import it from *both* CI and `/api/submit` so the web path and the PR path enrich/validate identically. Nothing is consistent without it.

Reuse the proven `/api/votes` + `/api/events` service-role + IP-hash + honeypot pattern for `/api/submit` and `/api/claim`. New migration `007_submissions_claims.sql` mirrors the existing policy style.

---

## 5. OpenAffiliate ↔ Affitor boundary

OpenAffiliate is **discovery (top of funnel)**; Affitor is the **engine (tracking, commissions, payouts)**. The boundary is **one optional, additive field** (`powered_by: affitor` + `affitor_program_slug`):
- External programs: unchanged behaviour (route to their own `signup_url`). OpenAffiliate stays honest open discovery.
- Affitor-run programs: richer in-network "Get your link" → instant tracked link.
- **Flywheel:** discover (open) → **claim** a listing (own it) → **"Run it on Affitor"** (flip `powered_by`) → tracked program. Listing is **free forever**; money sits only on the Affitor engine, never on being found. The open registry never becomes a walled garden — it's a single field.

---

## 6. Trust & quality model (resolves volume-vs-curation)

Three tiers, so frictionless self-serve doesn't dilute the signal partners rely on:
1. **Community** — self-served or auto-discovered, `verified: false`. Frictionless single submit.
2. **Claimed** — owner verified via **DNS TXT** (authoritative) or **email-on-domain** (fallback) → editable, `verified: true`.
3. **Stripe-verified** — Affitor-run, real money flows ("Verified by Stripe") — the strongest payout-credibility signal.

Rules: single submit = frictionless; **bulk gated by review** (no wholesale auto-merge); ownership precedence **owner-claimed > network-source > community** (so a network batch can't clobber a brand's curated page).

---

## 7. Roadmap

| Phase | Build | Unlocks | Effort |
|---|---|---|---|
| **P0** | `enrich.ts` (keystone) · `/api/submit` + `submissions` table + `/admin` review + GitHub App bot-PR · rewire `/submit` → no-code `/list` · demand CTA branch (`powered_by` → Affitor handoff; `utm` for external) | **B (non-tech list) + D-creator (get a link)** — the two non-technical halves the goal demands | M |
| **P1** | Claim/verify (DNS TXT + email fallback) + email **magic-link identity** · agent **write tools** (submit/claim) · owner dashboard | Ownership + Verified pipeline + agent-native supply; preps C | M |
| **P2** | Bulk network import (`import-bulk.ts` + batch-PR + review gate) · full Affitor flywheel (claim → run on Affitor) · native partner accounts/link-tracking (in Affitor) | **C (networks)** + monetization seam | M–L |

---

## 8. The one sharp insight

OpenAffiliate's **discovery** layer is mature for all four personas; its **transaction** layer (submit-for-non-coders, get-a-link-for-partners) is missing. Both gaps converge on **two primitives — a no-code server intake (form → bot PR) and email magic-link identity.** Ship those two and B, C, D unlock together, with Affitor as the monetized engine that the technical and trust-sensitive personas graduate into.

### First PR to cut (P0, smallest viable)
1. `scripts/lib/enrich.ts` (+ wire into `pr-programs.yml` and a new `/api/submit`).
2. `supabase/migrations/007_submissions_claims.sql`.
3. `POST /api/submit` + `GET /api/submit/status/[id]` + `/admin` approve (service-role + honeypot, copy `/api/events`).
4. GitHub App bot (the only DB→Git writer).
5. Rewire `/submit` page → server intake (kill the GitHub redirect) + fix the false "no GitHub / agent opens PR" copy in `/docs/submit` and `AGENTS.md`.

*Key files: `src/app/submit/page.tsx` (replace GitHub redirect) · `src/app/api/events/route.ts` + `api/votes/route.ts` (pattern to copy) · `.github/workflows/pr-programs.yml` (backbone, calls the missing script) · `scripts/build-registry.ts` (YAML→json, preserve) · `schema/program.schema.json` (additive `powered_by`) · `src/app/programs/[slug]/page.tsx` (Apply CTA / Affitor boundary).*
