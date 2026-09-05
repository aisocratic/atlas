import type { Database, Queryable } from "./pool";
export type Layout = Record<string, unknown>;
export interface Dashboard { id: string; owner_key: string; name: string; position: number; created_at: Date; updated_at: Date }
export interface SavedLayout { dashboard_id: string; layout: Layout; revision: number; updated_at: Date }
export class LayoutConflictError extends Error { constructor() { super("Dashboard changed elsewhere. Reload its layout before saving again."); this.name = "LayoutConflictError"; } }
function nameValue(name: string): string {
  const value = name.trim().replace(/\s+/g, " ");
  if (!value || value.length > 80) throw new Error("Dashboard names must contain 1–80 characters.");
  return value;
}
function layoutValue(layout: Layout): string {
  if (!layout || typeof layout !== "object" || Array.isArray(layout)) throw new Error("Layout must be a JSON object.");
  const value = JSON.stringify(layout);
  if (Buffer.byteLength(value) > 1_000_000) throw new Error("Dashboard layout exceeds 1 MB.");
  return value;
}
export async function listDashboards(db: Queryable, ownerKey: string): Promise<Dashboard[]> {
  return (await db.query<Dashboard>(`SELECT * FROM ${db.table("dashboards")} WHERE owner_key = $1 ORDER BY position, created_at, id`, [ownerKey])).rows;
}
export async function createDashboard(db: Database, ownerKey: string, name: string, layout: Layout = {}): Promise<Dashboard> {
  const json = layoutValue(layout);
  return db.transaction(async (tx) => {
    const result = await tx.query<Dashboard>(`INSERT INTO ${tx.table("dashboards")} (owner_key, name, position) VALUES ($1, $2, (SELECT coalesce(max(position), -1) + 1 FROM ${tx.table("dashboards")} WHERE owner_key = $1)) RETURNING *`, [ownerKey, nameValue(name)]);
    const dashboard = result.rows[0];
    await tx.query(`INSERT INTO ${tx.table("dashboard_layouts")} (dashboard_id, layout) VALUES ($1, $2::jsonb)`, [dashboard.id, json]);
    return dashboard;
  });
}
export async function renameDashboard(db: Queryable, ownerKey: string, id: string, name: string): Promise<Dashboard | null> {
  return (await db.query<Dashboard>(`UPDATE ${db.table("dashboards")} SET name = $1, updated_at = now() WHERE id = $2 AND owner_key = $3 RETURNING *`, [nameValue(name), id, ownerKey])).rows[0] ?? null;
}
export async function readLayout(db: Queryable, ownerKey: string, id: string): Promise<SavedLayout | null> {
  return (await db.query<SavedLayout>(`SELECT l.* FROM ${db.table("dashboard_layouts")} l JOIN ${db.table("dashboards")} d ON d.id = l.dashboard_id WHERE d.id = $1 AND d.owner_key = $2`, [id, ownerKey])).rows[0] ?? null;
}
/** Compare-and-swap prevents two tabs from silently overwriting one another. */
export async function saveLayout(db: Queryable, ownerKey: string, id: string, layout: Layout, expectedRevision: number): Promise<SavedLayout> {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new Error("Expected layout revision is required.");
  const result = await db.query<SavedLayout>(`UPDATE ${db.table("dashboard_layouts")} l SET layout = $1::jsonb, revision = revision + 1, updated_at = now() FROM ${db.table("dashboards")} d WHERE l.dashboard_id = d.id AND d.id = $2 AND d.owner_key = $3 AND l.revision = $4 RETURNING l.*`, [layoutValue(layout), id, ownerKey, expectedRevision]);
  if (!result.rows[0]) throw new LayoutConflictError();
  return result.rows[0];
}
export async function deleteDashboard(db: Queryable, ownerKey: string, id: string): Promise<boolean> {
  return (await db.query(`DELETE FROM ${db.table("dashboards")} WHERE id = $1 AND owner_key = $2`, [id, ownerKey])).rowCount === 1;
}
