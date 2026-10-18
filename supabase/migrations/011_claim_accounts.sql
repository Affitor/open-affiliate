-- Claim v4: a verified domain becomes a brand account that its team signs in
-- to with an email code. Apply after 009 and 010, by hand, after review.
-- Code: src/lib/claims/. Spec: .internal/specs/2026-10-17-CLAIM-V4-SPEC.md §4.
--
-- Same access model as 009: RLS on, no policies, table grants revoked from
-- anon/authenticated, so only the API's service role reads or writes.
--
-- Every change to who is on a team, and every claim state change made by a
-- member, runs in a function that locks the claim row and re-checks the
-- acting member inside the same transaction: two members removing each other
-- at once, or a member removed while their release is in flight, cannot
-- both win.

-- People who may sign in to an account (an active program_claims row). The
-- person who claimed is member 1. Addresses are stored lowercase and cleared
-- when a member is removed or the claim is released.
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

-- An address is on a team at most once. One address may be on several teams
-- (an agency running programs for several brands); sign-in then lets the
-- person choose. There is deliberately no cross-team uniqueness: it would
-- turn "add" and "claim" answers into a way to learn other teams' members.
CREATE UNIQUE INDEX IF NOT EXISTS claim_members_one_per_team
  ON claim_members (claim_id, lower(email)) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS claim_members_active_email
  ON claim_members (lower(email)) WHERE status = 'active';

-- Sign-in codes. Every request stores a row with member_id null and the hash
-- of a code nobody was given; after the response, the row is bound to a
-- member and a real code only if the address is on a team. Answer, timing and
-- next step are therefore the same for anyone.
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
-- claim id) still finds its member. Then the claim's own copy of the address
-- is cleared: from here on members hold the only copy.
INSERT INTO claim_members (id, claim_id, email)
SELECT c.id, c.id, lower(c.email)
FROM program_claims c
WHERE c.status = 'active'
  AND c.email IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM claim_members m WHERE m.claim_id = c.id);
UPDATE program_claims c SET email = NULL
WHERE c.status = 'active'
  AND c.email IS NOT NULL
  AND EXISTS (SELECT 1 FROM claim_members m WHERE m.claim_id = c.id AND m.status = 'active');

ALTER TABLE claim_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_signin_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON claim_members, claim_signin_codes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON claim_members, claim_signin_codes TO service_role;

-- Pending to active, exactly once, together with member 1 (the claim's
-- address) and clearing the claim's copy of it, all in one transaction.
-- {"result": "ok", "member_id": <uuid>} or {"result": "gone" | "conflict"}
-- ("conflict": the domain already has an active owner).
CREATE OR REPLACE FUNCTION public.claim_confirm(p_claim_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_email text;
  v_member uuid;
BEGIN
  SELECT lower(email) INTO v_email FROM program_claims
    WHERE id = p_claim_id AND status = 'pending' AND verified_at IS NULL AND expires_at > now()
      AND email IS NOT NULL
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'gone');
  END IF;
  BEGIN
    UPDATE program_claims SET status = 'active', verified_at = now(), email = NULL WHERE id = p_claim_id;
  EXCEPTION WHEN unique_violation THEN
    -- program_claims_one_owner_per_domain
    RETURN jsonb_build_object('result', 'conflict');
  END;
  INSERT INTO claim_members (claim_id, email) VALUES (p_claim_id, v_email) RETURNING id INTO v_member;
  RETURN jsonb_build_object('result', 'ok', 'member_id', v_member);
END
$fn$;

