import { defineConfig, devices } from "@playwright/test";
import { authEnvironment } from "./tests/fixtures/auth.mjs";
const schema = `atlas_collectors_e2e_${process.pid}`;
process.env.ATLAS_AUTH_TEST_SCHEMA = schema;
export default defineConfig({
  testDir: "./tests/collectors-browser", outputDir: "./test-results/collectors-browser", globalSetup: "./tests/auth-browser/setup.ts",
  fullyParallel: false, workers: 1, forbidOnly: Boolean(process.env.CI), retries: 0, reporter: "list",
  use: { baseURL: "http://127.0.0.1:4184", channel: process.env.PLAYWRIGHT_CHANNEL, trace: "retain-on-failure" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1100 } } }, { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } }],
  webServer: [
    { command: "node tests/collectors-browser/provider.mjs", url: "http://127.0.0.1:4185/health", timeout: 30_000, reuseExistingServer: false },
    { command: "pnpm build && pnpm start --hostname 127.0.0.1 --port 4184", url: "http://127.0.0.1:4184/login", timeout: 180_000, reuseExistingServer: false, env: { ...authEnvironment(4184), DATABASE_URL: process.env.ATLAS_TEST_DATABASE_URL || "", ATLAS_SCHEMA: schema, ATLAS_SITE_URL: "http://127.0.0.1:4185/", ATLAS_REPOSITORY: "atlas/browser", PAGESPEED_API_URL: "http://127.0.0.1:4185/pagespeed", GITHUB_API_URL: "http://127.0.0.1:4185/", ATLAS_RUM_WRITE_KEY: "public-browser-e2e-write-key", ATLAS_ERRORS_WRITE_TOKEN: "private-server-e2e-write-token-32characters" } },
  ],
});
