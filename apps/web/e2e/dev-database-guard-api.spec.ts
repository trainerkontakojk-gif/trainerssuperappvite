import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * API dan Telefun yang dijalankan di luar server produksi (laptop, Codex)
 * menolak menyala bila Supabase-nya proyek produksi, kecuali sengaja
 * diizinkan dengan ALLOW_PROD_DB_IN_DEV=1. Railway dan Vercel tetap menyala.
 * Proses dijalankan sungguhan; semua akses jaringan non-loopback diblokir.
 */

const PROD_URL = "https://ruosnjmtywcrghjgqugz.supabase.co";
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const DENY_EGRESS = fileURLToPath(
  new URL("./helpers/denyEgress.mjs", import.meta.url),
);
const HOSTED_KEYS = [
  "RAILWAY_ENVIRONMENT",
  "RAILWAY_PROJECT_ID",
  "RAILWAY_SERVICE_ID",
  "RAILWAY_DEPLOYMENT_ID",
  "VERCEL",
  "ALLOW_PROD_DB_IN_DEV",
];

type Service = "api" | "telefun";

const SERVICES: Record<
  Service,
  { entry: string; cwd: string; env: Record<string, string> }
> = {
  api: {
    entry: "apps/api/src/index.ts",
    cwd: ROOT,
    env: {
      PORT: "0",
      VITE_SUPABASE_URL: PROD_URL,
      VITE_SUPABASE_ANON_KEY: "e2e-anon",
      SUPABASE_ANON_KEY: "e2e-anon",
      SUPABASE_SERVICE_ROLE_KEY: "e2e-service",
      GEMINI_API_KEY: "e2e-gemini",
      OPENAI_API_KEY: "e2e-openai",
    },
  },
  telefun: {
    entry: "apps/telefun/src/server.ts",
    cwd: `${ROOT}apps/telefun`,
    env: {
      PORT: "0",
      SUPABASE_URL: PROD_URL,
      SUPABASE_ANON_KEY: "e2e-anon",
      SUPABASE_SERVICE_ROLE_KEY: "e2e-service",
      GEMINI_API_KEY: "e2e-gemini",
    },
  },
};

/**
 * Jalankan layanan sampai keluar atau `aliveMs` berlalu. Mengembalikan kode
 * keluar (null bila masih menyala lalu dihentikan) dan seluruh log.
 */
function boot(
  service: Service,
  extra: Record<string, string>,
  aliveMs = 4000,
): Promise<{ code: number | null; log: string }> {
  const { entry, cwd, env } = SERVICES[service];
  const inherited = { ...process.env };
  for (const key of HOSTED_KEYS) delete inherited[key];
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "--import", DENY_EGRESS, `${ROOT}${entry}`],
    {
      cwd,
      env: { ...inherited, NODE_ENV: "development", ...env, ...extra },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let log = "";
  child.stdout.on("data", (data) => (log += String(data)));
  child.stderr.on("data", (data) => (log += String(data)));
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ code: null, log });
    }, aliveMs);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, log });
    });
  });
}

for (const service of ["api", "telefun"] as const) {
  test(`${service}: database produksi di luar server produksi ditolak sebelum ada akses jaringan`, async () => {
    const { code, log } = await boot(service, {}, 15000);
    expect(code, log).toBe(1);
    expect(log).toContain("database produksi");
    expect(log).toContain("ALLOW_PROD_DB_IN_DEV=1");
    expect(log).not.toContain("[egress-denied]");
  });

  test(`${service}: ALLOW_PROD_DB_IN_DEV=1 menyala dengan peringatan`, async () => {
    const { code, log } = await boot(service, { ALLOW_PROD_DB_IN_DEV: "1" });
    expect(code, log).toBeNull();
    expect(log).toContain("sengaja memakai database produksi");
  });

  test(`${service}: di Railway tetap menyala tanpa peringatan`, async () => {
    const { code, log } = await boot(service, {
      RAILWAY_ENVIRONMENT: "production",
    });
    expect(code, log).toBeNull();
    expect(log).not.toContain("database produksi");
  });
}
