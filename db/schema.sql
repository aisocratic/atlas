--
-- PostgreSQL database dump
--

-- Dumped from database version 14.17 (Homebrew)
-- Dumped by pg_dump version 14.17 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: atlas; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA atlas;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ai_usage; Type: TABLE; Schema: atlas; Owner: -
--

CREATE TABLE atlas.ai_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid,
    day date NOT NULL,
    tool text NOT NULL,
    model text DEFAULT 'unknown'::text NOT NULL,
    source_key text DEFAULT 'local'::text NOT NULL,
    opted_in boolean NOT NULL,
    input_tokens bigint DEFAULT 0 NOT NULL,
    output_tokens bigint DEFAULT 0 NOT NULL,
    cache_read_tokens bigint DEFAULT 0 NOT NULL,
    cache_creation_tokens bigint DEFAULT 0 NOT NULL,
    cost_usd numeric(14,6),
    sessions integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_usage_cache_creation_tokens_check CHECK ((cache_creation_tokens >= 0)),
    CONSTRAINT ai_usage_cache_read_tokens_check CHECK ((cache_read_tokens >= 0)),
    CONSTRAINT ai_usage_cost_usd_check CHECK ((cost_usd >= (0)::numeric)),
    CONSTRAINT ai_usage_input_tokens_check CHECK ((input_tokens >= 0)),
    CONSTRAINT ai_usage_opted_in_check CHECK ((opted_in = true)),
    CONSTRAINT ai_usage_output_tokens_check CHECK ((output_tokens >= 0)),
    CONSTRAINT ai_usage_sessions_check CHECK ((sessions >= 0))
);


--
-- Name: anomalies; Type: TABLE; Schema: atlas; Owner: -
--

CREATE TABLE atlas.anomalies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    detected_at timestamp with time zone DEFAULT now() NOT NULL,
    card_id text NOT NULL,
    fingerprint text NOT NULL,
    severity text NOT NULL,
    title text NOT NULL,
    description text,
    baseline_value double precision,
    observed_value double precision,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    resolved_at timestamp with time zone,
    source_origin text DEFAULT ''::text NOT NULL,
    CONSTRAINT anomalies_severity_check CHECK ((severity = ANY (ARRAY['info'::text, 'warning'::text, 'error'::text])))
);


--
-- Name: collector_runs; Type: TABLE; Schema: atlas; Owner: -
--

CREATE TABLE atlas.collector_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    collector_id text NOT NULL,
    target_key text DEFAULT 'default'::text NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    lease_token uuid DEFAULT gen_random_uuid() NOT NULL,
    lease_expires_at timestamp with time zone NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    rows_written integer DEFAULT 0 NOT NULL,
    error text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT collector_runs_check CHECK ((((status = 'running'::text) AND (finished_at IS NULL)) OR ((status <> 'running'::text) AND (finished_at IS NOT NULL)))),
    CONSTRAINT collector_runs_rows_written_check CHECK ((rows_written >= 0)),
    CONSTRAINT collector_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'succeeded'::text, 'failed'::text])))
);


--
-- Name: dashboard_layouts; Type: TABLE; Schema: atlas; Owner: -
--

CREATE TABLE atlas.dashboard_layouts (
    dashboard_id uuid NOT NULL,
    layout jsonb DEFAULT '{}'::jsonb NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dashboard_layouts_layout_check CHECK ((jsonb_typeof(layout) = 'object'::text)),
    CONSTRAINT dashboard_layouts_revision_check CHECK ((revision > 0))
);


--
-- Name: dashboards; Type: TABLE; Schema: atlas; Owner: -
--

CREATE TABLE atlas.dashboards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_key text NOT NULL,
    name text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dashboards_name_check CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 80))),
    CONSTRAINT dashboards_owner_key_check CHECK (((length(owner_key) >= 1) AND (length(owner_key) <= 200))),
    CONSTRAINT dashboards_position_check CHECK (("position" >= 0))
);


