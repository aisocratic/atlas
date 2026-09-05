import type { CardContext, CollectionContext } from "../../lib/cards/define"
import type { Queryable } from "../../lib/db/pool"
import { sourceOrigin, pushVersion, writeCredentialConfigured } from "../../lib/ingest/service"
import { CollectorError } from "../../lib/collectors/execute"
export const cacheVersion = pushVersion("server-errors")
export function requirements(context: CardContext) { return [
  ...(!context.config.siteUrl ? [{ id: "site", reason: "Set ATLAS_SITE_URL for server error source identity." }] : []),
  ...(!writeCredentialConfigured(context.env, "server") ? [{ id: "write-token", reason: "Configure a separate ATLAS_ERRORS_WRITE_TOKEN (32+ characters) in the source server and Atlas." }] : []),
] }
export const collector = { async collect(context: CollectionContext) { return { async publish(tx: Queryable) {
  const result = await tx.query(`SELECT 1 FROM ${tx.table("error_logs")} WHERE source_origin=$1 LIMIT 1`, [sourceOrigin(context.config)])
  if (!result.rowCount) throw new CollectorError("No server errors have been ingested. Configure the server-side error sender first.")
  return { rowsWritten: 0 }
} } } }
