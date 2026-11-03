import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { E2E_WEB_SERVER_ENV } from "./e2e/helpers/e2eTargets";

export default defineConfig({
  testDir: "./e2e",
  testMatch: [
    "authenticated-shell.spec.ts",
    "sidebar-nav-state.spec.ts",
    "sidak-reports-removed.spec.ts",
  ],
  outputDir: "test-results/access-web",
  workers: 1,
  timeout: 60000,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/access-web.json" }],
  ],
  use: { baseURL: "http://localhost:3005", trace: "retain-on-failure" },
  // Installed Chrome stable, not the bundled Chromium: Playwright 1.64.1 bundles
  // Chrome for Testing 156.0.8078.4, which predates Chrome's late-October
  // security fixes. Return to the bundled build once a release ships a patched one.
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
  webServer: {
    command: "pnpm --filter @trainers/web dev --host 127.0.0.1 --strictPort",
    url: "http://localhost:3005",
    reuseExistingServer: false,
    env: E2E_WEB_SERVER_ENV,
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
  },
});
