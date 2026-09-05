import { test, expect } from "@playwright/test";
const card = (page, name = "Lighthouse") => page.getByRole("article", { name, exact: true });
const control = (page, name) => page.getByRole("button", { name, exact: true });
const area = async (page, name) => card(page, name).getAttribute("style");

async function newBoard(page, name) {
  await control(page, "+ New dashboard").click();
  await page.getByRole("textbox", { name: "Dashboard name" }).fill(name);
  await control(page, "Create dashboard").click();
  await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute("aria-selected", "true");
}
test.beforeEach(async ({ page }) => {
  await page.goto("/#workspace");
  await expect(page.getByRole("tab", { name: "Overview", exact: true })).toBeVisible();
});

test("create, rename, edit and reload preserve independent dashboards", async ({ page }) => {
  const original = await area(page);
  await newBoard(page, "Delivery");
  await control(page, "Rename").click();
  await page.getByRole("textbox", { name: "Dashboard name" }).fill("Release health");
  await control(page, "Save name").click();
  await expect(page.getByRole("tab", { name: "Release health", exact: true })).toHaveAttribute("aria-selected", "true");
  await control(page, "Edit layout").click();
  await page.getByRole("combobox", { name: "Height of Lighthouse", exact: true }).selectOption("7");
  const resized = await area(page);
  expect(resized).not.toBe(original);
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  expect(await area(page)).toBe(original);
  await page.getByRole("tab", { name: "Release health", exact: true }).click();
  expect(await area(page)).toBe(resized);
  await page.reload();
  await expect(page.getByRole("tab", { name: "Release health", exact: true })).toHaveAttribute("aria-selected", "true");
  expect(await area(page)).toBe(resized);
  await expect(control(page, "Edit layout")).toBeVisible();
});

test("names validate, cancel retains state, tabs and resize work from keyboard", async ({ page }) => {
  await newBoard(page, "Focus");
  await control(page, "Rename").click();
  await page.getByRole("textbox", { name: "Dashboard name" }).fill("Overview");
  await control(page, "Save name").click();
  await expect(page.getByRole("alert")).toHaveText("A dashboard with that name already exists.");
  await page.getByRole("textbox", { name: "Dashboard name" }).press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("tab", { name: "Focus", exact: true }).press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Overview", exact: true })).toHaveAttribute("aria-selected", "true");
  await control(page, "Edit layout").click();
  const before = await area(page);
  await control(page, "Resize Lighthouse").press("ArrowDown");
  expect(await area(page)).not.toBe(before);
  await control(page, "Undo").click();
  expect(await area(page)).toBe(before);
  await control(page, "Move Lighthouse later").click();
  expect(await page.locator("#dashboard-canvas > article").first().getAttribute("data-card-id")).toBe("web-vitals");
});

test("pointer resize and drop change geometry and retain every card", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Touch reorder has a dedicated test.");
  await control(page, "Edit layout").click();
  const before = await area(page);
  const resize = control(page, "Resize Lighthouse");
  await resize.scrollIntoViewIfNeeded();
  const box = await resize.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 75, box.y + 65, { steps: 8 });
  await page.mouse.up();
  expect(await area(page)).not.toBe(before);
  const move = control(page, "Move Core Web Vitals");
  await move.scrollIntoViewIfNeeded();
  const start = await move.boundingBox();
  const old = await area(page, "Core Web Vitals");
  await page.mouse.move(start.x + 20, start.y + 15);
  await page.mouse.down();
  await page.mouse.move(start.x - 160, start.y + 120, { steps: 10 });
  await page.mouse.up();
  expect(await area(page, "Core Web Vitals")).not.toBe(old);
  await expect(page.locator("#dashboard-canvas > article")).toHaveCount(7);
  const boxes = await page.locator("#dashboard-canvas > article").evaluateAll((cards) => cards.map((element) => {
    const rect = element.getBoundingClientRect(); return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom };
  }));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    expect(a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom).toBe(false);
  }
});

test("touch drag reorders the mobile stack and the page has no overflow", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile touch interaction.");
  await control(page, "Edit layout").click();
  const handle = control(page, "Move Lighthouse");
  await handle.scrollIntoViewIfNeeded();
  await card(page).evaluate((element) => element.scrollIntoView({ block: "start", behavior: "instant" }));
  const source = await handle.boundingBox();
  const target = await card(page, "Core Web Vitals").boundingBox();
  const session = await context.newCDPSession(page);
  const x = source.x + 25, y = source.y + 20;
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= 10; i++) {
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + (target.y + target.height / 2 + 15 - y) * i / 10 }] });
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.locator("#dashboard-canvas > article").first()).toHaveAttribute("data-card-id", "web-vitals");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect(page.getByRole("combobox", { name: "Width of Lighthouse", exact: true })).toBeDisabled();
});

test("light appearance and canvas controls remain coherent", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await control(page, "Theme: dark. Switch to light mode").click();
  await page.getByRole("link", { name: "Open the dashboard", exact: true }).click();
  await control(page, "Edit layout").click();
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(240, 238, 230)");
  await expect(card(page)).toHaveCSS("background-color", "rgb(250, 249, 245)");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("atlas-dashboard-light.png"), fullPage: false });
  expect(errors).toEqual([]);
});
