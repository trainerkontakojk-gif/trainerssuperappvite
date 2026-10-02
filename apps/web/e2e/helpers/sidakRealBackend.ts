/**
 * Backend Hono NYATA in-process untuk E2E integrasi browser.
 *
 * Menyediakan:
 *   - pembacaan `.env.integration` loopback fail-closed (tanpa mencetak nilai),
 *   - admin service-role untuk fixture/cleanup lokal,
 *   - helper psql untuk membaca/membersihkan fixture milik run ini,
 *   - user JWT nyata (Supabase local) untuk RLS,
 *   - app Hono berisi router temuan + heatmap ASLI dengan identity/JWT disuntik,
 *   - guard `globalThis.fetch` fail-closed untuk egress non-loopback.
 *
 * Bukan mock: request yang diteruskan dari browser benar-benar dieksekusi oleh
 * kode produk dengan database lokal disposable.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const INTEGRATION_ENV = path.join(REPO_ROOT, "apps/api/.env.integration");

export type LoopbackEnv = {
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  dbUrl: string;
};

function assertLoopback(host: string, label: string): void {
  if (
    host !== "127.0.0.1" &&
    host !== "localhost" &&
    host !== "::1" &&
    host !== "[::1]"
  ) {
    throw new Error(
      `[e2e guard] ${label} menunjuk ke host NON-loopback: ${host}.`,
    );
  }
}

export function readLoopbackEnv(): LoopbackEnv {
  if (!existsSync(INTEGRATION_ENV)) {
    throw new Error("apps/api/.env.integration tidak ada");
  }
  const raw = readFileSync(INTEGRATION_ENV, "utf8");
  const value = (key: string) =>
    raw.match(new RegExp(`^${key}=(.+)$`, "m"))?.[1]?.trim();
  const apiUrl = value("SUPABASE_URL");
  const dbUrl = value("SUPABASE_DB_URL");
  if (!apiUrl || !dbUrl) throw new Error("apps/api/.env.integration tidak lengkap");

  assertLoopback(new URL(apiUrl).hostname, "SUPABASE_URL");
  assertLoopback(dbUrl.replace(/^[a-z]+:\/\//i, "").replace(/^[^@/]*@/, "").split(/[/:]/)[0]!, "SUPABASE_DB_URL");

  return {
    apiUrl,
    anonKey: value("SUPABASE_ANON_KEY") ?? "",
    serviceRoleKey: value("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    dbUrl,
  };
}

export function createAdmin(env: LoopbackEnv): SupabaseClient {
  return createClient(env.apiUrl, env.serviceRoleKey, {
    auth: { persistSession: false },
  });
}

export function runSql(env: LoopbackEnv, query: string): string {
  return execFileSync(
    "psql",
    [env.dbUrl, "-v", "ON_ERROR_STOP=1", "-q", "-tAc", query],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

export function sqlOne(env: LoopbackEnv, query: string): string {
  const lines = runSql(env, query)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length !== 1) {
    throw new Error(`Diharapkan 1 baris, dapat ${lines.length}: ${query.slice(0, 100)}`);
  }
  return lines[0]!;
}

/** Install guard fetch fail-closed sekali per proses worker. */
export function installLoopbackFetchGuard(): void {
  const KEY = Symbol.for("trainers.sidak.realBackend.e2eGuard");
  const scope = globalThis as typeof globalThis & {
    [KEY]?: { originalFetch: typeof globalThis.fetch; installed: boolean };
  };
  const state = (scope[KEY] ??= {
    originalFetch: globalThis.fetch,
    installed: false,
  });
  if (state.installed) return;
  globalThis.fetch = (async (input: any, init?: any) => {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input?.url ?? String(input));
    let loopback: boolean;
    try {
      const host = new URL(raw).hostname;
      loopback =
        host === "127.0.0.1" ||
        host === "localhost" ||
        host === "::1" ||
        host === "[::1]";
    } catch {
      loopback = false;
    }
    if (!loopback) {
      throw new Error(`[e2e guard] egress non-loopback diblokir: ${raw}`);
    }
    return state.originalFetch(input, init);
  }) as typeof fetch;
  state.installed = true;
}

export type RealIdentity = {
  userId: string;
  email: string;
  role: string;
  fullName: string;
  token: string;
};

const ENV_KEYS_PINNED = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

/** Buat user Supabase lokal + profil role, kembalikan JWT-nya. */
export async function createUserWithJwt(
  env: LoopbackEnv,
  role: "trainer" | "leader" | "admin" | "agent",
  suffix: string,
): Promise<{ userId: string; token: string; email: string }> {
  const email = `e2e-browser-${role}-${suffix}@local.test`;
  // Kata sandi acak per run: bukan rahasia bersama, hanya untuk user lokal
  // sekali pakai yang dihapus di afterAll.
  const password = `Probe-${Math.random().toString(36).slice(2)}-Passw0rd!`;
  const created = await createAdmin(env).auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {},
  });
  if (created.error) throw created.error;
  const userId = created.data.user!.id;
  const { error: profileError } = await createAdmin(env)
    .from("profiles")
    .upsert({
      id: userId,
      email,
      full_name: `E2E ${role}`,
      role,
      status: "active",
      is_deleted: false,
    });
  if (profileError) throw profileError;

  const client = createClient(env.apiUrl, env.anonKey, {
    auth: { persistSession: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  return { userId, token: signedIn.data.session!.access_token, email };
}

/**
 * App Hono berisi router temuan + heatmap ASLI. Identity/JWT disuntik seperti
 * authMiddleware produksi; heatmap tetap memakai JWT user sehingga RLS berlaku.
 */
export async function createRealSidakApp(
  env: LoopbackEnv,
  identity: RealIdentity,
): Promise<{
  request: (
    pathAndQuery: string,
    init: { method: string; headers?: Record<string, string>; body?: string },
  ) => Promise<{ status: number; bodyText: string }>;
}> {
  const saved = ENV_KEYS_PINNED.map((key) => [key, process.env[key]] as const);
  process.env.VITE_SUPABASE_URL = env.apiUrl;
  process.env.VITE_SUPABASE_ANON_KEY = env.anonKey;
  process.env.SUPABASE_ANON_KEY = env.anonKey;
  process.env.SUPABASE_SERVICE_ROLE_KEY = env.serviceRoleKey;

  let temuan: unknown;
  let heatmap: unknown;
  try {
    ({ sidakTemuan: temuan } = await import(
      "../../../api/src/routes/sidak/temuan"
    ));
    ({ sidakHeatmap: heatmap } = await import(
      "../../../api/src/routes/sidak/heatmap"
    ));
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  const app = new Hono<{
    Variables: { user: unknown; profile: unknown; token: string };
  }>()
    .use("*", async (c, next) => {
      c.set("user", { id: identity.userId, email: identity.email });
      c.set("profile", { role: identity.role, full_name: identity.fullName });
      c.set("token", identity.token);
      await next();
    })
    .route("/v1/sidak", temuan as never)
    .route("/v1/sidak", heatmap as never);

  return {
    request: async (pathAndQuery, init) => {
      const res = await app.request(`http://local.test${pathAndQuery}`, init);
      const bodyText = await res.text();
      return { status: res.status, bodyText };
    },
  };
}
