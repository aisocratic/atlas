// Public test credentials only. Never use these in a deployment.
export const password = "atlas-browser-test-password";
export const sessionSecret = "atlas-browser-test-session-secret-at-least-32-characters";
export const collectorToken = "atlas-browser-test-collector-token-at-least-32-characters";
export function authEnvironment(port) {
  return {
    NODE_ENV: "production", ATLAS_AUTH: "password", ATLAS_PASSWORD: password,
    ATLAS_SESSION_SECRET: sessionSecret, ATLAS_COLLECTOR_TOKEN: collectorToken,
    ATLAS_APP_URL: `http://127.0.0.1:${port}`, ATLAS_SITE_URL: "https://example.com",
  };
}
export async function signIn(page) {
  await page.goto("/login");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("/");
}
