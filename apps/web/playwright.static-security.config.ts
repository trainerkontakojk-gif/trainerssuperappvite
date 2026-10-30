import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseURL = "http://127.0.0.1:3105";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/static-security.spec.ts",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm --dir apps/web start",
    url: baseURL,
    reuseExistingServer: false,
    cwd: path.resolve(__dirname, "../../"),
    env: {
      HOST: "127.0.0.1",
      PORT: "3105",
    },
    timeout: 60_000,
  },
});
