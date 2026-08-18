import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_WEB_PORT ?? "4174");
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/web-audio-live.spec.ts"],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // The specs share one Vite server and one local Convex/Auth backend; one
  // worker avoids cross-test auth/socket races while keeping this small suite
  // fast enough for local gates.
  workers: 1,
  reporter: process.env.CI ? "html" : "line",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm dev --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