--
-- Name: dataset_cache; Type: TABLE; Schema: atlas; Owner: -
--

CREATE TABLE atlas.dataset_cache (
    cache_key text NOT NULL,
    card_id text NOT NULL,
    payload jsonb NOT NULL,
    stored_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT dataset_cache_check CHECK ((expires_at > stored_at))
);


--
-- Name: dependency_health; Type: TABLE; Schema: atlas; Owner: -
--

CREATE TABLE atlas.dependency_health (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    metric_id uuid NOT NULL,
    package_name text NOT NULL,
    current_version text NOT NULL,
    latest_version text,
    dependency_type text NOT NULL,
    majors_behind integer,
    vulnerability_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT dependency_health_dependency_type_check CHECK ((dependency_type = ANY (ARRAY['runtime'::text, 'development'::text]))),
    CONSTRAINT dependency_health_majors_behind_check CHECK ((majors_behind >= 0)),
    CONSTRAINT dependency_health_vulnerability_count_check CHECK ((vulnerability_count >= 0))
);


--
-- Name: error_logs; Type: TABLE; Schema: atlas; Owner: -
--

CREATE TABLE atlas.error_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_key text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    level text NOT NULL,
    message text NOT NULL,
    fingerprint text NOT NULL,
    error_name text,
    stack text,
    route text,
    method text,
    status_code integer,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    source_origin text DEFAULT ''::text NOT NULL,
    CONSTRAINT error_logs_level_check CHECK ((level = ANY (ARRAY['error'::text, 'warn'::text]))),
    CONSTRAINT error_logs_status_code_check CHECK (((status_code >= 100) AND (status_code <= 599)))
);


--
-- Name: ingest_rate_buckets; Type: TABLE; Schema: atlas; Owner: -
--

CREATE TABLE atlas.ingest_rate_buckets (
    scope_key text NOT NULL,
    minute timestamp with time zone NOT NULL,
    requests integer NOT NULL,
    CONSTRAINT ingest_rate_buckets_requests_check CHECK ((requests > 0))
);


--
-- Name: ingest_versions; Type: TABLE; Schema: atlas; Owner: -
--

CREATE TABLE atlas.ingest_versions (
    card_id text NOT NULL,
    source_origin text NOT NULL,
    revision bigint DEFAULT 1 NOT NULL
);


--
-- Name: lighthouse_reports; Type: TABLE; Schema: atlas; Owner: -
--

CREATE TABLE atlas.lighthouse_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid,
    measured_at timestamp with time zone DEFAULT now() NOT NULL,
    page_path text NOT NULL,
    page_url text NOT NULL,
    strategy text NOT NULL,
    performance_score double precision,
    accessibility_score double precision,
    seo_score double precision,
    best_practices_score double precision,
    lcp_ms double precision,
    cls double precision,
    tbt_ms double precision,
    fcp_ms double precision,
    ttfb_ms double precision,
    total_byte_weight bigint,
    raw jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT lighthouse_reports_accessibility_score_check CHECK (((accessibility_score >= (0)::double precision) AND (accessibility_score <= (100)::double precision))),
    CONSTRAINT lighthouse_reports_best_practices_score_check CHECK (((best_practices_score >= (0)::double precision) AND (best_practices_score <= (100)::double precision))),
    CONSTRAINT lighthouse_reports_cls_check CHECK ((cls >= (0)::double precision)),
    CONSTRAINT lighthouse_reports_fcp_ms_check CHECK ((fcp_ms >= (0)::double precision)),
    CONSTRAINT lighthouse_reports_lcp_ms_check CHECK ((lcp_ms >= (0)::double precision)),
    CONSTRAINT lighthouse_reports_performance_score_check CHECK (((performance_score >= (0)::double precision) AND (performance_score <= (100)::double precision))),
    CONSTRAINT lighthouse_reports_seo_score_check CHECK (((seo_score >= (0)::double precision) AND (seo_score <= (100)::double precision))),
    CONSTRAINT lighthouse_reports_strategy_check CHECK ((strategy = ANY (ARRAY['mobile'::text, 'desktop'::text]))),
    CONSTRAINT lighthouse_reports_tbt_ms_check CHECK ((tbt_ms >= (0)::double precision)),
    CONSTRAINT lighthouse_reports_total_byte_weight_check CHECK ((total_byte_weight >= 0)),
    CONSTRAINT lighthouse_reports_ttfb_ms_check CHECK ((ttfb_ms >= (0)::double precision))
);


