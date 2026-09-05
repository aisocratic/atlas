import { defineConfig, devices } from "@playwright/test";
import { authEnvironment } from "./tests/fixtures/auth.mjs";
const schema = `atlas_auth_${process.pid}`;
process.env.ATLAS_AUTH_TEST_SCHEMA = schema;
export default defineConfig({
  testDir: "./tests/auth-browser", outputDir: "./test-results/auth", globalSetup: "./tests/auth-browser/setup.ts",
  fullyParallel: false, workers: 1, forbidOnly: Boolean(process.env.CI), retries: 0, reporter: "list",
  use: { baseURL: "http://127.0.0.1:4190", channel: process.env.PLAYWRIGHT_CHANNEL, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    { command: "pnpm build && pnpm start --hostname 127.0.0.1 --port 4190", url: "http://127.0.0.1:4190/login", timeout: 120_000, reuseExistingServer: false,
      env: { ...authEnvironment(4190), DATABASE_URL: process.env.ATLAS_TEST_DATABASE_URL || "", ATLAS_SCHEMA: schema } },
    { command: "pnpm start --hostname 127.0.0.1 --port 4191", url: "http://127.0.0.1:4191/setup", timeout: 30_000, reuseExistingServer: false,
      env: { NODE_ENV: "production", ATLAS_AUTH: "open", DATABASE_URL: "", ATLAS_SITE_URL: "" } },
  ],
});
