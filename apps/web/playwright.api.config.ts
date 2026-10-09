import { defineConfig } from "@playwright/test";

// Explicit API-only verification: no root dev servers or inherited frontend/
// provider targets. Real-backend specs guard their Supabase endpoints as loopback.
//
// The two projects must stay separate. The access-matrix spec points the API's
// Supabase env at a local stub, and API modules read that env once at import.
// Playwright never shares a worker process between projects, so each project
// imports the API with its own env.
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60000,
  reporter: "list",
  outputDir: "./test-results/api",
  projects: [
    { name: "gate-stub", testMatch: "access-matrix-api.spec.ts" },
    { name: "tna-real-backend", testMatch: "tna-*-api.spec.ts" },
    {
      name: "db-guard-real-backend",
      testMatch: "exposed-function-guard-api.spec.ts",
    },
  ],
});
