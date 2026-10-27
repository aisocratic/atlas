import { test, expect } from "@playwright/test";

test("product navigation opens the working demo and returns to features", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Your site, repo, and AI activity");
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Open menu", exact: true }).click();
    await page.getByRole("navigation", { name: "Menu", exact: true }).getByRole("link", { name: "Demo", exact: true }).click();
  } else {
    await page.getByRole("navigation", { name: "Primary", exact: true }).getByRole("link", { name: "Demo", exact: true }).click();
  }
  await expect(page).toHaveURL(/\/demo\/$/);
  await expect(page.getByRole("article")).toHaveCount(21);
  await page.getByRole("combobox", { name: "Dashboard date range", exact: true }).click();
  await page.getByRole("option", { name: "Last 7 days", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Dashboard date range", exact: true })).toContainText("Last 7 days");
  if (testInfo.project.name === "mobile") await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await page.getByRole("navigation", { name: "Primary", exact: true }).getByRole("link", { name: "Features", exact: true }).click();
  await expect(page).toHaveURL(/\/#features$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("previous preview links still open the interactive dashboard", async ({ page }, testInfo) => {
  await page.goto("/preview/");
  await expect(page.getByRole("article")).toHaveCount(21);
  if (testInfo.project.name === "mobile") await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Primary", exact: true }).getByRole("link", { name: "Demo", exact: true })).toHaveAttribute("href", "../demo/");
});

test("Sankey filters sources, updates the range, and expands", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/demo/");
  await page.locator(".analytics-filters").getByRole("button", { name: "Special charts", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(5);
  const card = page.locator('[data-card-id="visitor-flow"]');
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator(".sankey-flow-link").first()).toBeVisible();
  await card.locator(".sankey-flow-node").first().hover();
  await expect(card.getByRole("status", { name: "Selected chart values" })).toBeVisible();
  const total = await card.locator(".analytics-metric strong").innerText();
  await card.getByRole("combobox", { name: "Visitor flow date range" }).click();
  await page.getByRole("option", { name: "Last 7 days", exact: true }).click();
  await expect(card.locator(".analytics-metric strong")).not.toHaveText(total);
  for (const name of ["Direct", "Search", "Social", "Referral"]) await card.getByRole("button", { name, exact: true }).click();
  await expect(card.getByText("No visible measurements. Select a source below.")).toBeVisible();
  await card.getByRole("button", { name: "Search", exact: true }).click();
  await expect(card.locator(".sankey-flow-link").first()).toBeVisible();
  await card.getByRole("button", { name: "Expand Visitor flow", exact: true }).click();
  await expect(page.getByRole("dialog").locator(".sankey-flow-link").first()).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});

for (const { id, title, selector, names } of [
  { id: "activity-heatmap", title: "Activity heatmap", selector: "tbody button", names: ["Desktop App", "CLI", "Web"] },
  { id: "token-map", title: "Token usage", selector: ".token-tile", names: ["gpt-6-astra", "gpt-5.6-sol", "gpt-5.6-terra"] },
  { id: "page-health", title: "Page health", selector: ".recharts-scatter-symbol", names: ["/", "/blog", "/events", "/docs", "/pricing"] },
]) test(`${title} renders, filters and expands`, async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/demo/");
  await page.locator(".analytics-filters").getByRole("button", { name: "Special charts", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(5);
  const card = page.locator(`[data-card-id="${id}"]`);
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator(selector).first()).toBeVisible();
  if (id === "activity-heatmap") {
    await card.locator(selector).first().focus();
    await expect(card.getByRole("status")).toContainText("Mon 00:00 UTC");
  } else {
    await card.locator(selector).first().hover();
    await expect(card.getByRole("status", { name: "Selected chart values" })).toBeVisible();
  }
  await card.screenshot({ path: testInfo.outputPath(`${id}.png`) });
  const total = await card.locator(".analytics-metric strong").innerText();
  await card.getByRole("combobox", { name: `${title} date range` }).click();
  await page.getByRole("option", { name: "Last 7 days", exact: true }).click();
  await expect(card.locator(".analytics-metric strong")).not.toHaveText(total);
  for (const name of names) await card.getByRole("button", { name, exact: true }).click();
  await expect(card.getByText("No visible measurements. Select a series below.")).toBeVisible();
  await card.getByRole("button", { name: names[0], exact: true }).click();
  await expect(card.locator(selector).first()).toBeVisible();
  await card.getByRole("button", { name: `Expand ${title}`, exact: true }).click();
  await expect(page.getByRole("dialog").locator(selector).first()).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("Releases lane timeline packs lines, zooms, pans and filters by state", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/demo/");
  await page.locator(".analytics-filters").getByRole("button", { name: "Special charts", exact: true }).click();
  const card = page.locator('[data-card-id="releases"]');
  await card.scrollIntoViewIfNeeded();
  const bars = card.locator(".lane-timeline-bar");
  await expect(bars).toHaveCount(5);
  await expect(card.locator(".lane-timeline-labels")).toContainText("v1.x");
  await expect(card.locator(".lane-timeline-axis")).toContainText("Sample today");
  await card.locator('.lane-timeline-bar[data-item-id="v1:v1.3"]').hover();
  await expect(card.getByRole("dialog", { name: "v1.3" })).toContainText("After v1.2");
  await card.getByRole("button", { name: "30d", exact: true }).click();
  await expect(bars).toHaveCount(3);
  await card.getByRole("button", { name: "Earlier", exact: true }).click();
  await expect(card.locator(".lane-timeline-range")).toBeVisible();
  await card.getByRole("button", { name: "Sample today", exact: true }).click();
  await expect(card.locator(".lane-timeline-range")).toHaveCount(0);
  await card.getByRole("button", { name: "Fit", exact: true }).click();
  await card.getByRole("button", { name: "Superseded line", exact: true }).click();
  await expect(bars).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});
