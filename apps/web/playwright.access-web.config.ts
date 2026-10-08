import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm --filter @trainers/web dev --host 127.0.0.1 --strictPort",
    url: "http://localhost:3005",
    reuseExistingServer: true,
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
  },
});
