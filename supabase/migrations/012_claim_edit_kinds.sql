-- Claim v4 PR-B2: owners edit every field of a listing and add new programs.
-- Apply after 011, by hand, after review. Code: src/lib/claims/service.ts
-- (submitEdit, submitProgram). Spec: .internal/specs/2026-10-17-CLAIM-V4-SPEC.md §5–§7.
--
-- claim_member_submit_edit gains three arguments:
--   p_domain     the registrable domain of the listing (or of the new
--                program's website) as the API computed it from the registry.
--                The function re-checks it against the locked claim, so a
--                listing on another domain can never be queued under this
--                account, even by a caller that skipped its own check.
--   p_kind       'edit' or 'new' (claim_edits.kind, added in 011).
--   p_new_limit  new programs per account per 24 hours, inside p_daily_limit.
-- Events follow the spec's names: edit.submitted, program.submitted.
-- A new program is refused ('already_sent') while one with the same slug or
-- the same page (fields->>'page_key', host + path as the API computed it)
-- waits for review, under the same lock, so parallel sends cannot both queue.
-- claim_edits.member_id records who sent each change (removed members are
-- deleted after 30 days, then it reads null).
--
-- claim_submit_edit (010) has had no caller since 011; it is dropped.

ALTER TABLE claim_edits
  ADD COLUMN IF NOT EXISTS member_id uuid REFERENCES claim_members (id) ON DELETE SET NULL;

DROP FUNCTION IF EXISTS public.claim_submit_edit(uuid, text, jsonb, int);
DROP FUNCTION IF EXISTS public.claim_member_submit_edit(uuid, text, jsonb, int);

-- Returns 'ok', 'quota', 'quota_new', 'already_sent' or 'not_owner'.
CREATE OR REPLACE FUNCTION public.claim_member_submit_edit(
  p_member_id uuid,
  p_slug text,
  p_domain text,
  p_kind text,
  p_fields jsonb,
  p_daily_limit int,
  p_new_limit int
) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_claim uuid;
  v_domain text;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('edit', 'new') THEN
    RAISE EXCEPTION 'claim_member_submit_edit: unknown kind' USING ERRCODE = '22023';
  END IF;
  -- A null limit would make every quota comparison null, so no quota at all.
  IF p_daily_limit IS NULL OR p_new_limit IS NULL THEN
    RAISE EXCEPTION 'claim_member_submit_edit: limits are required' USING ERRCODE = '22004';
  END IF;
  SELECT claim_id INTO v_claim FROM claim_members WHERE id = p_member_id;
  IF NOT FOUND THEN RETURN 'not_owner'; END IF;
  SELECT domain INTO v_domain FROM program_claims
    WHERE id = v_claim AND status = 'active' AND verified_at IS NOT NULL
    FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_owner'; END IF;
  IF v_domain IS DISTINCT FROM p_domain THEN RETURN 'not_owner'; END IF;
  IF NOT EXISTS (SELECT 1 FROM claim_members WHERE id = p_member_id AND status = 'active') THEN
    RETURN 'not_owner';
  END IF;
  IF p_kind = 'new' AND EXISTS (
    SELECT 1 FROM claim_edits
    WHERE claim_id = v_claim AND kind = 'new' AND status IN ('pending', 'asked')
      AND (slug = p_slug OR fields->>'page_key' = p_fields->>'page_key')
  ) THEN
    RETURN 'already_sent';
  END IF;
  IF (SELECT count(*) FROM claim_edits
      WHERE claim_id = v_claim AND created_at > now() - interval '24 hours') >= p_daily_limit THEN
    RETURN 'quota';
  END IF;
  IF p_kind = 'new' AND (SELECT count(*) FROM claim_edits
      WHERE claim_id = v_claim AND kind = 'new' AND created_at > now() - interval '24 hours') >= p_new_limit THEN
    RETURN 'quota_new';
  END IF;
  INSERT INTO claim_edits (claim_id, member_id, slug, kind, fields) VALUES (v_claim, p_member_id, p_slug, p_kind, p_fields);
  INSERT INTO claim_events (type, claim_id, slug, domain)
    VALUES (CASE p_kind WHEN 'new' THEN 'program.submitted' ELSE 'edit.submitted' END, v_claim, p_slug, v_domain);
  RETURN 'ok';
END
$fn$;

-- PostgREST exposes every function in public as /rpc/<name>. Only the API's
-- service role may call this one.
REVOKE ALL ON FUNCTION public.claim_member_submit_edit(uuid, text, text, text, jsonb, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_member_submit_edit(uuid, text, text, text, jsonb, int, int) TO service_role;

NOTIFY pgrst, 'reload schema';
