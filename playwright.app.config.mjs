import { authEnvironment } from "./tests/fixtures/auth.mjs"
import { defineConfig, devices } from "@playwright/test"

const schema = `atlas_app_${process.pid}`
process.env.ATLAS_AUTH_TEST_SCHEMA = schema
export default defineConfig({
  globalSetup: "./tests/auth-browser/setup.ts",
  testDir: "./tests/app",
  outputDir: "./test-results/app",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4180",
    channel: process.env.PLAYWRIGHT_CHANNEL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: "pnpm build && pnpm start --hostname 127.0.0.1 --port 4180",
    url: "http://127.0.0.1:4180",
    timeout: 120_000,
    reuseExistingServer: false,
    env: { ...authEnvironment(4180), DATABASE_URL: process.env.ATLAS_TEST_DATABASE_URL || "", ATLAS_SCHEMA: schema },
  },
})
