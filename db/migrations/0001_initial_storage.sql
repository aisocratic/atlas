-- Atlas domain storage. This migration runs within the configured private schema.
-- Derived from AI Socratic's dashboard and telemetry schemas; no auth-provider FK
-- couples a self-hosted Atlas deployment to the source website's users table.
CREATE TABLE dashboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_key text NOT NULL CHECK (length(owner_key) BETWEEN 1 AND 200),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX dashboards_owner_name ON dashboards (owner_key, lower(name));
CREATE INDEX dashboards_owner_position ON dashboards (owner_key, position, created_at);
CREATE TABLE dashboard_layouts (
  dashboard_id uuid PRIMARY KEY REFERENCES dashboards(id) ON DELETE CASCADE,
  layout jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(layout) = 'object'),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE dataset_cache (
  cache_key text PRIMARY KEY,
  card_id text NOT NULL,
  payload jsonb NOT NULL,
  stored_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > stored_at)
);
CREATE INDEX dataset_cache_expiry ON dataset_cache (expires_at);
CREATE INDEX dataset_cache_card ON dataset_cache (card_id);
CREATE TABLE collector_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collector_id text NOT NULL,
  target_key text NOT NULL DEFAULT 'default',
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed')),
  lease_token uuid NOT NULL DEFAULT gen_random_uuid(),
  lease_expires_at timestamptz NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  rows_written integer NOT NULL DEFAULT 0 CHECK (rows_written >= 0),
  error text,
  metadata jsonb NOT NULL DEFAULT '{}',
  CHECK ((status = 'running' AND finished_at IS NULL) OR (status <> 'running' AND finished_at IS NOT NULL))
);
CREATE UNIQUE INDEX collector_runs_one_active ON collector_runs (collector_id, target_key) WHERE status = 'running';
CREATE INDEX collector_runs_freshness ON collector_runs (collector_id, started_at DESC);
CREATE TABLE lighthouse_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES collector_runs(id) ON DELETE SET NULL,
  measured_at timestamptz NOT NULL DEFAULT now(),
  page_path text NOT NULL,
  page_url text NOT NULL,
  strategy text NOT NULL CHECK (strategy IN ('mobile', 'desktop')),
  performance_score double precision CHECK (performance_score BETWEEN 0 AND 100),
  accessibility_score double precision CHECK (accessibility_score BETWEEN 0 AND 100),
  seo_score double precision CHECK (seo_score BETWEEN 0 AND 100),
  best_practices_score double precision CHECK (best_practices_score BETWEEN 0 AND 100),
  lcp_ms double precision CHECK (lcp_ms >= 0),
  cls double precision CHECK (cls >= 0),
  tbt_ms double precision CHECK (tbt_ms >= 0),
  fcp_ms double precision CHECK (fcp_ms >= 0),
  ttfb_ms double precision CHECK (ttfb_ms >= 0),
  total_byte_weight bigint CHECK (total_byte_weight >= 0),
  raw jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX lighthouse_reports_route_time ON lighthouse_reports (page_path, strategy, measured_at DESC);
CREATE TABLE web_vitals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text UNIQUE,
  measured_at timestamptz NOT NULL DEFAULT now(),
  page_path text NOT NULL,
  metric_name text NOT NULL CHECK (metric_name IN ('LCP', 'INP', 'CLS', 'FCP', 'TTFB')),
  metric_value double precision NOT NULL CHECK (metric_value >= 0),
  rating text CHECK (rating IN ('good', 'needs-improvement', 'poor')),
  navigation_type text,
  device_type text,
  session_key text
);
CREATE INDEX web_vitals_route_metric_time ON web_vitals (page_path, metric_name, measured_at DESC);
CREATE TABLE seo_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES collector_runs(id) ON DELETE SET NULL,
  measured_at timestamptz NOT NULL DEFAULT now(),
  page_path text NOT NULL,
  page_url text NOT NULL,
  status_code integer CHECK (status_code BETWEEN 100 AND 599),
  score double precision CHECK (score BETWEEN 0 AND 100),
  title text,
  description text,
  canonical_url text,
  has_og boolean,
  indexable boolean,
  checks jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX seo_audits_route_time ON seo_audits (page_path, measured_at DESC);
