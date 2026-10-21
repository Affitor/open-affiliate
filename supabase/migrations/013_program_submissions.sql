-- Program submissions: anyone (a person or an agent) submits a program by
-- URL and later reads its status. A row only joins a queue that a person
-- works through; nothing here writes YAML, fetches the URL or sends email.
-- Code: src/lib/submissions/. Apply once, by hand, after review.
--
-- Service role only, like the claim tables (009): RLS on with no policies,
-- table grants revoked from anon/authenticated. The public status read is the
-- API route, which selects fixed columns by id.
--
-- Every write goes through the two functions below, which take one advisory
-- lock first, so a submit and a status change never interleave: the caps are
-- counted and the row inserted as one step, and a request that is refused
-- writes nothing. They run with the caller's rights (service_role), like the
-- claim functions in 011/012.

CREATE TABLE IF NOT EXISTS program_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- registrable domain (eTLD+1) of program_url's WHATWG hostname
  domain text NOT NULL,
  program_url text NOT NULL,
  terms_url text,
  name text,
  -- optional; never returned by the API, cleared 30 days after a final status
  contact_email text,
  note text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'verifying', 'listed', 'rejected')),
  reason text
    CHECK (reason IN ('no_program', 'terms_not_published', 'not_brand_page', 'duplicate', 'out_of_scope', 'spam')),
  listed_slug text,
  source text NOT NULL CHECK (source IN ('web', 'api', 'mcp')),
  ip_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'rejected') = (reason IS NOT NULL)),
  CHECK ((status = 'listed') = (listed_slug IS NOT NULL))
);

-- One open submission per domain. The lock below already serialises inserts;
-- this is the backstop.
CREATE UNIQUE INDEX IF NOT EXISTS program_submissions_one_open_per_domain
  ON program_submissions (domain) WHERE status IN ('queued', 'verifying');
CREATE INDEX IF NOT EXISTS program_submissions_status_created ON program_submissions (status, created_at);
CREATE INDEX IF NOT EXISTS program_submissions_created ON program_submissions (created_at);

ALTER TABLE program_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON program_submissions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON program_submissions TO service_role;

