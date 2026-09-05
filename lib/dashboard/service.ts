import { cardRegistry } from "../../cards/registry";
import type { Database } from "../db/pool";
import { initialLayout, validateLayout, type CanvasLayout } from "./model";
export interface DashboardView { id: string; name: string; layout: CanvasLayout; revision: number; updatedAt: string }
interface Row { id: string; name: string; layout: unknown; revision: number; updated_at: Date }
export class DashboardError extends Error { constructor(message: string, readonly status: number) { super(message); } }
const view = (row: Row): DashboardView => ({ id: row.id, name: row.name, layout: validateLayout(row.layout), revision: row.revision, updatedAt: row.updated_at.toISOString() });
function nameConflict(error: unknown): never {
  if (error && typeof error === "object" && "code" in error && error.code === "23505" && "constraint" in error && error.constraint === "dashboards_owner_name") throw new DashboardError("A dashboard with that name already exists. Choose another name.", 400);
  throw error;
}
const validId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
function nameValue(value: unknown): string {
  if (typeof value !== "string") throw new DashboardError("Enter a dashboard name.", 400);
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > 80 || Array.from(name).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw new DashboardError("Use a dashboard name of 1–80 characters.", 400);
  return name;
}
function revisionValue(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new DashboardError("A valid layout revision is required.", 400);
  return value;
}
export class DashboardService {
  constructor(readonly db: Database) {}
  async list(owner: string): Promise<DashboardView[]> {
    const result = await this.db.query<Row>(`SELECT d.id, d.name, l.layout, l.revision, l.updated_at FROM ${this.db.table("dashboards")} d JOIN ${this.db.table("dashboard_layouts")} l ON l.dashboard_id = d.id WHERE d.owner_key = $1 ORDER BY d.position, d.created_at, d.id`, [owner]);
    return result.rows.map(view);
  }
  async create(owner: string, value: unknown): Promise<DashboardView> {
    const name = nameValue(value);
    return this.db.transaction(async tx => {
      await tx.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [tx.schema, `dashboard-owner:${owner}`]);
      const count = await tx.query<{ count: string }>(`SELECT count(*) FROM ${tx.table("dashboards")} WHERE owner_key = $1`, [owner]);
      if (Number(count.rows[0].count) >= 20) throw new DashboardError("You can save up to 20 dashboards.", 400);
      const result = await tx.query<{ id: string }>(`INSERT INTO ${tx.table("dashboards")} (owner_key, name, position) VALUES ($1, $2, (SELECT coalesce(max(position), -1) + 1 FROM ${tx.table("dashboards")} WHERE owner_key = $1)) RETURNING id`, [owner, name]);
      const id = result.rows[0].id;
      const layout = initialLayout(cardRegistry);
      const saved = await tx.query<{ revision: number; updated_at: Date }>(`INSERT INTO ${tx.table("dashboard_layouts")} (dashboard_id, layout) VALUES ($1, $2::jsonb) RETURNING revision, updated_at`, [id, JSON.stringify(layout)]);
      return { id, name, layout, revision: saved.rows[0].revision, updatedAt: saved.rows[0].updated_at.toISOString() };
    }).catch(nameConflict);
  }
  async get(owner: string, id: string): Promise<DashboardView> {
    if (!validId(id)) throw new DashboardError("Dashboard not found.", 404);
    const result = await this.db.query<Row>(`SELECT d.id, d.name, l.layout, l.revision, l.updated_at FROM ${this.db.table("dashboards")} d JOIN ${this.db.table("dashboard_layouts")} l ON l.dashboard_id = d.id WHERE d.owner_key = $1 AND d.id = $2`, [owner, id]);
    if (!result.rows[0]) throw new DashboardError("Dashboard not found.", 404);
    return view(result.rows[0]);
  }
  async rename(owner: string, id: string, value: unknown): Promise<DashboardView> {
    await this.get(owner, id); const name = nameValue(value);
    await this.db.query(`UPDATE ${this.db.table("dashboards")} SET name = $1, updated_at = now() WHERE id = $2 AND owner_key = $3`, [name, id, owner]).catch(nameConflict);
    return this.get(owner, id);
  }
  async save(owner: string, id: string, input: unknown, expected: unknown): Promise<DashboardView> {
    await this.get(owner, id); const revision = revisionValue(expected);
    let layout: CanvasLayout;
    try { layout = validateLayout(input); } catch (error) { throw new DashboardError(error instanceof Error ? error.message : "Invalid layout.", 400); }
    const saved = await this.db.query<Row>(`UPDATE ${this.db.table("dashboard_layouts")} l SET layout = $1::jsonb, revision = revision + 1, updated_at = now() FROM ${this.db.table("dashboards")} d WHERE l.dashboard_id = d.id AND d.id = $2 AND d.owner_key = $3 AND l.revision = $4 RETURNING d.id, d.name, l.layout, l.revision, l.updated_at`, [JSON.stringify(layout), id, owner, revision]);
    if (!saved.rowCount) throw new DashboardError("This dashboard changed in another tab. Your local arrangement is still here. Reload the saved layout before editing again.", 409);
    return view(saved.rows[0]);
  }
  async delete(owner: string, id: string, expected: unknown): Promise<void> {
    if (!validId(id)) throw new DashboardError("Dashboard not found.", 404);
    const revision = revisionValue(expected);
    await this.db.transaction(async tx => {
      const saved = await tx.query<{ revision: number }>(`SELECT l.revision FROM ${tx.table("dashboard_layouts")} l JOIN ${tx.table("dashboards")} d ON d.id = l.dashboard_id WHERE d.id = $1 AND d.owner_key = $2 FOR UPDATE OF l`, [id, owner]);
      if (!saved.rows[0]) throw new DashboardError("Dashboard not found.", 404);
      if (saved.rows[0].revision !== revision) throw new DashboardError("The saved layout changed. Reload it before deleting this dashboard.", 409);
      await tx.query(`DELETE FROM ${tx.table("dashboards")} WHERE id = $1 AND owner_key = $2`, [id, owner]);
    });
  }
}
