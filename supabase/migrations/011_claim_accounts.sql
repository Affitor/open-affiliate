-- Claim v4: a verified domain becomes a brand account that its team signs in
-- to with an email code. Apply after 009 and 010, by hand, after review.
-- Code: src/lib/claims/. Spec: .internal/specs/2026-10-17-CLAIM-V4-SPEC.md §4.
--
-- Same access model as 009: RLS on, no policies, table grants revoked from
-- anon/authenticated, so only the API's service role reads or writes.

-- People who may sign in to an account (an active program_claims row). The
-- person who claimed is member 1. Addresses are cleared when a member is
-- removed or the claim is released.
CREATE TABLE IF NOT EXISTS claim_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES program_claims (id) ON DELETE CASCADE,
  email text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  added_by uuid REFERENCES claim_members (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  CHECK (status = 'removed' OR email IS NOT NULL)
);

-- An address belongs to at most one active team, so a sign-in code maps to
-- exactly one account.
CREATE UNIQUE INDEX IF NOT EXISTS claim_members_one_active_email
  ON claim_members (lower(email)) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS claim_members_active_by_claim
  ON claim_members (claim_id) WHERE status = 'active';

-- Sign-in codes. member_id is null when the address is on no team: the row
-- still exists so that answer and next step look the same either way.
CREATE TABLE IF NOT EXISTS claim_signin_codes (
  id uuid PRIMARY KEY,
  member_id uuid REFERENCES claim_members (id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  attempts int NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS claim_signin_codes_created ON claim_signin_codes (created_at);

-- PR-B2 queues new programs next to edits.
ALTER TABLE claim_edits
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'edit' CHECK (kind IN ('edit', 'new'));

-- Member 1 for claims confirmed before this migration. The member id is the
-- claim id, so a session cookie issued before this migration (it held the
-- claim id) still finds its member. Member addresses are stored lowercase
-- (live.ts looks them up that way).
INSERT INTO claim_members (id, claim_id, email)
SELECT c.id, c.id, lower(c.email)
FROM program_claims c
WHERE c.status = 'active'
  AND c.email IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM claim_members m WHERE m.claim_id = c.id)
ON CONFLICT DO NOTHING;

ALTER TABLE claim_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_signin_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON claim_members, claim_signin_codes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON claim_members, claim_signin_codes TO service_role;

-- Adds a member under a lock on the claim row, so two parallel adds cannot
-- both pass the team-size cap. Returns {"result": "ok", "id": <uuid>},
-- or {"result": "full" | "exists" | "not_owner"}. p_added_by is null for
-- member 1 (the person who claimed). Called by live.ts addMember().
CREATE OR REPLACE FUNCTION public.claim_add_member(
  p_claim_id uuid,
  p_email text,
  p_added_by uuid,
  p_max int
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id uuid;
BEGIN
  PERFORM 1 FROM program_claims
    WHERE id = p_claim_id AND status = 'active' AND verified_at IS NOT NULL
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'not_owner');
  END IF;

  IF p_added_by IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM claim_members WHERE id = p_added_by AND claim_id = p_claim_id AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('result', 'not_owner');
  END IF;

  IF (SELECT count(*) FROM claim_members WHERE claim_id = p_claim_id AND status = 'active') >= p_max THEN
    RETURN jsonb_build_object('result', 'full');
  END IF;

  BEGIN
    INSERT INTO claim_members (claim_id, email, added_by)
      VALUES (p_claim_id, p_email, p_added_by)
      RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('result', 'exists');
  END;
  RETURN jsonb_build_object('result', 'ok', 'id', v_id);
END
$fn$;

REVOKE ALL ON FUNCTION public.claim_add_member(uuid, text, uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_add_member(uuid, text, uuid, int) TO service_role;

-- Retention (/privacy): the 009 job plus sign-in codes after a day and
-- removed members (address already cleared) after 30 days. Same cutoffs as
-- prune() in src/lib/claims/live.ts. cron.schedule() with an existing job
-- name replaces that job, so this supersedes 009's schedule.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'oa-claims-retention',
      '17 3 * * *',
      $job$
        DELETE FROM public.program_claims WHERE verified_at IS NULL AND created_at < now() - interval '29 days';
        DELETE FROM public.claim_events WHERE created_at < now() - interval '364 days';
        DELETE FROM public.claim_signin_codes WHERE created_at < now() - interval '1 day';
        DELETE FROM public.claim_members WHERE status = 'removed' AND removed_at < now() - interval '29 days';
      $job$
    );
  ELSE
    RAISE NOTICE 'pg_cron is not enabled: oa-claims-retention was not rescheduled. Enable pg_cron and re-run this migration.';
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';
