import { defineConfig, devices } from "@playwright/test";
import { authEnvironment } from "./tests/fixtures/auth.mjs";
const schema = `atlas_canvas_e2e_${process.pid}`;
process.env.ATLAS_AUTH_TEST_SCHEMA = schema;
export default defineConfig({
  testDir: "./tests/canvas-browser", outputDir: "./test-results/canvas", globalSetup: "./tests/auth-browser/setup.ts",
  fullyParallel: false, workers: 1, forbidOnly: Boolean(process.env.CI), retries: 0, reporter: "list",
  use: { baseURL: "http://127.0.0.1:4182", channel: process.env.PLAYWRIGHT_CHANNEL, trace: "retain-on-failure" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1100 } } }, { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } }],
  webServer: [
    { command: "pnpm exec tsx tests/canvas-browser/provider.mjs", url: "http://127.0.0.1:4183/health", timeout: 30_000, reuseExistingServer: false },
    { command: "pnpm build && pnpm start --hostname 127.0.0.1 --port 4182", url: "http://127.0.0.1:4182/login", timeout: 120_000, reuseExistingServer: false, env: { ...authEnvironment(4182), DATABASE_URL: process.env.ATLAS_TEST_DATABASE_URL || "", ATLAS_SCHEMA: schema, ATLAS_SITE_URL: "https://canvas.example.test/", GLOBALPING_API_URL: "http://127.0.0.1:4183/v1/" } },
  ],
});