--
-- Name: page_views; Type: TABLE; Schema: atlas; Owner: -
--

CREATE TABLE atlas.page_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_key text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    path text NOT NULL,
    referrer text,
    device_type text,
    session_key text,
    is_bot boolean DEFAULT false NOT NULL,
    source_origin text DEFAULT ''::text NOT NULL
);


--
-- Name: region_latency_daily; Type: TABLE; Schema: atlas; Owner: -
--

CREATE TABLE atlas.region_latency_daily (
    day date NOT NULL,
    region_key text NOT NULL,
    page_path text NOT NULL,
    samples integer NOT NULL,
    ok_samples integer NOT NULL,
    error_samples integer NOT NULL,
    ttfb_p50_ms double precision,
    ttfb_p95_ms double precision,
    load_p50_ms double precision,
    load_p95_ms double precision,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    page_url text DEFAULT ''::text NOT NULL,
    CONSTRAINT region_latency_daily_check CHECK ((samples = (ok_samples + error_samples))),
    CONSTRAINT region_latency_daily_error_samples_check CHECK ((error_samples >= 0)),
    CONSTRAINT region_latency_daily_ok_samples_check CHECK ((ok_samples >= 0)),
    CONSTRAINT region_latency_daily_samples_check CHECK ((samples > 0))
);


--
-- Name: region_latency_samples; Type: TABLE; Schema: atlas; Owner: -
--

CREATE TABLE atlas.region_latency_samples (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid,
    measured_at timestamp with time zone DEFAULT now() NOT NULL,
    provider text DEFAULT 'globalping'::text NOT NULL,
    measurement_id text,
    region_key text NOT NULL,
    region_label text NOT NULL,
    probe_country text,
    probe_city text,
    page_path text NOT NULL,
    page_url text NOT NULL,
    status text NOT NULL,
    status_code integer,
    error text,
    dns_ms double precision,
    connect_ms double precision,
    tls_ms double precision,
    ttfb_ms double precision,
    load_ms double precision,
    fcp_ms double precision,
    lcp_ms double precision,
    CONSTRAINT region_latency_samples_connect_ms_check CHECK ((connect_ms >= (0)::double precision)),
    CONSTRAINT region_latency_samples_dns_ms_check CHECK ((dns_ms >= (0)::double precision)),
    CONSTRAINT region_latency_samples_fcp_ms_check CHECK ((fcp_ms >= (0)::double precision)),
    CONSTRAINT region_latency_samples_lcp_ms_check CHECK ((lcp_ms >= (0)::double precision)),
    CONSTRAINT region_latency_samples_load_ms_check CHECK ((load_ms >= (0)::double precision)),
    CONSTRAINT region_latency_samples_status_check CHECK ((status = ANY (ARRAY['ok'::text, 'error'::text]))),
    CONSTRAINT region_latency_samples_status_code_check CHECK (((status_code >= 100) AND (status_code <= 599))),
    CONSTRAINT region_latency_samples_tls_ms_check CHECK ((tls_ms >= (0)::double precision)),
    CONSTRAINT region_latency_samples_ttfb_ms_check CHECK ((ttfb_ms >= (0)::double precision))
);


--
-- Name: releases; Type: TABLE; Schema: atlas; Owner: -
--

CREATE TABLE atlas.releases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid,
    repository text NOT NULL,
    provider_id text,
    tag text NOT NULL,
    title text,
    summary text,
    github_url text,
    published_at timestamp with time zone NOT NULL,
    prerelease boolean DEFAULT false NOT NULL,
    target_sha text,
    collected_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: repo_metrics; Type: TABLE; Schema: atlas; Owner: -
