-- Owner edits (claim flow): the daily quota check, the claim_edits insert and
-- the terms.submitted event happen in one transaction under a lock on the
-- claim row. Before this, the API counted and then inserted in separate
-- requests, so parallel submissions at count 9 could all pass a quota of 10.
-- Called by src/lib/claims/live.ts submitEdit() as an RPC. Apply after 009.
--
-- Returns 'ok', 'quota' (limit reached in the last 24 hours) or 'not_owner'
-- (claim missing, released or revoked since the session was checked).
-- VOLATILE plpgsql under READ COMMITTED: each statement takes a fresh
-- snapshot, so the count after FOR UPDATE sees every edit committed by the
-- transaction that held the lock before.

CREATE OR REPLACE FUNCTION public.claim_submit_edit(
  p_claim_id uuid,
  p_slug text,
  p_fields jsonb,
  p_daily_limit int
) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_domain text;
BEGIN
  SELECT domain INTO v_domain
    FROM program_claims
    WHERE id = p_claim_id AND status = 'active' AND verified_at IS NOT NULL
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_owner';
  END IF;

  IF (SELECT count(*) FROM claim_edits
      WHERE claim_id = p_claim_id AND created_at > now() - interval '24 hours') >= p_daily_limit THEN
    RETURN 'quota';
  END IF;

  INSERT INTO claim_edits (claim_id, slug, fields) VALUES (p_claim_id, p_slug, p_fields);
  INSERT INTO claim_events (type, claim_id, slug, domain) VALUES ('terms.submitted', p_claim_id, p_slug, v_domain);
  RETURN 'ok';
END
$fn$;

-- Functions are executable by PUBLIC by default, and PostgREST exposes every
-- function in public as /rpc/<name>. Only the API's service role may call it.
REVOKE ALL ON FUNCTION public.claim_submit_edit(uuid, text, jsonb, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_submit_edit(uuid, text, jsonb, int) TO service_role;

-- PostgREST caches the schema; make the new RPC visible without a restart.
NOTIFY pgrst, 'reload schema';
