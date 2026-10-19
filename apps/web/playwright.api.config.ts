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
    {
      name: "pdkt-resilience-real-backend",
      testMatch: "pdkt-resilience-api.spec.ts",
    },
    {
      name: "pdkt-review-evidence-real-backend",
      testMatch: "pdkt-review-evidence-api.spec.ts",
    },
    {
      name: "ketik-review-worker-real-backend",
      testMatch: "ketik-review-worker-api.spec.ts",
    },
    {
      // Same spec, worker embedded in the real API process (see the spec header).
      name: "ketik-review-worker-embedded-real-backend",
      testMatch: "ketik-review-worker-api.spec.ts",
    },
    {
      name: "ketik-history-real-backend",
      testMatch: "ketik-history-api.spec.ts",
    },
    {
      name: "telefun-month-count-real-backend",
      testMatch: "telefun-month-count-api.spec.ts",
    },
    {
      name: "telefun-scoring-real-backend",
      testMatch: "telefun-scoring-api.spec.ts",
    },
    {
      name: "scenario-attachments-real-backend",
      testMatch: "scenario-attachments-api.spec.ts",
    },
    {
      name: "user-controls-real-backend",
      testMatch: ["user-controls-api.spec.ts", "account-controls-api.spec.ts"],
    },
    { name: "gate-stub", testMatch: "access-matrix-api.spec.ts" },
    { name: "dev-database-guard", testMatch: "dev-database-guard-api.spec.ts" },
    {
      name: "pdkt-consumer-email-stub",
      testMatch: "pdkt-consumer-email-api.spec.ts",
    },
    { name: "rate-limit-stub", testMatch: "rate-limit-client-ip-api.spec.ts" },
    {
      name: "ketik-integrity-real-backend",
      testMatch: "ketik-integrity-api.spec.ts",
    },
    {
      name: "ketik-errors-real-backend",
      testMatch: "ketik-errors-api.spec.ts",
    },
    {
      name: "ketik-assignment-real-backend",
      testMatch: "ketik-assignment-api.spec.ts",
    },
    {
      name: "ketik-session-real-backend",
      testMatch: "ketik-session-api.spec.ts",
    },
    {
      name: "ketik-consumer-prompt-real-backend",
      testMatch: "ketik-consumer-prompt-api.spec.ts",
    },
    { name: "tna-real-backend", testMatch: "tna-*-api.spec.ts" },
    {
      name: "user-peserta-link-real-backend",
      testMatch: "user-peserta-link-api.spec.ts",
    },
    {
      name: "practice-quota-real-backend",
      testMatch: "practice-quota-api.spec.ts",
    },
    {
      name: "practice-limits-real-backend",
      testMatch: "practice-limits-admin-api.spec.ts",
    },
    {
      name: "db-guard-real-backend",
      testMatch: "exposed-function-guard-api.spec.ts",
    },
    { name: "sidak-temuan-dates", testMatch: "sidak-temuan-dates-api.spec.ts" },
    {
      name: "sidak-unmapped-indicator-real-backend",
      testMatch: "sidak-unmapped-indicator-api.spec.ts",
    },
    {
      name: "sidak-dashboard-kpi-real-backend",
      testMatch: "sidak-dashboard-kpi-api.spec.ts",
    },
    {
      name: "sidak-temuan-tahun-trigger-real-backend",
      testMatch: "sidak-temuan-tahun-trigger-api.spec.ts",
    },
    {
      name: "prod-parity-triggers-real-backend",
      testMatch: "prod-parity-triggers-api.spec.ts",
    },
    {
      name: "monitoring-legacy-results-real-backend",
      testMatch: "monitoring-legacy-results-api.spec.ts",
    },
    {
      name: "monitoring-numbers-real-backend",
      testMatch: "monitoring-numbers-api.spec.ts",
    },
    {
      name: "monitoring-pricing-schedule-real-backend",
      testMatch: "monitoring-pricing-schedule-api.spec.ts",
    },
    {
      name: "monitoring-riwayat-real-backend",
      testMatch: "monitoring-riwayat-api.spec.ts",
    },
    {
      name: "monitoring-biaya-real-backend",
      testMatch: "monitoring-biaya-api.spec.ts",
    },
    {
      name: "home-attention-real-backend",
      testMatch: "home-attention-api.spec.ts",
    },
    {
      name: "telefun-schema-real-backend",
      testMatch: "telefun-schema-contract-api.spec.ts",
    },
    {
      name: "pdkt-evaluation-errors-real-backend",
      testMatch: "pdkt-evaluation-error-api.spec.ts",
    },
    {
      name: "pdkt-privacy-real-backend",
      testMatch: "pdkt-mailbox-privacy-api.spec.ts",
    },
  ],
});
