-- Tracking insights: returning visitors, daily metrics, search gaps, comparison signal
-- Goal: surface "what users want vs what site offers" to seed product ideas.

-- 1. visitors: returning visitor cohort (ip_hash as pseudo-identity)
CREATE TABLE IF NOT EXISTS visitors (
  ip_hash text PRIMARY KEY,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen  timestamptz NOT NULL DEFAULT now(),
  session_count int NOT NULL DEFAULT 1,
  total_events int NOT NULL DEFAULT 1,
  countries text[] DEFAULT ARRAY[]::text[],
  devices text[] DEFAULT ARRAY[]::text[]
);

CREATE INDEX IF NOT EXISTS idx_visitors_last_seen ON visitors(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_visitors_session_count ON visitors(session_count DESC);

ALTER TABLE visitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access visitors" ON visitors FOR ALL USING (true);

-- 2. Trigger: auto-upsert visitors row whenever an event lands
CREATE OR REPLACE FUNCTION tg_update_visitor() RETURNS trigger AS $$
BEGIN
  IF NEW.ip_hash IS NULL THEN RETURN NEW; END IF;

  INSERT INTO visitors (ip_hash, first_seen, last_seen, session_count, total_events, countries, devices)
  VALUES (
    NEW.ip_hash,
    NEW.created_at,
    NEW.created_at,
    1,
    1,
    CASE WHEN NEW.country IS NOT NULL THEN ARRAY[NEW.country] ELSE ARRAY[]::text[] END,
    CASE WHEN NEW.device  IS NOT NULL THEN ARRAY[NEW.device]  ELSE ARRAY[]::text[] END
  )
  ON CONFLICT (ip_hash) DO UPDATE SET
    last_seen     = GREATEST(visitors.last_seen, NEW.created_at),
    total_events  = visitors.total_events + 1,
    session_count = (
      SELECT count(DISTINCT session_id)
      FROM events
      WHERE ip_hash = NEW.ip_hash AND session_id IS NOT NULL
    ),
    countries = (
      SELECT array_agg(DISTINCT c) FROM unnest(visitors.countries || COALESCE(NEW.country, '')) c WHERE c <> ''
    ),
    devices = (
      SELECT array_agg(DISTINCT d) FROM unnest(visitors.devices || COALESCE(NEW.device, '')) d WHERE d <> ''
    );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_events_update_visitor ON events;
CREATE TRIGGER trg_events_update_visitor
  AFTER INSERT ON events
  FOR EACH ROW
  EXECUTE FUNCTION tg_update_visitor();

-- 3. Backfill visitors from existing events
INSERT INTO visitors (ip_hash, first_seen, last_seen, session_count, total_events, countries, devices)
SELECT
  ip_hash,
  min(created_at),
  max(created_at),
  count(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL),
  count(*),
  COALESCE(array_agg(DISTINCT country) FILTER (WHERE country IS NOT NULL), ARRAY[]::text[]),
  COALESCE(array_agg(DISTINCT device)  FILTER (WHERE device  IS NOT NULL), ARRAY[]::text[])
FROM events
WHERE ip_hash IS NOT NULL
GROUP BY ip_hash
ON CONFLICT (ip_hash) DO NOTHING;

-- 4. daily_metrics: pre-aggregated daily KPIs (refresh nightly via cron)
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_metrics AS
SELECT
  date_trunc('day', created_at)::date AS day,
  count(*)                                                                     AS events,
  count(DISTINCT ip_hash)                                                      AS unique_visitors,
  count(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL)             AS sessions,
  count(*) FILTER (WHERE type = 'page_view')                                   AS pageviews,
  count(*) FILTER (WHERE type = 'program_view')                                AS program_views,
  count(*) FILTER (WHERE type = 'outbound_click')                              AS outbound_clicks,
  count(*) FILTER (WHERE type = 'search')                                      AS searches,
  count(*) FILTER (WHERE type = 'search'
                   AND (metadata->>'resultCount')::int = 0)                    AS zero_result_searches,
  count(*) FILTER (WHERE type = 'filter')                                      AS filter_uses,
  count(DISTINCT ip_hash) FILTER (WHERE country = 'US')                        AS us_visitors,
  count(DISTINCT ip_hash) FILTER (WHERE device  = 'mobile')                    AS mobile_visitors
FROM events
GROUP BY 1
ORDER BY 1 DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_metrics_day ON daily_metrics(day);

-- 5. top_search_gaps: queries with zero results = programs we should add
CREATE OR REPLACE VIEW top_search_gaps AS
SELECT
  lower(trim(metadata->>'query'))           AS query,
  count(*)                                  AS times_searched,
  count(DISTINCT ip_hash)                   AS unique_searchers,
  max(created_at)                           AS last_searched
FROM events
WHERE type = 'search'
  AND (metadata->>'resultCount')::int = 0
  AND metadata->>'query' IS NOT NULL
  AND length(trim(metadata->>'query')) > 1
GROUP BY 1
HAVING count(*) >= 2
ORDER BY times_searched DESC, last_searched DESC;

-- 6. comparison_sessions: sessions where user viewed 2+ different programs
-- Signals intent to compare → seeds /compare/A-vs-B SEO ideas
CREATE OR REPLACE VIEW comparison_sessions AS
SELECT
  session_id,
  ip_hash,
  count(DISTINCT slug)               AS programs_viewed,
  array_agg(DISTINCT slug ORDER BY slug) AS slugs,
  min(created_at)                    AS started_at,
  max(created_at)                    AS ended_at
FROM events
WHERE type = 'program_view'
  AND slug IS NOT NULL
  AND session_id IS NOT NULL
GROUP BY session_id, ip_hash
HAVING count(DISTINCT slug) >= 2;

CREATE OR REPLACE VIEW top_program_pairs AS
WITH pairs AS (
  SELECT
    LEAST(a.slug, b.slug)    AS slug_a,
    GREATEST(a.slug, b.slug) AS slug_b,
    a.session_id
  FROM events a
  JOIN events b
    ON a.session_id = b.session_id
   AND a.type = 'program_view'
   AND b.type = 'program_view'
   AND a.slug < b.slug
  WHERE a.session_id IS NOT NULL AND a.slug IS NOT NULL AND b.slug IS NOT NULL
)
SELECT
  slug_a,
  slug_b,
  count(DISTINCT session_id) AS co_view_sessions
FROM pairs
GROUP BY slug_a, slug_b
HAVING count(DISTINCT session_id) >= 2
ORDER BY co_view_sessions DESC;

-- 7. Refresh helper (call from a daily Vercel cron)
CREATE OR REPLACE FUNCTION refresh_daily_metrics() RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY daily_metrics;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
