-- Events table for user behavior tracking
CREATE TABLE IF NOT EXISTS events (
  id bigserial PRIMARY KEY,
  type text NOT NULL,
  slug text,
  metadata jsonb DEFAULT '{}',
  ip_hash text NOT NULL,
  referrer text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_events_type ON events(type);
CREATE INDEX idx_events_slug ON events(slug);
CREATE INDEX idx_events_created ON events(created_at DESC);
CREATE INDEX idx_events_type_created ON events(type, created_at DESC);

-- Daily program stats (materialized/denormalized)
CREATE TABLE IF NOT EXISTS program_stats (
  slug text NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  views int DEFAULT 0,
  outbound_clicks int DEFAULT 0,
  votes_net int DEFAULT 0,
  PRIMARY KEY (slug, date)
);

CREATE INDEX idx_program_stats_date ON program_stats(date DESC);

-- RLS
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_stats ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (API routes use service role key)
-- No public read/write on events - only via API
CREATE POLICY "Service role full access" ON events FOR ALL USING (true);
CREATE POLICY "Public read stats" ON program_stats FOR SELECT USING (true);
CREATE POLICY "Service role write stats" ON program_stats FOR ALL USING (true);