-- p_added_by adds an address to their team. {"result": "ok", "id": <uuid>}
-- or {"result": "full" | "exists" | "not_owner"}; "exists" means already on
-- this team.
CREATE OR REPLACE FUNCTION public.claim_add_member(
  p_claim_id uuid,
  p_email text,
  p_added_by uuid,
  p_max int
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public, pg_temp
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
  IF NOT EXISTS (
    SELECT 1 FROM claim_members WHERE id = p_added_by AND claim_id = p_claim_id AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('result', 'not_owner');
  END IF;
  IF (SELECT count(*) FROM claim_members WHERE claim_id = p_claim_id AND status = 'active') >= p_max THEN
    RETURN jsonb_build_object('result', 'full');
  END IF;
  BEGIN
    INSERT INTO claim_members (claim_id, email, added_by)
      VALUES (p_claim_id, lower(p_email), p_added_by)
      RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('result', 'exists');
  END;
  RETURN jsonb_build_object('result', 'ok', 'id', v_id);
END
$fn$;

-- p_actor removes p_target from the same team. Returns 'ok', 'not_owner'
-- (the actor is no longer an active member of an active claim), 'self' or
-- 'not_found'.
CREATE OR REPLACE FUNCTION public.claim_remove_member(p_claim_id uuid, p_actor uuid, p_target uuid) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public, pg_temp
AS $fn$
BEGIN
  PERFORM 1 FROM program_claims WHERE id = p_claim_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_owner'; END IF;
  IF NOT EXISTS (SELECT 1 FROM claim_members WHERE id = p_actor AND claim_id = p_claim_id AND status = 'active') THEN
    RETURN 'not_owner';
  END IF;
  IF p_actor = p_target THEN RETURN 'self'; END IF;
  UPDATE claim_members SET status = 'removed', email = NULL, removed_at = now()
    WHERE id = p_target AND claim_id = p_claim_id AND status = 'active';
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  RETURN 'ok';
END
$fn$;

-- p_actor releases the account: the claim is released and every member is
-- removed with their address cleared. false when the actor is no longer an
-- active member of an active claim.
CREATE OR REPLACE FUNCTION public.claim_release(p_claim_id uuid, p_actor uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public, pg_temp
AS $fn$
BEGIN
  PERFORM 1 FROM program_claims WHERE id = p_claim_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM claim_members WHERE id = p_actor AND claim_id = p_claim_id AND status = 'active') THEN
    RETURN false;
  END IF;
  UPDATE program_claims SET status = 'released', email = NULL WHERE id = p_claim_id;
  UPDATE claim_members SET status = 'removed', email = NULL, removed_at = now()
    WHERE claim_id = p_claim_id AND status = 'active';
  RETURN true;
END
$fn$;

-- Migration 010's quota logic, with the acting member re-checked under the
-- same lock. Returns 'ok', 'quota' or 'not_owner'.
CREATE OR REPLACE FUNCTION public.claim_member_submit_edit(
  p_member_id uuid,
  p_slug text,
  p_fields jsonb,
  p_daily_limit int
) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_claim uuid;
  v_domain text;
BEGIN
  SELECT claim_id INTO v_claim FROM claim_members WHERE id = p_member_id;
  IF NOT FOUND THEN RETURN 'not_owner'; END IF;
  SELECT domain INTO v_domain FROM program_claims
    WHERE id = v_claim AND status = 'active' AND verified_at IS NOT NULL
    FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_owner'; END IF;
  IF NOT EXISTS (SELECT 1 FROM claim_members WHERE id = p_member_id AND status = 'active') THEN
    RETURN 'not_owner';
  END IF;
  IF (SELECT count(*) FROM claim_edits
      WHERE claim_id = v_claim AND created_at > now() - interval '24 hours') >= p_daily_limit THEN
    RETURN 'quota';
  END IF;
  INSERT INTO claim_edits (claim_id, slug, fields) VALUES (v_claim, p_slug, p_fields);
  INSERT INTO claim_events (type, claim_id, slug, domain) VALUES ('terms.submitted', v_claim, p_slug, v_domain);
  RETURN 'ok';
END
$fn$;

-- PostgREST exposes every function in public as /rpc/<name>. Only the API's
-- service role may call these.
REVOKE ALL ON FUNCTION public.claim_confirm(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_add_member(uuid, text, uuid, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_remove_member(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_release(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_member_submit_edit(uuid, text, jsonb, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_confirm(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_add_member(uuid, text, uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_remove_member(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_release(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_member_submit_edit(uuid, text, jsonb, int) TO service_role;

-- Retention (/privacy): the 009 job plus sign-in codes after a day and
-- removed members (address already cleared) after 30 days. The job runs
-- daily, so a row can outlive its cutoff by up to a day; /privacy says
-- sign-in codes are gone within two days. Same cutoffs as prune() in
-- src/lib/claims/live.ts. cron.schedule() with an existing job name replaces
-- that job, so this supersedes 009's schedule.
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
