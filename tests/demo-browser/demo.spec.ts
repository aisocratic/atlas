import { test, expect } from "@playwright/test"
import { signIn, collectorToken } from "../fixtures/auth.mjs"
import { cardRegistry } from "../../cards/registry"
test("demo authenticates, renders all fixtures and preserves dashboard edits", async ({ page, request }, info) => {
  expect((await request.get("/api/datasets/releases")).status()).toBe(401)
  await signIn(page)
  await expect(page.getByRole("complementary", { name: "Demo mode" })).toContainText("synthetic data")
  await page.getByRole("button", { name: /New dashboard/ }).first().click()
  await page.getByLabel("Dashboard name", { exact: true }).fill(`Demo ${info.project.name}`)
  await page.getByRole("button", { name: "Create", exact: true }).click()
  await expect(page.getByText("Synthetic fixture · fixed dates").first()).toBeVisible()
  for (const button of await page.getByRole("button", { name: "Collect now", exact: true }).all()) await expect(button).toBeDisabled()
  await page.reload()
  await expect(page.getByRole("tab", { name: `Demo ${info.project.name}`, exact: true })).toHaveAttribute("aria-selected", "true")
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  for (const card of cardRegistry) {
    const response = await page.evaluate(async id => { const response = await fetch(`/api/datasets/${id}`); return { status: response.status, body: await response.json() } }, card.id)
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ status: "ready", provenance: "synthetic", stale: false, run: null })
    await page.goto(`/cards/${card.id}`)
    await expect(page.getByRole("heading", { name: card.title, exact: true })).toBeVisible()
    await expect(page.getByText("Demo · synthetic fixture · fixed sample dates", { exact: true })).toBeVisible()
    await expect(page.getByRole("complementary", { name: "Demo mode" })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  const empty = await page.evaluate(async () => (await fetch("/api/datasets/releases?since=2027-01-01")).json())
  expect(empty).toMatchObject({ status: "empty", provenance: "synthetic" })
  const collect = await request.post("/api/collect/releases", { headers: { Authorization: `Bearer ${collectorToken}` } })
  expect(collect.status()).toBe(422)
  expect(await collect.json()).toMatchObject({ status: "unsupported" })
  expect((await request.post("/api/ingest/vitals", { data: {} })).status()).toBe(403)
})
