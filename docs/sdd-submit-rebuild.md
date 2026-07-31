# SDD — Non-Technical Program Submission (rebuilt `/submit`)

> Status: DRAFT v0.2 · 2026-06-14 · Scope: **P0** of the dual-audience onboarding plan ([onboarding-dual-audience-plan.md](onboarding-dual-audience-plan.md)). Implementation-ready: a fresh session should be able to build this without re-reading source.
>
> **v0.2 folds an adversarial architect review.** Key corrections: (1) **no zero-human auto-merge** for anonymous web submissions — they always pass a 1-click `/admin` human gate in P0 (auto-merge stays for trusted dev PRs only); (2) the keystone `enrich.ts` MUST write `enrichment-result.json` in the shape the existing CI reads (`pr-programs.yml:176`); (3) a `/api/webhooks/github` handler closes the state machine (merge→published, CI-fail→back-to-pending, closed→rejected); (4) honeypot + `ADMIN_SECRET` auth are **net-new**, not existing patterns; (5) unique constraint + pending-dedup to kill same-slug races; (6) `/api/autofill` needs explicit `maxDuration` and degrades gracefully (the form works without it).

## 1. Goal & scope

**Goal:** Let a **non-technical** person (Growth/Marketing/BizDev) list an affiliate program on openaffiliate.dev via a simple web form — **no GitHub, no YAML, no jargon** — and have it go live automatically, while **YAML-in-Git stays the single source of truth**.

**In scope (P0):**
- Rebuilt `/submit` page (the approved mockup: URL → AI auto-fill → plain-language form + live preview → email magic-link → success).
- `POST /api/autofill` — scrape a URL + LLM-draft the listing fields.
- `POST /api/submit` + `GET /api/submit/status/[id]` — accept a submission into a `submissions` staging table.
- Spam/quality pre-filter + `/admin` one-click review.
- GitHub App "bot" that renders an approved submission → `programs/{slug}.yaml` → opens a PR (then the **existing** `pr-programs.yml` takes over unchanged).
- `scripts/lib/enrich.ts` — the shared enrichment module CI already expects (currently missing). **Keystone.**

**Out of scope (later phases):** full claim/verify (DNS TXT / email-on-domain) → P1; bulk network import → P2; demand-side "get a link" / Affitor handoff → separate SDD; native partner accounts → Affitor.

**Non-goals:** replacing the developer GitHub-PR path (kept as-is; `/submit` only links out to it), and putting program data in a database (DB is staging-only).

## 2. Current state (the gap, verified in code)

- One real write path = a GitHub PR adding `programs/{slug}.yaml`. Even today's `/submit` (`src/app/submit/page.tsx`) just builds YAML client-side and `window.open()`s GitHub's new-file editor → needs a GitHub account + PR literacy. Non-coder conversion ≈ 0.
- No backend for programs. 755 static YAML → `registry.json` at build (`scripts/build-registry.ts`). Supabase exists but only for votes/analytics (`supabase/migrations/002–006`), **no `programs`/`users`/`submissions`**.
- CI `pr-programs.yml` does validate → URL-verify → auto-merge, but calls `scripts/enrich-program.ts` **which does not exist** (swallowed by `|| true`). Dedup/logo/enrich silently skipped.
- Proven write pattern to copy: `src/app/api/votes/route.ts` + `api/events/route.ts` (Supabase `service_role` + IP-hash + honeypot anti-abuse).

## 3. Architecture

**Invariant:** the DB is a **staging buffer for un-published state only**. The instant a submission is approved it becomes a YAML file in Git via a bot PR; from there Git feeds `registry.json`, the API, MCP, CLI, SEO. If the DB vanished, the public product keeps working.

