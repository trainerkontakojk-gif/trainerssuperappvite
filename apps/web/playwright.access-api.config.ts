import { defineConfig } from "@playwright/test";

// API E2E only: no root dev server, no production database/provider targets.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  outputDir: "test-results/access-api",
  workers: 1,
  timeout: 120000,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/access-api.json" }],
  ],
  projects: [
    { name: "access-matrix", testMatch: "access-matrix-api.spec.ts" },
    { name: "access-schedule", testMatch: "sidak-jadwal-shifting-api.spec.ts" },
    { name: "access-scope", testMatch: "access-scope-api.spec.ts" },
  ],
});