--

CREATE TABLE atlas.repo_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid,
    measured_at timestamp with time zone DEFAULT now() NOT NULL,
    repository text NOT NULL,
    git_commit text,
    git_branch text,
    source_loc integer,
    source_files integer,
    dependency_count integer,
    duplication_percentage double precision,
    complexity_p95 double precision,
    lint_errors integer,
    type_errors integer,
    test_failures integer,
    metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT repo_metrics_complexity_p95_check CHECK ((complexity_p95 >= (0)::double precision)),
    CONSTRAINT repo_metrics_dependency_count_check CHECK ((dependency_count >= 0)),
    CONSTRAINT repo_metrics_duplication_percentage_check CHECK (((duplication_percentage >= (0)::double precision) AND (duplication_percentage <= (100)::double precision))),
    CONSTRAINT repo_metrics_lint_errors_check CHECK ((lint_errors >= 0)),
    CONSTRAINT repo_metrics_source_files_check CHECK ((source_files >= 0)),
    CONSTRAINT repo_metrics_source_loc_check CHECK ((source_loc >= 0)),
    CONSTRAINT repo_metrics_test_failures_check CHECK ((test_failures >= 0)),
    CONSTRAINT repo_metrics_type_errors_check CHECK ((type_errors >= 0))
);


--
-- Name: schema_migrations; Type: TABLE; Schema: atlas; Owner: -
--

CREATE TABLE atlas.schema_migrations (
    filename text NOT NULL,
    checksum text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: seo_audits; Type: TABLE; Schema: atlas; Owner: -
--

CREATE TABLE atlas.seo_audits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid,
    measured_at timestamp with time zone DEFAULT now() NOT NULL,
    page_path text NOT NULL,
    page_url text NOT NULL,
    status_code integer,
    score double precision,
    title text,
    description text,
    canonical_url text,
    has_og boolean,
    indexable boolean,
    checks jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT seo_audits_score_check CHECK (((score >= (0)::double precision) AND (score <= (100)::double precision))),
    CONSTRAINT seo_audits_status_code_check CHECK (((status_code >= 100) AND (status_code <= 599)))
);


--
-- Name: seo_findings; Type: TABLE; Schema: atlas; Owner: -
--

CREATE TABLE atlas.seo_findings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    audit_id uuid NOT NULL,
    rule_id text NOT NULL,
    severity text NOT NULL,
    message text NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT seo_findings_severity_check CHECK ((severity = ANY (ARRAY['info'::text, 'warning'::text, 'error'::text])))
);


--
-- Name: web_vitals; Type: TABLE; Schema: atlas; Owner: -
--

CREATE TABLE atlas.web_vitals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_key text,
    measured_at timestamp with time zone DEFAULT now() NOT NULL,
    page_path text NOT NULL,
    metric_name text NOT NULL,
    metric_value double precision NOT NULL,
    rating text,
    navigation_type text,
    device_type text,
    session_key text,
    source_origin text DEFAULT ''::text NOT NULL,
    CONSTRAINT web_vitals_metric_name_check CHECK ((metric_name = ANY (ARRAY['LCP'::text, 'INP'::text, 'CLS'::text, 'FCP'::text, 'TTFB'::text]))),
    CONSTRAINT web_vitals_metric_value_check CHECK ((metric_value >= (0)::double precision)),
    CONSTRAINT web_vitals_rating_check CHECK ((rating = ANY (ARRAY['good'::text, 'needs-improvement'::text, 'poor'::text])))
);


--
-- Name: ai_usage ai_usage_day_tool_model_source_key_key; Type: CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.ai_usage
    ADD CONSTRAINT ai_usage_day_tool_model_source_key_key UNIQUE (day, tool, model, source_key);


--
-- Name: ai_usage ai_usage_pkey; Type: CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.ai_usage
    ADD CONSTRAINT ai_usage_pkey PRIMARY KEY (id);


