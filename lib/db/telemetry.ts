import type { Queryable } from "./pool";
type Time = string | Date;
type Run = { run_id?: string | null };
type Measured = { measured_at?: Time };
type Json = Record<string, unknown>;
export interface TelemetryInputs {
  lighthouse_reports: Run & Measured & { page_path: string; page_url: string; strategy: "mobile" | "desktop"; performance_score?: number; accessibility_score?: number; seo_score?: number; best_practices_score?: number; lcp_ms?: number; cls?: number; tbt_ms?: number; fcp_ms?: number; ttfb_ms?: number; total_byte_weight?: number; raw?: Json };
  web_vitals: Measured & { source_origin?: string; event_key?: string; page_path: string; metric_name: "LCP" | "INP" | "CLS" | "FCP" | "TTFB"; metric_value: number; rating?: "good" | "needs-improvement" | "poor"; navigation_type?: string; device_type?: string; session_key?: string };
  seo_audits: Run & Measured & { page_path: string; page_url: string; status_code?: number; score?: number; title?: string; description?: string; canonical_url?: string; has_og?: boolean; indexable?: boolean; checks?: Json };
  seo_findings: { audit_id: string; rule_id: string; severity: "info" | "warning" | "error"; message: string; details?: Json };
  region_latency_samples: Run & Measured & { provider?: string; measurement_id?: string; region_key: string; region_label: string; probe_country?: string; probe_city?: string; page_path: string; page_url: string; status: "ok" | "error"; status_code?: number; error?: string; dns_ms?: number; connect_ms?: number; tls_ms?: number; ttfb_ms?: number; load_ms?: number; fcp_ms?: number; lcp_ms?: number };
  region_latency_daily: { page_url?: string; day: string; region_key: string; page_path: string; samples: number; ok_samples: number; error_samples: number; ttfb_p50_ms?: number; ttfb_p95_ms?: number; load_p50_ms?: number; load_p95_ms?: number };
  repo_metrics: Run & Measured & { repository: string; git_commit?: string; git_branch?: string; source_loc?: number; source_files?: number; dependency_count?: number; duplication_percentage?: number; complexity_p95?: number; lint_errors?: number; type_errors?: number; test_failures?: number; metrics?: Json };
  dependency_health: { metric_id: string; package_name: string; current_version: string; latest_version?: string; dependency_type: "runtime" | "development"; majors_behind?: number; vulnerability_count?: number };
  releases: Run & { repository: string; provider_id?: string; tag: string; title?: string; summary?: string; github_url?: string; published_at: Time; prerelease?: boolean; target_sha?: string };
  error_logs: { source_origin?: string; event_key?: string; occurred_at?: Time; level: "error" | "warn"; message: string; fingerprint: string; error_name?: string; stack?: string; route?: string; method?: string; status_code?: number; metadata?: Json };
  page_views: { source_origin?: string; event_key?: string; occurred_at?: Time; path: string; referrer?: string; device_type?: string; session_key?: string; is_bot?: boolean };
  ai_usage: Run & { day: string; tool: string; model?: string; source_key?: string; opted_in: true; input_tokens?: number | string; output_tokens?: number | string; cache_read_tokens?: number | string; cache_creation_tokens?: number | string; cost_usd?: number | string; sessions?: number };
  anomalies: { source_origin?: string; detected_at?: Time; card_id: string; fingerprint: string; severity: "info" | "warning" | "error"; title: string; description?: string; baseline_value?: number; observed_value?: number; evidence?: Json; resolved_at?: Time | null };
}
export type TelemetryTable = keyof TelemetryInputs;
export type TelemetryRow<T extends TelemetryTable> = TelemetryInputs[T] & (T extends "region_latency_daily" ? { updated_at: Date } : { id: string });
const definitions: Record<TelemetryTable, { columns: string; time?: string; unique?: string[]; json?: string[] }> = {
  lighthouse_reports: { columns: "run_id measured_at page_path page_url strategy performance_score accessibility_score seo_score best_practices_score lcp_ms cls tbt_ms fcp_ms ttfb_ms total_byte_weight raw", time: "measured_at", json: ["raw"] },
  web_vitals: { columns: "source_origin event_key measured_at page_path metric_name metric_value rating navigation_type device_type session_key", time: "measured_at", unique: ["source_origin", "event_key"] },
  seo_audits: { columns: "run_id measured_at page_path page_url status_code score title description canonical_url has_og indexable checks", time: "measured_at", json: ["checks"] },
  seo_findings: { columns: "audit_id rule_id severity message details", unique: ["audit_id", "rule_id"], json: ["details"] },
  region_latency_samples: { columns: "run_id measured_at provider measurement_id region_key region_label probe_country probe_city page_path page_url status status_code error dns_ms connect_ms tls_ms ttfb_ms load_ms fcp_ms lcp_ms", time: "measured_at" },
  region_latency_daily: { columns: "page_url day region_key page_path samples ok_samples error_samples ttfb_p50_ms ttfb_p95_ms load_p50_ms load_p95_ms", time: "day", unique: ["page_url", "day", "region_key", "page_path"] },
  repo_metrics: { columns: "run_id measured_at repository git_commit git_branch source_loc source_files dependency_count duplication_percentage complexity_p95 lint_errors type_errors test_failures metrics", time: "measured_at", json: ["metrics"] },
  dependency_health: { columns: "metric_id package_name current_version latest_version dependency_type majors_behind vulnerability_count", unique: ["metric_id", "package_name", "dependency_type"] },
  releases: { columns: "run_id repository provider_id tag title summary github_url published_at prerelease target_sha", time: "published_at", unique: ["repository", "tag"] },
  error_logs: { columns: "source_origin event_key occurred_at level message fingerprint error_name stack route method status_code metadata", time: "occurred_at", unique: ["source_origin", "event_key"], json: ["metadata"] },
  page_views: { columns: "source_origin event_key occurred_at path referrer device_type session_key is_bot", time: "occurred_at", unique: ["source_origin", "event_key"] },
  ai_usage: { columns: "run_id day tool model source_key opted_in input_tokens output_tokens cache_read_tokens cache_creation_tokens cost_usd sessions", time: "day", unique: ["day", "tool", "model", "source_key"] },
  anomalies: { columns: "source_origin detected_at card_id fingerprint severity title description baseline_value observed_value evidence resolved_at", time: "detected_at", unique: ["fingerprint"], json: ["evidence"] },
};
/** Values are parameters. Identifiers come only from this fixed registry, never request strings. */
export async function insertTelemetry<T extends TelemetryTable>(db: Queryable, table: T, input: TelemetryInputs[T], options: { upsert?: boolean } = {}): Promise<TelemetryRow<T>> {
  const definition = definitions[table];
  if (!definition) throw new Error("Unknown telemetry table.");
  const columns = Object.keys(input).filter((key) => (input as Record<string, unknown>)[key] !== undefined);
  const known = definition.columns.split(" ");
  if (!columns.length || columns.some((key) => !known.includes(key))) throw new Error("Unknown or empty telemetry columns.");
  const values = columns.map((key) => definition.json?.includes(key) ? JSON.stringify((input as Record<string, unknown>)[key]) : (input as Record<string, unknown>)[key]);
  let conflict = "";
  if (options.upsert) {
    if (!definition.unique) throw new Error("This telemetry table is append-only.");
    const update = columns.filter((key) => !definition.unique!.includes(key));
    if (!update.length) throw new Error("Upsert requires a value to update.");
    conflict = ` ON CONFLICT (${definition.unique.join(", ")}) DO UPDATE SET ${update.map((key) => `${key} = EXCLUDED.${key}`).join(", ")}`;
    if (["region_latency_daily", "ai_usage"].includes(table)) conflict += ", updated_at = now()";
  }
  const result = await db.query(`INSERT INTO ${db.table(table)} (${columns.join(", ")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")})${conflict} RETURNING *`, values);
  return result.rows[0] as TelemetryRow<T>;
}
export interface TelemetryQuery { since?: Time; until?: Time; limit?: number; filters?: Record<string, string | number | boolean> }
export async function readTelemetry<T extends TelemetryTable>(db: Queryable, table: T, options: TelemetryQuery = {}): Promise<TelemetryRow<T>[]> {
  const definition = definitions[table];
  if (!definition) throw new Error("Unknown telemetry table.");
  const conditions: string[] = []; const values: unknown[] = [];
  for (const [column, value] of Object.entries(options.filters ?? {})) {
    if (!definition.columns.split(" ").includes(column)) throw new Error("Unknown telemetry filter.");
    values.push(value); conditions.push(`${column} = $${values.length}`);
  }
  if ((options.since || options.until) && !definition.time) throw new Error("This child table must be filtered by its parent ID.");
  if (options.since) { values.push(options.since); conditions.push(`${definition.time} >= $${values.length}`); }
  if (options.until) { values.push(options.until); conditions.push(`${definition.time} < $${values.length}`); }
  const limit = options.limit ?? 1000;
  if (!Number.isInteger(limit) || limit < 1 || limit > 10000) throw new Error("Telemetry limit must be 1–10000.");
  values.push(limit);
  const order = definition.time ? `${definition.time} DESC${table === "region_latency_daily" ? ", region_key, page_path" : ", id DESC"}` : "id DESC";
  return (await db.query(`SELECT * FROM ${db.table(table)}${conditions.length ? ` WHERE ${conditions.join(" AND ")}` : ""} ORDER BY ${order} LIMIT $${values.length}`, values)).rows as TelemetryRow<T>[];
}