-- Submit under the lock. Caps are counted over admitted requests only
-- (claim_events type 'submission.requested'), so a refused request leaves no
-- row behind. Returns {result: 'limited', window} | {result: 'new' |
-- 'duplicate', id, status, reason, listed_slug, created_at, updated_at, ip_hour}.
CREATE OR REPLACE FUNCTION public.submission_submit(
  p_domain text,
  p_program_url text,
  p_terms_url text,
  p_name text,
  p_contact text,
  p_note text,
  p_source text,
  p_ip_hash text,
  p_ip_hour int,
  p_ip_day int,
  p_domain_day int,
  p_site_requests_day int,
  p_site_new_day int,
  p_site_new_plain_day int
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_row program_submissions;
  v_ip_hour int;
  v_ip_day int;
  v_count int;
  v_new int;
  v_new_plain int;
  v_result text;
BEGIN
  PERFORM pg_advisory_xact_lock(7203013);

  -- Retention promised on /privacy, kept here too so it holds without pg_cron.
  UPDATE program_submissions SET contact_email = NULL
    WHERE contact_email IS NOT NULL AND status IN ('listed', 'rejected') AND updated_at < now() - interval '29 days';
  DELETE FROM program_submissions WHERE created_at < now() - interval '364 days';

  SELECT count(*) FILTER (WHERE created_at > now() - interval '1 hour'), count(*)
    INTO v_ip_hour, v_ip_day
    FROM claim_events
    WHERE type = 'submission.requested' AND ip_hash = p_ip_hash AND created_at > now() - interval '1 day';
  IF v_ip_hour >= p_ip_hour THEN RETURN jsonb_build_object('result', 'limited', 'window', 'ip_hour'); END IF;
  IF v_ip_day >= p_ip_day THEN RETURN jsonb_build_object('result', 'limited', 'window', 'ip_day'); END IF;

  SELECT count(*) INTO v_count FROM claim_events
    WHERE type = 'submission.requested' AND domain = p_domain AND created_at > now() - interval '1 day';
  IF v_count >= p_domain_day THEN RETURN jsonb_build_object('result', 'limited', 'window', 'domain_day'); END IF;

  SELECT count(*) INTO v_count FROM claim_events
    WHERE type = 'submission.requested' AND created_at > now() - interval '1 day';
  IF v_count >= p_site_requests_day THEN
    IF NOT EXISTS (SELECT 1 FROM claim_events WHERE type = 'cap.reached' AND meta->>'cap' = 'submissions' AND created_at > now() - interval '1 day') THEN
      INSERT INTO claim_events (type, meta) VALUES ('cap.reached', '{"cap": "submissions"}');
    END IF;
    RETURN jsonb_build_object('result', 'limited', 'window', 'site_day');
  END IF;

  SELECT * INTO v_row FROM program_submissions
    WHERE domain = p_domain AND status IN ('queued', 'verifying') LIMIT 1;
  IF FOUND THEN
    v_result := 'duplicate';
  ELSE
    -- source 'web' means Turnstile passed; every other source is the stricter class.
    SELECT count(*), count(*) FILTER (WHERE source <> 'web') INTO v_new, v_new_plain
      FROM program_submissions WHERE created_at > now() - interval '1 day';
    IF v_new >= p_site_new_day OR (p_source <> 'web' AND v_new_plain >= p_site_new_plain_day) THEN
      RETURN jsonb_build_object('result', 'limited', 'window', 'site_new');
    END IF;
    INSERT INTO program_submissions (domain, program_url, terms_url, name, contact_email, note, source, ip_hash)
      VALUES (p_domain, p_program_url, p_terms_url, p_name, p_contact, p_note, p_source, p_ip_hash)
      RETURNING * INTO v_row;
    v_result := 'new';
  END IF;

  INSERT INTO claim_events (type, domain, ip_hash, meta)
    VALUES ('submission.requested', p_domain, p_ip_hash, jsonb_build_object('source', p_source, 'outcome', v_result));

  RETURN jsonb_build_object(
    'result', v_result,
    'id', v_row.id,
    'status', v_row.status,
    'reason', v_row.reason,
    'listed_slug', v_row.listed_slug,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at,
    'ip_hour', v_ip_hour + 1
  );
END
$$;

-- The data lane's status change, under the same lock, conditional on the
-- status it expects. Returns true when the row moved.
CREATE OR REPLACE FUNCTION public.submission_set_status(
  p_id uuid,
  p_from text,
  p_to text,
  p_reason text,
  p_slug text
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_moved int;
BEGIN
  IF NOT ((p_from = 'queued' AND p_to IN ('verifying', 'listed', 'rejected'))
       OR (p_from = 'verifying' AND p_to IN ('queued', 'listed', 'rejected'))) THEN
    RAISE EXCEPTION 'transition not allowed' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(7203013);
  UPDATE program_submissions
    SET status = p_to,
        reason = CASE WHEN p_to = 'rejected' THEN p_reason END,
        listed_slug = CASE WHEN p_to = 'listed' THEN p_slug END,
        updated_at = now()
    WHERE id = p_id AND status = p_from;
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  RETURN v_moved = 1;
END
$$;

REVOKE ALL ON FUNCTION public.submission_submit(text, text, text, text, text, text, text, text, int, int, int, int, int, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submission_set_status(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submission_submit(text, text, text, text, text, text, text, text, int, int, int, int, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.submission_set_status(uuid, text, text, text, text) TO service_role;

-- Same retention as the function above, daily, where pg_cron is enabled.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'oa-submissions-retention',
      '27 3 * * *',
      $job$
        UPDATE public.program_submissions SET contact_email = NULL
          WHERE contact_email IS NOT NULL AND status IN ('listed', 'rejected') AND updated_at < now() - interval '29 days';
        DELETE FROM public.program_submissions WHERE created_at < now() - interval '364 days';
      $job$
    );
  ELSE
    RAISE NOTICE 'pg_cron is not enabled: oa-submissions-retention was not scheduled. Enable pg_cron and re-run this migration.';
  END IF;
END
$do$;