--
-- Name: anomalies anomalies_fingerprint_key; Type: CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.anomalies
    ADD CONSTRAINT anomalies_fingerprint_key UNIQUE (fingerprint);


--
-- Name: anomalies anomalies_pkey; Type: CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.anomalies
    ADD CONSTRAINT anomalies_pkey PRIMARY KEY (id);


--
-- Name: collector_runs collector_runs_pkey; Type: CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.collector_runs
    ADD CONSTRAINT collector_runs_pkey PRIMARY KEY (id);


--
-- Name: dashboard_layouts dashboard_layouts_pkey; Type: CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.dashboard_layouts
    ADD CONSTRAINT dashboard_layouts_pkey PRIMARY KEY (dashboard_id);


--
-- Name: dashboards dashboards_pkey; Type: CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.dashboards
    ADD CONSTRAINT dashboards_pkey PRIMARY KEY (id);


--
-- Name: dataset_cache dataset_cache_pkey; Type: CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.dataset_cache
    ADD CONSTRAINT dataset_cache_pkey PRIMARY KEY (cache_key);


--
-- Name: dependency_health dependency_health_metric_id_package_name_dependency_type_key; Type: CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.dependency_health
    ADD CONSTRAINT dependency_health_metric_id_package_name_dependency_type_key UNIQUE (metric_id, package_name, dependency_type);


--
-- Name: dependency_health dependency_health_pkey; Type: CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.dependency_health
    ADD CONSTRAINT dependency_health_pkey PRIMARY KEY (id);


--
-- Name: error_logs error_logs_pkey; Type: CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.error_logs
    ADD CONSTRAINT error_logs_pkey PRIMARY KEY (id);


--
-- Name: error_logs error_logs_source_origin_event_key_key; Type: CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.error_logs
    ADD CONSTRAINT error_logs_source_origin_event_key_key UNIQUE (source_origin, event_key);


--
-- Name: ingest_rate_buckets ingest_rate_buckets_pkey; Type: CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.ingest_rate_buckets
    ADD CONSTRAINT ingest_rate_buckets_pkey PRIMARY KEY (scope_key, minute);


--
-- Name: ingest_versions ingest_versions_pkey; Type: CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.ingest_versions
    ADD CONSTRAINT ingest_versions_pkey PRIMARY KEY (card_id, source_origin);


--
-- Name: lighthouse_reports lighthouse_reports_pkey; Type: CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.lighthouse_reports
    ADD CONSTRAINT lighthouse_reports_pkey PRIMARY KEY (id);


--
-- Name: page_views page_views_pkey; Type: CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.page_views
    ADD CONSTRAINT page_views_pkey PRIMARY KEY (id);


--
-- Name: page_views page_views_source_origin_event_key_key; Type: CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.page_views
    ADD CONSTRAINT page_views_source_origin_event_key_key UNIQUE (source_origin, event_key);


--
-- Name: region_latency_daily region_latency_daily_pkey; Type: CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.region_latency_daily
    ADD CONSTRAINT region_latency_daily_pkey PRIMARY KEY (page_url, day, region_key, page_path);


--
-- Name: region_latency_samples region_latency_samples_pkey; Type: CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.region_latency_samples
    ADD CONSTRAINT region_latency_samples_pkey PRIMARY KEY (id);


--
-- Name: releases releases_pkey; Type: CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.releases
    ADD CONSTRAINT releases_pkey PRIMARY KEY (id);


--
-- Name: releases releases_repository_tag_key; Type: CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.releases
    ADD CONSTRAINT releases_repository_tag_key UNIQUE (repository, tag);


--
-- Name: repo_metrics repo_metrics_pkey; Type: CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.repo_metrics
    ADD CONSTRAINT repo_metrics_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (filename);


--
-- Name: seo_audits seo_audits_pkey; Type: CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.seo_audits
    ADD CONSTRAINT seo_audits_pkey PRIMARY KEY (id);


