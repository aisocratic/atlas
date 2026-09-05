import { test, expect } from "@playwright/test";
import { signIn } from "../fixtures/auth.mjs";
test("registered sources collect through HTTP, PostgreSQL and the real dashboard on desktop/mobile", async ({ page, context, request }, testInfo) => {
  await signIn(page);
  await page.getByRole("button", { name: "New dashboard", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Dashboard name").fill(`Collectors ${testInfo.project.name}`);
  await page.getByRole("dialog").getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.locator("article[data-card-id]")).toHaveCount(9);
  const card = id => page.locator(`article[data-card-id="${id}"]`);
  for (const [id, expected] of [["lighthouse", "1,400 ms"], ["seo-audit", "100 / 100"], ["releases", "Measured browser release"]]) {
    const [response] = await Promise.all([page.waitForResponse(response => response.url().endsWith(`/api/collect/${id}`) && response.request().method() === "POST"), card(id).getByRole("button", { name: "Collect now", exact: true }).click()]);
    expect(response.status()).toBe(200); await expect(card(id).getByText(expected, { exact: true }).first()).toBeVisible();
  }
  await expect(card("ai-usage").getByText(/explicit optIn/)).toBeVisible();
  await expect(card("ai-usage").getByRole("button", { name: "Collect now" })).toBeDisabled();
  const browser = await context.newPage();
  await browser.goto("http://127.0.0.1:4185/beacon");
  await browser.getByRole("button", { name: "Exercise interaction" }).click();
  await browser.goto("about:blank");
  await expect.poll(() => page.evaluate(async () => (await (await fetch("/api/datasets/real-users")).json()).status)).toBe("ready");
  await browser.close();
  const error = await request.post("/api/ingest/errors", { headers: { Authorization: "Bearer private-server-e2e-write-token-32characters" }, data: { events: [{ id: `browser-${testInfo.project.name}`, level: "error", message: "Measured server exception", path: "/api/test" }] } });
  expect(error.status()).toBe(202);
  await page.reload();
  await expect(card("real-users").getByText("Field LCP p75", { exact: true })).toBeVisible();
  await expect(card("server-errors").getByText("Measured server exception", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("collected-card-families.png"), fullPage: true });
  await page.goto("/cards/lighthouse"); await expect(page.getByText("1,400 ms", { exact: true })).toBeVisible();
  await page.goto("/cards/region-latency"); await expect(page.getByRole("heading", { name: "Region latency", exact: true })).toBeVisible();
});
