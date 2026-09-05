import { test, expect } from "@playwright/test";
import { signIn } from "../fixtures/auth.mjs";
async function call(page, path, method = "GET", body) {
  return page.evaluate(async ({ path, method, body }) => {
    const headers = {};
    if (method !== "GET") { headers["X-Atlas-CSRF"] = (await (await fetch("/api/auth/session")).json()).csrfToken; headers["Content-Type"] = "application/json"; }
    const response = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }, { path, method, body });
}
async function createBoard(page, name) {
  const wasArranging = await page.getByRole("button", { name: "Done arranging", exact: true }).isVisible();
  await page.getByRole("button", { name: "New dashboard", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Dashboard name").fill(name);
  await page.getByRole("dialog").getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute("aria-selected", "true");
  // Keep this canvas regression focused as additional registry modules land.
  const board = (await call(page, "/api/dashboards")).body.dashboards.find(board => board.name === name);
  if (board.layout.cards.some(card => card.cardId !== "region-latency")) {
    await call(page, `/api/dashboards/${board.id}/layout`, "PUT", { revision: board.revision, layout: { version: 1, cards: board.layout.cards.filter(card => card.cardId === "region-latency") } });
    await page.reload(); if (wasArranging) await arrange(page);
  }
}
const saved = page => expect(page.locator('[data-save-state="saved"]')).toBeVisible();
async function collectUi(page) {
  const [response] = await Promise.all([page.waitForResponse(response => response.url().endsWith("/api/collect/region-latency") && response.request().method() === "POST"), page.getByRole("button", { name: "Collect now", exact: true }).click()]);
  expect(response.status()).toBe(200);
  await expect(page.getByRole("button", { name: "Collect now", exact: true })).toBeEnabled();
}

const tiles = page => page.locator("article[data-tile]");
const width = page => page.getByRole("combobox", { name: /^Width of/ }).first();
async function arrange(page) { await page.getByRole("button", { name: "Arrange cards", exact: true }).click(); }

test.beforeEach(async ({ page }) => {
  await signIn(page);
  const list = await call(page, "/api/dashboards");
  for (const board of list.body.dashboards) await call(page, `/api/dashboards/${board.id}`, "DELETE", { revision: board.revision });
  await page.reload();
});

test("create, resize, rename, select and delete independent database dashboards", async ({ page }) => {
  await createBoard(page, "Performance"); await arrange(page); await width(page).selectOption("8"); await saved(page);
  await createBoard(page, "Releases"); await expect(width(page)).toHaveValue("6");
  await width(page).selectOption("4"); await saved(page);
  await page.getByRole("button", { name: "Rename dashboard", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Dashboard name").fill("Release health");
  await page.getByRole("dialog").getByRole("button", { name: "Rename", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Release health", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Performance", exact: true }).click(); await expect(width(page)).toHaveValue("8");
  await page.reload(); await arrange(page); await expect(width(page)).toHaveValue("8");
  const tabColors = await page.getByRole("tab", { name: "Performance", exact: true }).evaluate(element => ({ color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor }));
  expect(tabColors.color).not.toBe(tabColors.background);
  await page.getByRole("tab", { name: "Performance", exact: true }).focus(); await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Release health", exact: true })).toHaveAttribute("aria-selected", "true"); await expect(width(page)).toHaveValue("4");
  await page.getByRole("button", { name: "Delete dashboard", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Release health", exact: true })).toHaveCount(0);
  await page.reload(); await expect(page.getByRole("tab", { name: "Performance", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("pointer resize, keyboard movement, touch controls, reorder and undo persist", async ({ page }, testInfo) => {
  await createBoard(page, "Arrange"); await arrange(page);
  const resize = page.getByRole("button", { name: /^Resize Region latency/ }).first();
  await resize.evaluate(element => element.scrollIntoView({ block: "center" }));
  const box = await resize.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + (testInfo.project.name === "mobile" ? 0 : 100), box.y + box.height / 2 + 108, { steps: 5 }); await page.mouse.up();
  await saved(page); await expect(page.getByRole("spinbutton", { name: /^Height of/ }).first()).toHaveValue("8");
  await page.getByRole("combobox", { name: "Add card", exact: true }).selectOption("region-latency"); await saved(page); await expect(tiles(page)).toHaveCount(2);
  const beforeIds = await tiles(page).evaluateAll(elements => elements.map(element => element.dataset.tile));
  const earlier = page.getByRole("button", { name: /Move Region latency 2 earlier/, exact: true });
  if (testInfo.project.name === "mobile") await earlier.tap(); else await earlier.click();
  await saved(page); expect(await tiles(page).evaluateAll(elements => elements.map(element => element.dataset.tile))).toEqual(beforeIds.toReversed());
  await page.getByRole("button", { name: "Undo arrangement", exact: true }).click(); await saved(page);
  expect(await tiles(page).evaluateAll(elements => elements.map(element => element.dataset.tile))).toEqual(beforeIds);
  const move = page.getByRole("button", { name: "Move Region latency 1", exact: true });
  if (testInfo.project.name === "desktop") {
    await move.evaluate(element => element.scrollIntoView({ block: "center" })); const handle = await move.boundingBox();
    await page.mouse.move(handle.x + 12, handle.y + 12); await page.mouse.down(); await page.mouse.move(handle.x + 112, handle.y + 66, { steps: 5 }); await page.mouse.up(); await saved(page);
    expect((await call(page, "/api/dashboards")).body.dashboards[0].layout.cards.find(card => card.id === beforeIds[0]).y).toBe(1);
    await move.focus(); await page.keyboard.press("Control+z"); await saved(page);
    expect((await call(page, "/api/dashboards")).body.dashboards[0].layout.cards.find(card => card.id === beforeIds[0]).y).toBe(0);
  }
  await move.focus(); await page.keyboard.press("ArrowDown"); await saved(page);
  const after = (await call(page, "/api/dashboards")).body.dashboards[0].layout;
  await page.reload(); expect((await call(page, "/api/dashboards")).body.dashboards[0].layout).toEqual(after);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("canvas-arrangement.png"), fullPage: true });
});

test("a competing tab preserves local edits and requires explicit conflict recovery", async ({ page, context }) => {
  await createBoard(page, "Shared"); const other = await context.newPage(); await other.goto(page.url());
  await arrange(page); await arrange(other);
  await width(page).selectOption("8"); await saved(page);
  await width(other).selectOption("9");
  await expect(other.getByText("Changes not saved", { exact: true })).toBeVisible();
  await expect(width(other)).toHaveValue("9"); await expect(width(other)).toBeDisabled();
  expect((await call(page, "/api/dashboards")).body.dashboards[0].layout.cards[0].span).toBe(8);
  await other.getByRole("button", { name: "Reload saved layout", exact: true }).click(); await saved(other);
  await expect(width(other)).toHaveValue("8"); await expect(width(other)).toBeEnabled(); await other.close();
});

test("failed save retains the draft and retry publishes it", async ({ page }) => {
  await createBoard(page, "Network"); await arrange(page);
  await page.route("**/api/dashboards/*/layout", route => route.abort("failed"));
  await width(page).selectOption("9"); await expect(page.getByRole("button", { name: "Retry save", exact: true })).toBeVisible();
  await expect(width(page)).toHaveValue("9");
  await page.unroute("**/api/dashboards/*/layout"); await page.getByRole("button", { name: "Retry save", exact: true }).click(); await saved(page);
  await page.reload(); await arrange(page); await expect(width(page)).toHaveValue("9");
});

test("real collection publishes PostgreSQL measurements and renders honest missing regions", async ({ page }, testInfo) => {
  await createBoard(page, "Measurements");
  await collectUi(page);
  await expect(page.getByText("Fresh measurements", { exact: true })).toBeVisible({ timeout: 15_000 });
  const dataset = await call(page, "/api/datasets/region-latency"); expect(dataset.status).toBe(200); expect(dataset.body.status).toBe("ready");
  await expect(page.getByText(/120/).first()).toBeVisible();
  await expect(page.getByText("Unavailable", { exact: true }).first()).toBeVisible();
  await page.reload(); await expect(page.getByText("Fresh measurements", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("collected-region-latency.png"), fullPage: true });
});


test("visible-tab polling discovers external collection and keeps measurements through refresh failure", async ({ page }) => {
  await createBoard(page, "Live refresh");
  await collectUi(page); await expect(page.getByText("Fresh measurements", { exact: true })).toBeVisible();
  await page.clock.install(); await page.reload(); await expect(page.locator("time").first()).toHaveAttribute("datetime", /T/);
  const before = await page.locator("time").first().getAttribute("datetime");
  const collected = await call(page, "/api/collect/region-latency", "POST"); expect(collected.status).toBe(200);
  await page.clock.fastForward(60_000); await expect(page.locator("time").first()).not.toHaveAttribute("datetime", before);
  await page.route("**/api/datasets/region-latency", route => route.abort("failed"));
  await page.clock.fastForward(60_000); await expect(page.getByText("Dataset error", { exact: true })).toBeVisible(); await expect(page.getByText(/120/).first()).toBeVisible();
  await page.unroute("**/api/datasets/region-latency"); await page.clock.fastForward(60_000); await expect(page.getByText("Fresh measurements", { exact: true })).toBeVisible();
});
