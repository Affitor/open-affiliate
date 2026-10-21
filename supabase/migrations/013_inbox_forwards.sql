-- Inbound mail forwarding: one row per received email, so a forward is sent
-- at most once however often Resend retries or replays the webhook.
-- Code: src/lib/inbound-email.ts. Apply once, by hand, after review.
--
-- Service role only, same model as 009/011: RLS on, no policies, table
-- grants revoked from anon/authenticated. No addresses, subjects or bodies:
-- only Resend's email id, a state, a SHA-256 of the payload we POSTed, and
-- timestamps.
--
-- status:
--   pending       no POST yet, or the first POST was refused with an HTTP
--                 error (nothing was sent); may be sent at any age
--   uncertain     a POST was made and its outcome is unknown; retried only
--                 with the same Idempotency-Key and payload while
--                 first_post_at is under 23 h old (Resend keeps keys 24 h)
--   sent          Resend answered 2xx; never sent again
--   needs_review  uncertain for 23 h, or a retry would change the payload;
--                 never re-POSTed blindly, a person checks the Resend dashboard
-- lease_until: whoever moved it into the future holds the row and is the
-- only one allowed to POST; a crashed holder's lease simply runs out.

CREATE TABLE IF NOT EXISTS oa_inbox_forwards (
  email_id text PRIMARY KEY CHECK (email_id ~ '^[A-Za-z0-9-]{1,100}$'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'uncertain', 'sent', 'needs_review')),
  payload_hash text,
  first_post_at timestamptz,
  lease_until timestamptz NOT NULL DEFAULT 'epoch',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'uncertain' OR (first_post_at IS NOT NULL AND payload_hash IS NOT NULL))
);

ALTER TABLE oa_inbox_forwards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON oa_inbox_forwards FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON oa_inbox_forwards TO service_role;
