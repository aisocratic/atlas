import { test, expect } from "@playwright/test";
import { password, collectorToken, signIn } from "../fixtures/auth.mjs";

test("login protects telemetry, survives reload, enforces CSRF, and logout clears access", async ({ page, context }, testInfo) => {
  await page.goto("/"); await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in to Atlas" })).toBeVisible();
  const unauth = await context.request.get("/api/datasets/region-latency");
  expect(unauth.status()).toBe(401); expect(unauth.headers()["cache-control"]).toContain("no-store");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Incorrect password.");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:4190/");
  await expect(page.getByRole("heading", { name: "Engineering telemetry" })).toBeVisible();
  await page.reload(); await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  const cookie = (await context.cookies()).find(cookie => cookie.name === "atlas_session");
  expect(cookie.httpOnly).toBe(true); expect(cookie.secure).toBe(true); expect(cookie.sameSite).toBe("Lax");
  const datasetStatus = await page.evaluate(async () => (await fetch("/api/datasets/region-latency")).status); expect(datasetStatus).toBe(200);
  const noCsrfStatus = await page.evaluate(async () => (await fetch("/api/auth/logout", { method: "POST" })).status); expect(noCsrfStatus).toBe(403);
  const session = await page.evaluate(async () => (await fetch("/api/auth/session")).json()); expect(session.csrfToken).toHaveLength(43);
  const forgedOrigin = await context.request.post("/api/auth/logout", { headers: { cookie: `atlas_session=${cookie.value}`, origin: "https://evil.example", "X-Atlas-CSRF": session.csrfToken } }); expect(forgedOrigin.status()).toBe(403);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("authenticated-atlas.png"), fullPage: true });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/); expect((await context.cookies()).some(cookie => cookie.name === "atlas_session")).toBe(false);
  await page.goto("/"); await expect(page).toHaveURL(/\/login$/);
});

test("a tampered session cannot open pages or APIs and bearer cannot read telemetry", async ({ page, context }) => {
  await signIn(page);
  const cookie = (await context.cookies()).find(cookie => cookie.name === "atlas_session");
  await context.addCookies([{ ...cookie, value: cookie.value + "tampered" }]);
  await page.goto("/"); await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(async () => (await fetch("/api/auth/session")).status)).toBe(401);
  expect((await context.request.get("/api/datasets/region-latency", { headers: { authorization: `Bearer ${collectorToken}` } })).status()).toBe(403);
  const collected = await context.request.post("/api/collect/unknown-card", { headers: { authorization: `Bearer ${collectorToken}` } });
  expect(collected.status()).toBe(404); // Credential reached the collector lookup, without granting read access.
});

test("production open serves useful setup and denies every protected endpoint", async ({ page, request }, testInfo) => {
  await page.goto("http://127.0.0.1:4191/");
  await expect(page).toHaveURL("http://127.0.0.1:4191/setup");
  await expect(page.getByRole("heading", { name: "Set up Atlas", exact: true })).toBeVisible();
  await expect(page.getByText("Needs configuration", { exact: true })).toHaveCount(3);
  await expect(page.getByText("Open authentication is disabled in production. Choose password or header.", { exact: true })).toBeVisible();
  await expect(page.locator("pre")).toContainText("pnpm run setup");
  for (const path of ["/api/auth/session", "/api/datasets/region-latency"]) expect((await request.get(`http://127.0.0.1:4191${path}`)).status()).toBe(503);
  expect((await request.post("http://127.0.0.1:4191/api/collect/region-latency")).status()).toBe(503);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("setup-atlas.png"), fullPage: true });
});