--
-- Name: seo_findings seo_findings_audit_id_rule_id_key; Type: CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.seo_findings
    ADD CONSTRAINT seo_findings_audit_id_rule_id_key UNIQUE (audit_id, rule_id);


--
-- Name: seo_findings seo_findings_pkey; Type: CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.seo_findings
    ADD CONSTRAINT seo_findings_pkey PRIMARY KEY (id);


--
-- Name: web_vitals web_vitals_pkey; Type: CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.web_vitals
    ADD CONSTRAINT web_vitals_pkey PRIMARY KEY (id);


--
-- Name: web_vitals web_vitals_source_origin_event_key_key; Type: CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.web_vitals
    ADD CONSTRAINT web_vitals_source_origin_event_key_key UNIQUE (source_origin, event_key);


--
-- Name: ai_usage_day; Type: INDEX; Schema: atlas; Owner: -
--

CREATE INDEX ai_usage_day ON atlas.ai_usage USING btree (day DESC);


--
-- Name: anomalies_card_time; Type: INDEX; Schema: atlas; Owner: -
--

CREATE INDEX anomalies_card_time ON atlas.anomalies USING btree (card_id, detected_at DESC);


--
-- Name: anomalies_source_time; Type: INDEX; Schema: atlas; Owner: -
--

CREATE INDEX anomalies_source_time ON atlas.anomalies USING btree (source_origin, detected_at DESC);


--
-- Name: collector_runs_freshness; Type: INDEX; Schema: atlas; Owner: -
--

CREATE INDEX collector_runs_freshness ON atlas.collector_runs USING btree (collector_id, started_at DESC);


--
-- Name: collector_runs_one_active; Type: INDEX; Schema: atlas; Owner: -
--

CREATE UNIQUE INDEX collector_runs_one_active ON atlas.collector_runs USING btree (collector_id, target_key) WHERE (status = 'running'::text);


--
-- Name: dashboards_owner_name; Type: INDEX; Schema: atlas; Owner: -
--

CREATE UNIQUE INDEX dashboards_owner_name ON atlas.dashboards USING btree (owner_key, lower(name));


--
-- Name: dashboards_owner_position; Type: INDEX; Schema: atlas; Owner: -
--

CREATE INDEX dashboards_owner_position ON atlas.dashboards USING btree (owner_key, "position", created_at);


--
-- Name: dataset_cache_card; Type: INDEX; Schema: atlas; Owner: -
--

CREATE INDEX dataset_cache_card ON atlas.dataset_cache USING btree (card_id);


--
-- Name: dataset_cache_expiry; Type: INDEX; Schema: atlas; Owner: -
--

CREATE INDEX dataset_cache_expiry ON atlas.dataset_cache USING btree (expires_at);


--
-- Name: error_logs_fingerprint_time; Type: INDEX; Schema: atlas; Owner: -
--

CREATE INDEX error_logs_fingerprint_time ON atlas.error_logs USING btree (fingerprint, occurred_at DESC);


--
-- Name: error_logs_source_time; Type: INDEX; Schema: atlas; Owner: -
--

CREATE INDEX error_logs_source_time ON atlas.error_logs USING btree (source_origin, occurred_at DESC);


--
-- Name: error_logs_time; Type: INDEX; Schema: atlas; Owner: -
--

CREATE INDEX error_logs_time ON atlas.error_logs USING btree (occurred_at DESC);


--
-- Name: lighthouse_reports_route_time; Type: INDEX; Schema: atlas; Owner: -
--

CREATE INDEX lighthouse_reports_route_time ON atlas.lighthouse_reports USING btree (page_path, strategy, measured_at DESC);


--
-- Name: page_views_path_time; Type: INDEX; Schema: atlas; Owner: -
--

CREATE INDEX page_views_path_time ON atlas.page_views USING btree (path, occurred_at DESC);


--
-- Name: page_views_source_time; Type: INDEX; Schema: atlas; Owner: -
--

CREATE INDEX page_views_source_time ON atlas.page_views USING btree (source_origin, occurred_at DESC);