CREATE TABLE seo_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES seo_audits(id) ON DELETE CASCADE,
  rule_id text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  UNIQUE (audit_id, rule_id)
);
CREATE TABLE region_latency_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES collector_runs(id) ON DELETE SET NULL,
  measured_at timestamptz NOT NULL DEFAULT now(),
  provider text NOT NULL DEFAULT 'globalping',
  measurement_id text,
  region_key text NOT NULL,
  region_label text NOT NULL,
  probe_country text,
  probe_city text,
  page_path text NOT NULL,
  page_url text NOT NULL,
  status text NOT NULL CHECK (status IN ('ok', 'error')),
  status_code integer CHECK (status_code BETWEEN 100 AND 599),
  error text,
  dns_ms double precision CHECK (dns_ms >= 0),
  connect_ms double precision CHECK (connect_ms >= 0),
  tls_ms double precision CHECK (tls_ms >= 0),
  ttfb_ms double precision CHECK (ttfb_ms >= 0),
  load_ms double precision CHECK (load_ms >= 0),
  fcp_ms double precision CHECK (fcp_ms >= 0),
  lcp_ms double precision CHECK (lcp_ms >= 0)
);
CREATE INDEX region_latency_samples_route_time ON region_latency_samples (page_path, region_key, measured_at DESC);
CREATE TABLE region_latency_daily (
  day date NOT NULL,
  region_key text NOT NULL,
  page_path text NOT NULL,
  samples integer NOT NULL CHECK (samples > 0),
  ok_samples integer NOT NULL CHECK (ok_samples >= 0),
  error_samples integer NOT NULL CHECK (error_samples >= 0),
  ttfb_p50_ms double precision,
  ttfb_p95_ms double precision,
  load_p50_ms double precision,
  load_p95_ms double precision,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, region_key, page_path),
  CHECK (samples = ok_samples + error_samples)
);
CREATE TABLE repo_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES collector_runs(id) ON DELETE SET NULL,
  measured_at timestamptz NOT NULL DEFAULT now(),
  repository text NOT NULL,
  git_commit text,
  git_branch text,
  source_loc integer CHECK (source_loc >= 0),
  source_files integer CHECK (source_files >= 0),
  dependency_count integer CHECK (dependency_count >= 0),
  duplication_percentage double precision CHECK (duplication_percentage BETWEEN 0 AND 100),
  complexity_p95 double precision CHECK (complexity_p95 >= 0),
  lint_errors integer CHECK (lint_errors >= 0),
  type_errors integer CHECK (type_errors >= 0),
  test_failures integer CHECK (test_failures >= 0),
  metrics jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX repo_metrics_repo_time ON repo_metrics (repository, measured_at DESC);
CREATE TABLE dependency_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id uuid NOT NULL REFERENCES repo_metrics(id) ON DELETE CASCADE,
  package_name text NOT NULL,
  current_version text NOT NULL,
  latest_version text,
  dependency_type text NOT NULL CHECK (dependency_type IN ('runtime', 'development')),
  majors_behind integer CHECK (majors_behind >= 0),
  vulnerability_count integer NOT NULL DEFAULT 0 CHECK (vulnerability_count >= 0),
  UNIQUE (metric_id, package_name, dependency_type)
);
CREATE TABLE releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES collector_runs(id) ON DELETE SET NULL,
  repository text NOT NULL,
  provider_id text,
  tag text NOT NULL,
  title text,
  summary text,
  github_url text,
  published_at timestamptz NOT NULL,
  prerelease boolean NOT NULL DEFAULT false,
  target_sha text,
  collected_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (repository, tag)
);
CREATE INDEX releases_repo_time ON releases (repository, published_at DESC);
CREATE TABLE error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text UNIQUE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  level text NOT NULL CHECK (level IN ('error', 'warn')),
  message text NOT NULL,
  fingerprint text NOT NULL,
  error_name text,
  stack text,
  route text,
  method text,
  status_code integer CHECK (status_code BETWEEN 100 AND 599),
  metadata jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX error_logs_fingerprint_time ON error_logs (fingerprint, occurred_at DESC);
CREATE INDEX error_logs_time ON error_logs (occurred_at DESC);
CREATE TABLE page_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text UNIQUE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  path text NOT NULL,
  referrer text,
  device_type text,
  session_key text,
  is_bot boolean NOT NULL DEFAULT false
);
CREATE INDEX page_views_path_time ON page_views (path, occurred_at DESC);
CREATE TABLE ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES collector_runs(id) ON DELETE SET NULL,
  day date NOT NULL,
  tool text NOT NULL,
  model text NOT NULL DEFAULT 'unknown',
  source_key text NOT NULL DEFAULT 'local',
  opted_in boolean NOT NULL CHECK (opted_in = true),
  input_tokens bigint NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens bigint NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cache_read_tokens bigint NOT NULL DEFAULT 0 CHECK (cache_read_tokens >= 0),
  cache_creation_tokens bigint NOT NULL DEFAULT 0 CHECK (cache_creation_tokens >= 0),
  cost_usd numeric(14,6) CHECK (cost_usd >= 0),
  sessions integer NOT NULL DEFAULT 0 CHECK (sessions >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day, tool, model, source_key)
);
CREATE INDEX ai_usage_day ON ai_usage (day DESC);
CREATE TABLE anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_at timestamptz NOT NULL DEFAULT now(),
  card_id text NOT NULL,
  fingerprint text NOT NULL UNIQUE,
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
  title text NOT NULL,
  description text,
  baseline_value double precision,
  observed_value double precision,
  evidence jsonb NOT NULL DEFAULT '{}',
  resolved_at timestamptz
);
CREATE INDEX anomalies_card_time ON anomalies (card_id, detected_at DESC);
