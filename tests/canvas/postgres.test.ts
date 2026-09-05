import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabase, type Database } from "../../lib/db/pool";
import { migrate } from "../../lib/db/migrate";
import { DashboardError, DashboardService } from "../../lib/dashboard/service";
import { dashboardHandlers } from "../../lib/dashboard/handlers";
import { authSettings, authorizeRequest, createSession } from "../../lib/auth";
import { changeCard } from "../../lib/dashboard/model";
let db: Database; let service: DashboardService;
before(async () => {
  const connectionString = process.env.ATLAS_TEST_DATABASE_URL;
  if (!connectionString) throw new Error("Set ATLAS_TEST_DATABASE_URL to a loopback test database.");
  const url = new URL(connectionString); if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !/test|roadmap/.test(url.pathname)) throw new Error("Tests refuse non-loopback/non-test databases.");
  db = createDatabase({ connectionString, schema: `atlas_canvas_${randomUUID().replaceAll("-", "")}` }); await migrate(db); service = new DashboardService(db);
});
after(async () => { if (db) { await db.query(`DROP SCHEMA "${db.schema}" CASCADE`); await db.close(); } });
test("named dashboards persist independently, isolate owners and cascade on deletion", async () => {
  const a = await service.create("alice", "  Performance  "); const b = await service.create("alice", "Releases");
  await assert.rejects(service.create("alice", "PERFORMANCE"), (error: unknown) => error instanceof DashboardError && error.status === 400);
  await assert.rejects(service.rename("alice", b.id, "Performance"), (error: unknown) => error instanceof DashboardError && error.status === 400);
  assert.equal(a.name, "Performance"); assert.equal((await service.list("alice")).length, 2); assert.equal((await service.list("bob")).length, 0);
  await assert.rejects(service.get("bob", a.id), (error: unknown) => error instanceof DashboardError && error.status === 404);
  await assert.rejects(service.rename("bob", a.id, "stolen")); await assert.rejects(service.delete("bob", a.id, a.revision));
  const layout = changeCard(a.layout, a.layout.cards[0].id, { span: 8, rows: 8 });
  const saved = await service.save("alice", a.id, layout, a.revision); assert.equal(saved.revision, 2);
  assert.deepEqual((await service.get("alice", a.id)).layout, layout); assert.deepEqual((await service.get("alice", b.id)).layout, b.layout);
  assert.equal((await service.rename("alice", b.id, "Release health")).name, "Release health");
  await service.delete("alice", b.id, b.revision); await assert.rejects(service.get("alice", b.id));
  assert.equal((await db.query(`SELECT 1 FROM ${db.table("dashboard_layouts")} WHERE dashboard_id = $1`, [b.id])).rowCount, 0);
});
test("competing saves return one accurate revision and a conflict; stale delete cannot discard changes", async () => {
  const board = await service.create("cas", "CAS");
  const one = changeCard(board.layout, board.layout.cards[0].id, { span: 6 }); const two = changeCard(board.layout, board.layout.cards[0].id, { span: 8 });
  const results = await Promise.allSettled([service.save("cas", board.id, one, 1), service.save("cas", board.id, two, 1)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  const rejected = results.find(result => result.status === "rejected") as PromiseRejectedResult; assert.equal(rejected.reason.status, 409);
  const fulfilled = results.find(result => result.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof service.save>>>;
  assert.equal(fulfilled.value.revision, 2); assert.deepEqual((await service.get("cas", board.id)).layout, fulfilled.value.layout);
  await assert.rejects(service.delete("cas", board.id, 1), (error: unknown) => error instanceof DashboardError && error.status === 409);
});
test("API authentication precedes storage, CSRF protects writes and caller owner fields are ignored", async () => {
  const env = { NODE_ENV: "production", ATLAS_AUTH: "password", ATLAS_APP_URL: "https://atlas.example", ATLAS_PASSWORD: "test-password-value", ATLAS_SESSION_SECRET: "test-session-secret-with-at-least-32-characters" };
  const handle = dashboardHandlers((request, action) => authorizeRequest(request, action, env), () => service);
  const created = createSession(authSettings(env));
  const headers = { cookie: `atlas_session=${created.cookie}`, origin: "https://atlas.example", "content-type": "application/json", "x-atlas-csrf": created.session.csrf };
  assert.equal((await handle(new Request("https://atlas.example/api/dashboards"), "list")).status, 401);
  assert.equal((await handle(new Request("https://atlas.example/api/dashboards", { method: "POST", headers: { ...headers, "x-atlas-csrf": "" }, body: JSON.stringify({ name: "Test" }) }), "create")).status, 403);
  const response = await handle(new Request("https://atlas.example/api/dashboards", { method: "POST", headers, body: JSON.stringify({ name: "Owned", owner: "victim" }) }), "create");
  assert.equal(response.status, 201); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await service.list("victim")).length, 0); assert.equal((await service.list("shared-password")).length, 1);
});


test("concurrent creates enforce the per-owner dashboard bound", async () => {
  const results = await Promise.allSettled(Array.from({ length: 21 }, (_, index) => service.create("bounded", `Board ${index}`)));
  assert.equal(results.filter(result => result.status === "fulfilled").length, 20);
  assert.equal((await service.list("bounded")).length, 20);
  const rejected = results.find(result => result.status === "rejected") as PromiseRejectedResult;
  assert.equal(rejected.reason.status, 400);
});