--
-- Name: region_latency_samples_route_time; Type: INDEX; Schema: atlas; Owner: -
--

CREATE INDEX region_latency_samples_route_time ON atlas.region_latency_samples USING btree (page_path, region_key, measured_at DESC);


--
-- Name: releases_repo_time; Type: INDEX; Schema: atlas; Owner: -
--

CREATE INDEX releases_repo_time ON atlas.releases USING btree (repository, published_at DESC);


--
-- Name: repo_metrics_repo_time; Type: INDEX; Schema: atlas; Owner: -
--

CREATE INDEX repo_metrics_repo_time ON atlas.repo_metrics USING btree (repository, measured_at DESC);


--
-- Name: seo_audits_route_time; Type: INDEX; Schema: atlas; Owner: -
--

CREATE INDEX seo_audits_route_time ON atlas.seo_audits USING btree (page_path, measured_at DESC);


--
-- Name: web_vitals_route_metric_time; Type: INDEX; Schema: atlas; Owner: -
--

CREATE INDEX web_vitals_route_metric_time ON atlas.web_vitals USING btree (page_path, metric_name, measured_at DESC);


--
-- Name: web_vitals_source_time; Type: INDEX; Schema: atlas; Owner: -
--

CREATE INDEX web_vitals_source_time ON atlas.web_vitals USING btree (source_origin, measured_at DESC);


--
-- Name: ai_usage ai_usage_run_id_fkey; Type: FK CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.ai_usage
    ADD CONSTRAINT ai_usage_run_id_fkey FOREIGN KEY (run_id) REFERENCES atlas.collector_runs(id) ON DELETE SET NULL;


--
-- Name: dashboard_layouts dashboard_layouts_dashboard_id_fkey; Type: FK CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.dashboard_layouts
    ADD CONSTRAINT dashboard_layouts_dashboard_id_fkey FOREIGN KEY (dashboard_id) REFERENCES atlas.dashboards(id) ON DELETE CASCADE;


--
-- Name: dependency_health dependency_health_metric_id_fkey; Type: FK CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.dependency_health
    ADD CONSTRAINT dependency_health_metric_id_fkey FOREIGN KEY (metric_id) REFERENCES atlas.repo_metrics(id) ON DELETE CASCADE;


--
-- Name: lighthouse_reports lighthouse_reports_run_id_fkey; Type: FK CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.lighthouse_reports
    ADD CONSTRAINT lighthouse_reports_run_id_fkey FOREIGN KEY (run_id) REFERENCES atlas.collector_runs(id) ON DELETE SET NULL;


--
-- Name: region_latency_samples region_latency_samples_run_id_fkey; Type: FK CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.region_latency_samples
    ADD CONSTRAINT region_latency_samples_run_id_fkey FOREIGN KEY (run_id) REFERENCES atlas.collector_runs(id) ON DELETE SET NULL;


--
-- Name: releases releases_run_id_fkey; Type: FK CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.releases
    ADD CONSTRAINT releases_run_id_fkey FOREIGN KEY (run_id) REFERENCES atlas.collector_runs(id) ON DELETE SET NULL;


--
-- Name: repo_metrics repo_metrics_run_id_fkey; Type: FK CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.repo_metrics
    ADD CONSTRAINT repo_metrics_run_id_fkey FOREIGN KEY (run_id) REFERENCES atlas.collector_runs(id) ON DELETE SET NULL;


--
-- Name: seo_audits seo_audits_run_id_fkey; Type: FK CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.seo_audits
    ADD CONSTRAINT seo_audits_run_id_fkey FOREIGN KEY (run_id) REFERENCES atlas.collector_runs(id) ON DELETE SET NULL;


--
-- Name: seo_findings seo_findings_audit_id_fkey; Type: FK CONSTRAINT; Schema: atlas; Owner: -
--

ALTER TABLE ONLY atlas.seo_findings
    ADD CONSTRAINT seo_findings_audit_id_fkey FOREIGN KEY (audit_id) REFERENCES atlas.seo_audits(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

