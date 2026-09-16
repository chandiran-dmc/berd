import { defineConfig } from "@playwright/test";

// Development origin is intentional: production tldraw requires a license key.
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "canvas.spec.ts",
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:1530",
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL,
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev --port 1530 --host 127.0.0.1",
    url: "http://127.0.0.1:1530",
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1",
  },
});
