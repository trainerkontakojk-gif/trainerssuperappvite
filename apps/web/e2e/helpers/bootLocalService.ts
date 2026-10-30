import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { expect } from "@playwright/test";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const PRELOAD = fileURLToPath(
  new URL("./geminiProxyBoot.mjs", import.meta.url),
);

export type LocalService = "api" | "telefun";

// Boots the real API or Telefun entrypoint on loopback. The preload denies
// non-loopback egress and reports the bound port as `[e2e-listening] <port>`.
export function bootLocalService(
  service: LocalService,
  supabaseUrl: string,
  extraEnv: NodeJS.ProcessEnv = {},
) {
  // Allowlist only OS runtime paths; never inherit credentials, hosted flags,
  // worker enablement, proxy settings or provider targets from the parent.
  const env: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "HOME", "TMPDIR", "SYSTEMROOT"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  Object.assign(
    env,
    {
      NODE_ENV: "test",
      PORT: "0",
      SUPABASE_URL: supabaseUrl,
      VITE_SUPABASE_URL: supabaseUrl,
      VITE_SUPABASE_ANON_KEY: "e2e-anon",
      SUPABASE_ANON_KEY: "e2e-anon",
      SUPABASE_SERVICE_ROLE_KEY: "e2e-service",
      GEMINI_API_KEY: "e2e-gemini-secret",
      OPENAI_API_KEY: "e2e-openai",
      ALLOWED_ORIGINS: "http://127.0.0.1:3005",
      TELEFUN_SCORING_WORKER_ENABLED: "false",
      KETIK_REVIEW_WORKER_ENABLED: "false",
    },
    extraEnv,
  );
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      "--import",
      PRELOAD,
      `${ROOT}apps/${service}/src/${service === "api" ? "index" : "server"}.ts`,
    ],
    {
      cwd: service === "api" ? ROOT : `${ROOT}apps/telefun`,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let log = "";
  child.stdout.on("data", (data) => (log += String(data)));
  child.stderr.on("data", (data) => (log += String(data)));
  const exited = once(child, "exit");
  return {
    child,
    exited,
    log: () => log,
    async url() {
      await expect
        .poll(() => log.match(/\[e2e-listening\] (\d+)/)?.[1], {
          timeout: 15000,
          message: "Service must listen locally",
        })
        .toBeTruthy();
      return `http://127.0.0.1:${log.match(/\[e2e-listening\] (\d+)/)![1]}`;
    },
    async close() {
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
      await exited;
    },
  };
}
