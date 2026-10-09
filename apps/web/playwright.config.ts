import { defineConfig, devices } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import { E2E_WEB_SERVER_ENV } from "./e2e/helpers/e2eTargets";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  testDir: "./e2e",
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
      use: { ...devices["Desktop Chrome"] },
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