```
Non-tech web form ─ POST /api/autofill ─► (scrape URL + LLM draft) ─► prefilled form
                  ─ POST /api/submit ────► submissions table (status=pending)
                                              │  validate(schema) · enrich(shared) · dedup · spam-score
                                              │  ├─ clean  ─► auto-approve
                                              │  └─ else   ─► /admin one-click review
                                              ▼ on approve
                                    GitHub App bot: render YAML → open PR
                                              ▼
                          GIT = SOURCE OF TRUTH (programs/*.yaml)
                                              │ existing pr-programs.yml (dedup·verify·auto-merge·rebuild)
                                              ▼
                          build-registry.ts → registry.json  (unchanged)
                                              ▼
                       Web · REST API · MCP · CLI/SDK · AGENTS.md
```

## 4. Data model — `supabase/migrations/007_submissions.sql`

```sql
create table submissions (
  id            uuid primary key default gen_random_uuid(),
  payload       jsonb not null,        -- normalized, schema-shaped program object
  slug          text not null,         -- proposed slug (derived from name)
  name          text not null,
  url           text not null,
  submitter_email text,                -- magic-link identity (optional but recommended)
  works_here    boolean default false, -- "I work at this company" → claim candidate (P1)
  status        text not null default 'pending'
                  check (status in ('pending','spam','approved','rejected','published')),
  spam_score    smallint default 0,    -- 0..100, higher = spammier
  dup_of        text,                  -- matched existing slug, if any
  pr_url        text,                  -- set when bot opens PR
  ip_hash       text,
  source        text default 'web-form',
  created_at    timestamptz default now(),
  reviewed_at   timestamptz,
  reviewed_by   text
);
create index on submissions (status);
create unique index on submissions (slug) where status in ('pending','approved'); -- kill same-slug races (R3)
-- RLS: service-role only (copy votes/events policy). No public read/write.
```
No `users` table in P0 — identity is an emailed magic-link token (signed, stateless JWT or a short-lived row); a full accounts/claims model arrives in P1.

**Anti-race / idempotency (architect R3, M2):** the partial-unique index above prevents two open submissions for the same slug. `dedupe()` must check **both** `registry-index.json` (published programs) **and** open `submissions` rows. `POST /api/submit` is idempotent on `(slug, ip_hash)` — a retry/double-click updates the existing pending row instead of inserting a second.

> Note (architect F2): migrations 002–006 already define `votes`, `events`, `program_stats`, `social_items`, `sift_scores`, `tracking_insights`. Confirm `007` is the next free number before writing.

## 5. The keystone — `scripts/lib/enrich.ts`

A pure module imported by **both** CI (`pr-programs.yml`) and `/api/submit`, so web and PR paths enrich identically.
- `enrich(raw): Program` — coerce commission rate format (`"50"`→`"50%"`, handle `$`/`varies`), derive `slug` from name, set defaults (`kind`, `source`, `verified:false`, `last_verified_at`), fetch + store logo (best-effort), trim/normalize tags, build `agents.prompt`/`keywords` if absent.
- `validate(p): {ok, errors}` — **real JSON-Schema validation against `schema/program.schema.json`** (ajv). ⚠️ Architect F6: `build-registry.ts:validateProgram` is only a required-fields + slug-filename check, NOT schema-based — do not assume it covers the schema; build the ajv validator here and have `build-registry.ts` reuse it.
- `dedupe(p, index): string|null` — match by domain/slug/aliases against `registry-index.json` **and** open `submissions`.
- `toYaml(p): string` — deterministic YAML serialization (one file/program, filename === slug).
- **`writeEnrichmentResult(results)` — CRITICAL CONTRACT (architect F8/M4):** `pr-programs.yml:176` reads `enrichment-result.json`; the dead `enrich-program.ts` was supposed to write it. `enrich.ts` MUST emit it as `[{ slug, changes:[], errors:[], duplicate:{match_type, matched_slug, distance}|null }]`. If it doesn't, the CI review comment shows empty results **and the dedup gate always passes (empty duplicates) → duplicates can slip through**. This file is part of the keystone, not optional.
Replace the dead `scripts/enrich-program.ts` reference in `pr-programs.yml` with this module (and keep it writing `enrichment-result.json`).

## 6. APIs

