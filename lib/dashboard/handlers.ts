import { authorizeRequest } from "../auth";
import { authJson, readSmallJson } from "../auth/http";
import { getDatabase } from "../db/pool";
import { DashboardError, DashboardService } from "./service";
export function dashboardHandlers(authorize = authorizeRequest, service = () => new DashboardService(getDatabase())) {
  return async (request: Request, operation: "list" | "create" | "get" | "rename" | "save" | "delete", id = "") => {
    const auth = await authorize(request, operation === "list" || operation === "get" ? "read" : "write");
    if (!auth.ok) return authJson({ error: auth.error }, auth.status);
    try {
      const store = service(); const owner = auth.principal.id;
      if (operation === "list") return authJson({ dashboards: await store.list(owner) });
      if (operation === "get") return authJson({ dashboard: await store.get(owner, id) });
      let body: Record<string, unknown>;
      try { body = await readSmallJson(request, 32768); } catch { return authJson({ error: "Send a valid JSON request under 32 KB." }, 400); }
      if (operation === "create") return authJson({ dashboard: await store.create(owner, body.name) }, 201);
      if (operation === "rename") return authJson({ dashboard: await store.rename(owner, id, body.name) });
      if (operation === "save") return authJson({ dashboard: await store.save(owner, id, body.layout, body.revision) });
      await store.delete(owner, id, body.revision); return authJson({ ok: true });
    } catch (error) { return authJson({ error: error instanceof DashboardError ? error.message : "Dashboards could not be loaded or saved. Check database setup and try again." }, error instanceof DashboardError ? error.status : 503); }
  };
}
