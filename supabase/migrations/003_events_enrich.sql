-- Enrich events with geo, device, path, session tracking
ALTER TABLE events ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS device text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS path text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS session_id text;

CREATE INDEX IF NOT EXISTS idx_events_country ON events(country);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_path ON events(path);
