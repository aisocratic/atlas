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
  await expect(page.getByRole("article")).toHaveCount(16);
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
  await expect(page.getByRole("article")).toHaveCount(16);
  if (testInfo.project.name === "mobile") await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Primary", exact: true }).getByRole("link", { name: "Demo", exact: true })).toHaveAttribute("href", "../demo/");
});
