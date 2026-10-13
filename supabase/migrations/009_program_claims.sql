-- Claim flow v1: a brand proves it runs a listing's domain, then suggests
-- edits that a person reviews before any YAML changes.
-- Code: src/lib/claims/. Apply once, by hand, after review.
--
-- Service role only. RLS is on with no policies, so anon and authenticated
-- see nothing and service_role (the API routes) bypasses RLS. The REVOKEs also
-- drop the table grants Supabase gives anon/authenticated in the public
-- schema, so a policy added here by mistake later still exposes nothing.
--
-- Emails are stored only where a person needs them (program_claims.email,
-- cleared on release). Codes and DNS tokens are stored as HMACs; IPs and
-- emails in claim_events only as HMACs.

CREATE TABLE IF NOT EXISTS program_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  -- registrable domain (eTLD+1) of the program url
  domain text NOT NULL,
  email text,
  method text NOT NULL CHECK (method IN ('email', 'dns', 'manual')),
  ip_hash text NOT NULL,
  -- HMAC of the 6-digit code (email) or of the TXT token (dns); null for manual
  code_hash text,
  attempts int NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'released', 'revoked', 'review')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One owner per domain. A second verification for the same domain fails here
-- even if two land at once.
CREATE UNIQUE INDEX IF NOT EXISTS program_claims_one_owner_per_domain
  ON program_claims (domain) WHERE status = 'active';
-- The 30-day prune of unverified claims.
CREATE INDEX IF NOT EXISTS program_claims_unverified_created
  ON program_claims (created_at) WHERE verified_at IS NULL;

CREATE TABLE IF NOT EXISTS claim_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES program_claims (id) ON DELETE CASCADE,
  slug text NOT NULL,
  fields jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'applied', 'rejected', 'asked')),
  pr_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS claim_edits_status_created ON claim_edits (status, created_at);

-- Audit log and rate-limit counters. No foreign key: events outlive pruned claims.
CREATE TABLE IF NOT EXISTS claim_events (
  id bigserial PRIMARY KEY,
  type text NOT NULL,
  claim_id uuid,
  slug text,
  domain text,
  email_hash text,
  ip_hash text,
  meta jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS claim_events_type_created ON claim_events (type, created_at DESC);
CREATE INDEX IF NOT EXISTS claim_events_ip_created ON claim_events (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS claim_events_email_created ON claim_events (email_hash, created_at DESC);

ALTER TABLE program_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_edits ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON program_claims, claim_edits, claim_events FROM anon, authenticated;
REVOKE ALL ON SEQUENCE claim_events_id_seq FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON program_claims, claim_edits, claim_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE claim_events_id_seq TO service_role;

-- Retention promised on /privacy: unverified claims (manual requests
-- included) within 30 days, events within 12 months. The job runs daily with
-- cutoffs one day short (29 / 364 days), so every row is gone by day 30 /
-- day 365. Same cutoffs as RETENTION_DAYS in src/lib/claims/service.ts, whose
-- prune() also runs on claim requests. Scheduled only where pg_cron is
-- enabled; elsewhere a NOTICE says so and the migration still applies.
-- cron.schedule() with a job name replaces an existing job of that name, so
-- re-running this file is safe.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'oa-claims-retention',
      '17 3 * * *',
      $job$
        DELETE FROM public.program_claims WHERE verified_at IS NULL AND created_at < now() - interval '29 days';
        DELETE FROM public.claim_events WHERE created_at < now() - interval '364 days';
      $job$
    );
  ELSE
    RAISE NOTICE 'pg_cron is not enabled: oa-claims-retention was not scheduled. Enable pg_cron and re-run this migration.';
  END IF;
END
$do$;
