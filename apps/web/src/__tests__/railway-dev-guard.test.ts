import { describe, it, expect } from "vitest";
import { execSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const guardPath = path.resolve(__dirname, "../../../../scripts/deployment/guard-no-railway-dev.mjs");

function runGuard(env?: Record<string, string>) {
  return spawnSync(process.execPath, [guardPath], {
    env: { ...process.env, ...env },
    stdio: "pipe",
    timeout: 5000,
  });
}

describe("railway-dev-guard", () => {
  it("allows execution when no Railway env vars are set", () => {
    const result = runGuard();
    expect(result.status).toBe(0);
    expect(result.stderr.toString()).toBe("");
  });

  it("blocks execution when RAILWAY_DEPLOYMENT_ID is set", () => {
    const result = runGuard({ RAILWAY_DEPLOYMENT_ID: "test" });
    expect(result.status).toBe(1);
    expect(result.stderr.toString()).toContain("Refusing to run Vite dev server on Railway");
  });

  it("blocks execution when RAILWAY_ENVIRONMENT is set", () => {
    const result = runGuard({ RAILWAY_ENVIRONMENT: "production" });
    expect(result.status).toBe(1);
    expect(result.stderr.toString()).toContain("Refusing to run Vite dev server on Railway");
  });

  it("blocks execution when RAILWAY_SERVICE_ID is set", () => {
    const result = runGuard({ RAILWAY_SERVICE_ID: "test" });
    expect(result.status).toBe(1);
    expect(result.stderr.toString()).toContain("Refusing to run Vite dev server on Railway");
  });

  it("blocks execution when RAILWAY_PROJECT_ID is set", () => {
    const result = runGuard({ RAILWAY_PROJECT_ID: "test" });
    expect(result.status).toBe(1);
    expect(result.stderr.toString()).toContain("Refusing to run Vite dev server on Railway");
  });
});
