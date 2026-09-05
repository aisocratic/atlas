import { defineConfig, devices } from "@playwright/test";
import { authEnvironment } from "./tests/fixtures/auth.mjs";
const schema = `atlas_demo_e2e_${process.pid}`;
process.env.ATLAS_DEMO_TEST_SCHEMA = schema;
export default defineConfig({
  testDir: "./tests/demo-browser", outputDir: "./test-results/demo-browser", globalSetup: "./tests/demo-browser/setup.ts",
  fullyParallel: false, workers: 1, forbidOnly: Boolean(process.env.CI), retries: 0, reporter: "list",
  use: { baseURL: "http://127.0.0.1:4187", channel: process.env.PLAYWRIGHT_CHANNEL, trace: "retain-on-failure" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1100 } } }, { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } }],
  webServer: { command: "pnpm build && pnpm start --hostname 127.0.0.1 --port 4187", url: "http://127.0.0.1:4187/login", timeout: 180_000, reuseExistingServer: false, env: { ...authEnvironment(4187), DATABASE_URL: process.env.ATLAS_TEST_DATABASE_URL || "", ATLAS_DEMO: "true", ATLAS_DEMO_SCHEMA: schema, ATLAS_SITE_URL: "" } },
});
