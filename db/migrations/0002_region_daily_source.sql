-- Scope daily aggregates to their canonical source URL. The empty default
-- preserves legacy callers; current collectors always provide the full URL.
ALTER TABLE region_latency_daily ADD COLUMN page_url text NOT NULL DEFAULT '';
ALTER TABLE region_latency_daily DROP CONSTRAINT region_latency_daily_pkey;
ALTER TABLE region_latency_daily ADD PRIMARY KEY (page_url, day, region_key, page_path);
