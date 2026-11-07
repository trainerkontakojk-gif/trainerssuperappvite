import { defineConfig, devices } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import { E2E_WEB_SERVER_ENV } from "./e2e/helpers/e2eTargets";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  testDir: "./e2e",
  // API specs run under playwright.api.config.ts / playwright.access-api.config.ts,
  // one project per env. Sharing this single worker leaks one spec's API env
  // stubs into the next. static-security.spec.ts checks the built static server
  // (`pnpm start`, serve-static.mjs) and has its own config,
  // playwright.static-security.config.ts; the Vite dev server here never sends
  // those headers.
  testIgnore: ["**/*-api.spec.ts", "**/static-security.spec.ts"],
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3005",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      // Installed Chrome stable, not the bundled Chromium: Playwright 1.64.1 bundles
      // Chrome for Testing 156.0.8078.4, which predates Chrome's late-October
      // security fixes. Return to the bundled build once a release ships a patched one.
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
  // Web dev server only, with E2E env: never the root `pnpm dev`, whose API
  // and Telefun run against the production project from the root `.env`.
  // Never reuse a server on :3005 either; its env cannot be verified.
  webServer: {
    command: "pnpm --filter @trainers/web dev --host 127.0.0.1 --strictPort",
    url: "http://localhost:3005",
    reuseExistingServer: false,
    env: E2E_WEB_SERVER_ENV,
    cwd: path.resolve(__dirname, "../../"),
    timeout: 60000,
  },
});
