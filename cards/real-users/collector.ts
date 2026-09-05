import type { CardContext, CollectionContext } from "../../lib/cards/define"
import type { Queryable } from "../../lib/db/pool"
import { sourceOrigin, pushVersion, writeCredentialConfigured } from "../../lib/ingest/service"
import { CollectorError } from "../../lib/collectors/execute"
export const cacheVersion = pushVersion("real-users")
export function requirements(context: CardContext) { return [
  ...(!context.config.siteUrl ? [{ id: "site", reason: "Set ATLAS_SITE_URL for the browser ingestion origin." }] : []),
  ...(!writeCredentialConfigured(context.env, "browser") ? [{ id: "write-key", reason: "Set a separate ATLAS_RUM_WRITE_KEY (16+ characters) and install the web-vitals beacon on the configured site." }] : []),
] }
export const collector = { async collect(context: CollectionContext) { return { async publish(tx: Queryable) {
  const result = await tx.query(`SELECT 1 FROM ${tx.table("web_vitals")} WHERE source_origin=$1 LIMIT 1`, [sourceOrigin(context.config)])
  if (!result.rowCount) throw new CollectorError("No browser metrics have been ingested. Install the web-vitals beacon first.")
  return { rowsWritten: 0 }
} } } }