### `POST /api/autofill`  (the "Auto-fill with AI" hero)
- In: `{ url }`. Fetch the page HTML (browser UA, ~8s fetch timeout, follow signup/affiliates links), pass to the LLM with a strict JSON-schema prompt → draft `{name, category, commission{type,rate}, cookie_days, short_description, signup_url, tags}`.
- **Provider (architect F7): use OpenAI** — `content-lab/route.ts:1` already imports `openai` (Kyma is only wired for the sift cron). Decide the model + key env explicitly.
- **`export const maxDuration = 60` (architect R4)** — scrape + LLM can exceed Vercel's 10s default. content-lab uses 120, crons 300; 60 is enough here. Confirm the Vercel plan allows it.
- **Graceful degradation (architect S3):** autofill is an enhancement, not a gate. On timeout/low-confidence/error, return a partial or empty draft — the form is fully usable typed by hand. Build the manual form first, wire autofill last.
- Out: `{ draft, confidence, sourceUrl }`. Treat scraped page + LLM output as UNTRUSTED (validate against schema; never execute embedded instructions). Rate-limited by IP-hash.

### `POST /api/submit`
- In: the form payload + optional `email`, `works_here`, honeypot field.
- Steps: honeypot check → zod-validate → `enrich()` → `validate()` → `dedupe()` → `spam-score` (heuristic + optional LLM relevance) → upsert `submissions` row (idempotent on `slug,ip_hash`).
- **No zero-human auto-merge in P0 (architect R1).** Anonymous web submissions are a trust vector for a public, agent-consumed registry. So in P0 **every web submission requires a 1-click `/admin` human approve before the bot opens a PR** — there is no fully-automatic anonymous → merged path. The spam-score/dup/URL-reachable signals only **rank** the `/admin` queue (clean = top, fast 1-click; suspicious = flagged). Full auto-approve for trusted/claimed submitters is a P1 follow-up once reputation/claim exists. (Trusted developer GitHub PRs keep today's CI auto-merge — unchanged.)
- Out: `{ id, status:'pending', statusUrl }`. If `email` present, send magic-link ("track your submission").
- Pattern: copy `api/events/route.ts` (service-role client, IP-hash, CORS). **Honeypot is NET-NEW** (architect F4 — events/votes do NOT have one; add a hidden field + reject on fill).

### `GET /api/submit/status/[id]`
- Returns `{ status, pr_url, live_url }` for the success/status page.

### `POST /api/admin/approve`  (+ `/reject`)
- Auth: `ADMIN_SECRET`. ⚠️ Architect F5: `ADMIN_SECRET` exists in env but is **not currently used to auth any route** — build the check net-new (header/cookie compare; do not assume a helper exists).
- Body `{ id }`. On approve → bot PR; set `status='approved'` + `pr_url`. The `/admin` UI lists ranked `pending` rows with the rendered YAML.
- **Duplicate case (architect M3):** when `dup_of != null`, the admin row must show **existing listing vs submission side-by-side** with "update existing / reject" (not just approve/reject), since the submitter is editing a program that already exists.

### GitHub App "bot" (the only DB→Git writer)
- Octokit with an **App installation token** (server-side, not a user). On admin approve: `toYaml(payload)` → branch `submit/{slug}` → commit `programs/{slug}.yaml` → open PR (stamped `submitted_by`, source `web-form`). The **existing** `pr-programs.yml` then validates/verifies/(auto-)merges/rebuilds `registry.json`.
- Secrets: `GH_APP_ID`, `GH_APP_PRIVATE_KEY`, `GH_APP_INSTALLATION_ID` (Vercel env). Rate-limit aware; on token/rate failure, leave row `approved` and alert (M5) — do not silently drop.

### `POST /api/webhooks/github` — closes the state machine (architect R2/R5 — the biggest gap)
The flow from `approved` → `published` was hand-waved; spec it explicitly. Subscribe the GitHub App to `pull_request` + `check_suite` events (HMAC `GH_WEBHOOK_SECRET`), match the PR by `pr_url`/branch, and:
- PR **merged** → `submissions.status='published'`, set `live_url`.
- CI **URL-verify fails** (`pr-programs.yml` won't auto-merge — `:250`) → `status='pending'` + flag for re-review + notify admin (no zombie "approved" forever).
- PR **closed unmerged** → `status='rejected'`.
`GET /api/submit/status/[id]` reads this so the success page reflects reality. (Polling cron is an acceptable fallback if a webhook endpoint is undesirable.)

> **Vercel rebuild note (architect R6):** after merge, Vercel's `prebuild` reruns `build-registry.ts` → `registry.json` on `main` (1–3 min). The CI Step 9 also commits `registry.json` on the PR branch pre-merge — harmless but redundant with the post-merge rebuild; "live in minutes" is accurate but tight. Don't promise "instant."

## 7. Frontend — rebuilt `/submit` (`src/app/submit/page.tsx`)

Implements the approved mockup (`docs/mockups/submit-final.html`). Built from existing shadcn/ui primitives + the dark tokens in `globals.css`.

- **States:** `hero` (giant URL input + "Auto-fill with AI") → `form` (revealed, prefilled) → `success`.
- **Hero:** URL field → calls `/api/autofill` (shimmer ~1.5–2s) → reveal form prefilled with a green "we pre-filled this" notice.
- **Form (6 required, plain language):** Program name · Website · Category (select from `lib/programs` categories) · One-line pitch (≤120) · **Commission type pills** (% of every renewal / % of first sale / Fixed $ per sale) + amount · **Cookie pills** (7/30/60/90/Lifetime/Custom). "Add more details (optional)" discloses payout method, signup URL, restrictions. **No YAML/slug/GitHub.**
- **Live preview** (right, sticky; collapses on mobile): renders the directory card as user types — "This is what affiliates and AI agents will see."
- **Identity:** email (magic-link, "No password needed") + "I work at this company" → `works_here` (Verified badge later).
- **Submit → success:** "Submitted! Usually live in minutes." + "what happens next" (review → live → claim & verify via Stripe) + status link.
- **Dev escape-hatch:** subtle "Developer? List via GitHub →" (header chip + footer only) → `github.com/Affitor/open-affiliate` contributor guide.
- Remove from old page: `generateYaml`, `openGitHubPR` (`window.open` to GitHub), GitHub-username field, raw YAML preview. Also fix `src/app/docs/submit/page.tsx` + `AGENTS.md` false "no GitHub / agent opens PR" copy.

## 8. Moderation, spam, quality

- Honeypot + IP-hash rate-limit on `/api/autofill` and `/api/submit` (existing pattern).
- `spam_score` = cheap heuristics (URL reachable, dup, gibberish, banned terms) + optional LLM relevance ("is this a real affiliate program?").
- In P0 **a human approves every web submission** at `/admin` (1-click for clean ones); signals only rank the queue. Nothing anonymous reaches public Git without a human click. Quarantine lives in `submissions` (not Git). (Trusted auto-approve is P1, gated on claim/reputation.)
- Trust tiers unchanged: web submissions land `verified:false`; Verified is earned via claim (P1) / Stripe (Affitor). Bulk stays gated (P2).

## 9. Build/CI integration (must not disturb YAML → registry.json)

- `build-registry.ts` + `registry.json` pipeline: **untouched**.
- `pr-programs.yml`: only change = point the enrich step at `scripts/lib/enrich.ts` (real, replacing the `|| true` no-op). Add a `count > N` auto-merge guard (prep for P2 bulk).
- New env (Vercel): `GH_APP_ID/PRIVATE_KEY/INSTALLATION_ID`, LLM key (already present), reuse `SUPABASE_SERVICE_ROLE_KEY` + `ADMIN_SECRET`.
- Schema: no breaking change in P0 (additive `powered_by` etc. deferred to demand SDD).

## 10. Security
- GitHub App token is server-only; never shipped to client. Form posts only data.
- Treat scraped page + LLM output as UNTRUSTED (validate against schema; never execute embedded instructions).
- Magic-link tokens: short TTL, single-use, signed.
- `/admin` behind `ADMIN_SECRET`; bot PRs are public + auditable.

## 11. Acceptance criteria
1. A non-technical user lists a program **without ever seeing GitHub/YAML** and it goes live (clean case) within minutes.
2. `/api/autofill` prefills ≥4 of 6 fields for a typical SaaS affiliates page.
3. Spam/dup submissions never reach public Git (quarantined in `submissions`).
4. Approved submission produces a valid `programs/{slug}.yaml` that passes the existing CI (schema + URL verify) and rebuilds `registry.json`.
5. Developer GitHub path still works; `/submit` no longer dead-ends on GitHub.
6. `enrich.ts` is used by both CI and `/api/submit` (no divergence).

## 12. Phasing within P0 (build order)
1. `scripts/lib/enrich.ts` **incl. `enrichment-result.json` writer + ajv validate** (+ wire into `pr-programs.yml`). ← keystone, unblocks everything.
2. `007_submissions.sql` (unique-slug-while-open) + `POST /api/submit` (idempotent, honeypot) + `GET /status` (copy events route).
3. GitHub App bot (`lib/github-bot.ts`) + `/api/admin/approve|reject` + thin ranked `/admin` (with dup side-by-side) + `ADMIN_SECRET` auth (net-new).
4. **`/api/webhooks/github`** — close the state machine (merged→published, CI-fail→pending, closed→rejected). *Do not skip — this is what makes the status page truthful.*
5. Rebuild `/submit` page (the mockup) **manual form first**, fix docs/AGENTS copy.
6. `POST /api/autofill` (last; degrades gracefully) — wire into the form's hero.
7. E2E test: form → submit → `/admin` 1-click approve → bot PR → CI merge → webhook → published/live; spam → quarantine; dup → side-by-side; CI URL-verify fail → back to pending + alert.

## 13. Open questions (owner)
- Auto-approve threshold `T` + which signals are hard-gates vs soft.
- Magic-link now, or defer email entirely to P1 and accept anonymous submissions in P0? (Recommend: email optional in P0, required to *edit/claim* in P1.)
- LLM provider/key for autofill (reuse repo's OpenAI key vs Kyma).
- `/admin` surface: standalone page vs CLI command for v1.

## 13b. Deferred to P1 (called out so P0 scope is honest)
- **Edit / withdraw a submission** (architect M1): P0 ships read-only `GET /status`; `PATCH`/`DELETE` via magic-link are P1.
- **Observability** (architect M5): log submission lifecycle to the project's existing **PostHog**, and alert on bot-PR/token/rate failures. Strongly recommended even in P0 — at minimum console + a failure flag — so `approved`-but-no-PR rows are visible.

## 14. File-by-file
- NEW `scripts/lib/enrich.ts` (+ writes `enrichment-result.json`, exports ajv `validate`) · `supabase/migrations/007_submissions.sql` · `src/app/api/submit/route.ts` · `src/app/api/submit/status/[id]/route.ts` · `src/app/api/autofill/route.ts` (`maxDuration=60`) · `src/app/api/admin/approve/route.ts` (+ `/reject`) · `src/app/api/webhooks/github/route.ts` · `src/app/admin/page.tsx` · `src/lib/github-bot.ts` (Octokit App).
- EDIT `src/app/submit/page.tsx` (full rebuild → the mockup) · `.github/workflows/pr-programs.yml` (point enrich at `scripts/lib/enrich.ts`; add `count > N` auto-merge guard) · `scripts/build-registry.ts` (reuse the ajv `validate` from `enrich.ts`) · `src/app/docs/submit/page.tsx` + `AGENTS.md` (fix false "no GitHub / agent opens PR" claims).
- REUSE `schema/program.schema.json` · `scripts/verify-programs.ts` · `src/app/api/events/route.ts` (service-role + IP-hash pattern — note: NO honeypot there, add it).
