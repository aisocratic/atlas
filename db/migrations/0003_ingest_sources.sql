ALTER TABLE web_vitals ADD COLUMN source_origin text NOT NULL DEFAULT '';
ALTER TABLE page_views ADD COLUMN source_origin text NOT NULL DEFAULT '';
ALTER TABLE error_logs ADD COLUMN source_origin text NOT NULL DEFAULT '';
ALTER TABLE anomalies ADD COLUMN source_origin text NOT NULL DEFAULT '';
ALTER TABLE web_vitals DROP CONSTRAINT web_vitals_event_key_key;
ALTER TABLE page_views DROP CONSTRAINT page_views_event_key_key;
ALTER TABLE error_logs DROP CONSTRAINT error_logs_event_key_key;
ALTER TABLE web_vitals ADD UNIQUE (source_origin, event_key);
ALTER TABLE page_views ADD UNIQUE (source_origin, event_key);
ALTER TABLE error_logs ADD UNIQUE (source_origin, event_key);
CREATE INDEX web_vitals_source_time ON web_vitals (source_origin, measured_at DESC);
CREATE INDEX page_views_source_time ON page_views (source_origin, occurred_at DESC);
CREATE INDEX error_logs_source_time ON error_logs (source_origin, occurred_at DESC);
CREATE INDEX anomalies_source_time ON anomalies (source_origin, detected_at DESC);
CREATE TABLE ingest_rate_buckets (
  scope_key text NOT NULL,
  minute timestamptz NOT NULL,
  requests integer NOT NULL CHECK (requests > 0),
  PRIMARY KEY (scope_key, minute)
);
CREATE TABLE ingest_versions (
  card_id text NOT NULL,
  source_origin text NOT NULL,
  revision bigint NOT NULL DEFAULT 1,
  PRIMARY KEY (card_id, source_origin)
);
