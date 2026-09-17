-- W37-849: Lock analytics RLS policies that were open to anon/authenticated.
--
-- Prior migrations named policies "Service role …" but omitted TO, so FOR ALL
-- USING (true) matched every role. service_role bypasses RLS natively — drop
-- those policies; keep only intentional public SELECT where already designed.

-- events: sensitive (ip_hash, session_id, referrer, metadata) — no public access
DROP POLICY IF EXISTS "Service role full access" ON events;

-- program_stats: aggregate counts only — public read stays
DROP POLICY IF EXISTS "Service role write stats" ON program_stats;

-- visitors: pseudo-identity cohort — no public access
DROP POLICY IF EXISTS "Service role full access visitors" ON visitors;

-- social_items: curated public catalog — public read stays, drop open writes
DROP POLICY IF EXISTS "Service write" ON social_items;
DROP POLICY IF EXISTS "Service update" ON social_items;
