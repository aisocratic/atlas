import { signIn } from "../fixtures/auth.mjs"
import { test, expect } from "@playwright/test"

const themeButton = (page, name) => page.getByRole("group", { name: "Color theme" }).filter({ visible: true }).getByRole("button", { name, exact: true })

test("shared chrome, font slots and semantic telemetry render without external font requests", async ({ page }, testInfo) => {
  const errors = []
  const remoteRequests = []
  page.on("pageerror", error => errors.push(error.message))
  page.on("request", request => { if (!request.url().startsWith("http://127.0.0.1:4180/")) remoteRequests.push(request.url()) })
  await signIn(page)
  if (await page.getByRole("button", { name: "Create dashboard", exact: true }).isVisible()) {
    await page.getByRole("button", { name: "Create dashboard", exact: true }).click()
    await page.getByRole("dialog").getByLabel("Dashboard name").fill(`${testInfo.project.name} typography`)
    await page.getByRole("dialog").getByRole("button", { name: "Create", exact: true }).click()
  }
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByRole("heading", { name: "Engineering telemetry" })).toBeVisible()
  await expect(page.getByRole("banner").getByRole("link", { name: "Atlas home" })).toBeVisible()
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Documentation" })).toBeVisible()
  await expect(page.getByRole("region", { name: "Region latency" })).toBeVisible()

  const styles = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement)
    const slots = ["body", "display", "code"].map(role => root.getPropertyValue(`--aisocratic-font-${role}`).trim())
    return {
      slots,
      families: [document.body, document.querySelector("h1"), document.querySelector(".font-code")].map(element => getComputedStyle(element).fontFamily),
      loaded: [...document.fonts].filter(font => font.status === "loaded").length,
      overflow: document.documentElement.scrollWidth > innerWidth,
      cardRadius: getComputedStyle(document.querySelector("article[data-tile]")).borderRadius,
    }
  })
  expect(styles.slots.every(Boolean)).toBe(true)
  // CSSOM drops optional quotes around simple family names.
  styles.families.forEach((family, index) => expect(family.replaceAll('"', "")).toBe(styles.slots[index].replaceAll('"', "")))
  expect(styles.loaded).toBeGreaterThanOrEqual(3)
  expect(styles.overflow).toBe(false)
  expect(styles.cardRadius).not.toBe("0px")
  expect(errors).toEqual([])
  expect(remoteRequests).toEqual([])
  await page.screenshot({ path: testInfo.outputPath("substrate.png"), fullPage: true })
})

test("system appearance follows the OS and explicit choices persist across reload", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" })
  await signIn(page)
  await expect(page.locator("html")).toHaveClass(/\blight\b/)
  await expect(themeButton(page, "System")).toHaveAttribute("aria-pressed", "true")
  const lightBackground = await page.locator("body").evaluate(element => getComputedStyle(element).backgroundColor)

  await page.emulateMedia({ colorScheme: "dark" })
  await expect(page.locator("html")).toHaveClass(/\bdark\b/)
  const darkBackground = await page.locator("body").evaluate(element => getComputedStyle(element).backgroundColor)
  expect(darkBackground).not.toBe(lightBackground)

  await themeButton(page, "Light").click()
  await expect(page.locator("html")).toHaveClass(/\blight\b/)
  await page.reload()
  await expect(themeButton(page, "Light")).toHaveAttribute("aria-pressed", "true")
  await expect(page.locator("html")).toHaveClass(/\blight\b/)

  await themeButton(page, "Dark").focus()
  await page.keyboard.press("Enter")
  await expect(page.locator("html")).toHaveClass(/\bdark\b/)
  await page.emulateMedia({ colorScheme: "light" })
  await expect(page.locator("html")).toHaveClass(/\bdark\b/)
  await themeButton(page, "System").click()
  await expect(page.locator("html")).toHaveClass(/\blight\b/)
  await expect(themeButton(page, "System")).toHaveAttribute("aria-pressed", "true")
})
