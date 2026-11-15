// Shared by the monitoring-models-api-*.spec.ts files.
import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import type { Hono } from "hono";
import { tnaApiRequest } from "./tnaApi";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
  runSql,
} from "./sidakRealBackend";

export const env = readLoopbackEnv();

// Re-drawn by setupModelPolicySuite() so each spec file uses its own users.
export let ns = "";

export const quoted = (value: string) => `'${value.replace(/'/g, "''")}'`;

export let app: Hono;

export let trainer: Awaited<ReturnType<typeof createUserWithJwt>>;

export let agent: Awaited<ReturnType<typeof createUserWithJwt>>;

export function call(
  method: string,
  path: string,
  body?: unknown,
  token = trainer.token,
) {
  return tnaApiRequest(app, `http://localhost/api/v1/ai${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

export async function setupModelPolicySuite() {
  // A failed setup must not make teardown delete the previous file's users.
  trainer = undefined as unknown as typeof trainer;
  agent = undefined as unknown as typeof agent;
  ns = randomUUID().slice(0, 8);
  Object.assign(process.env, {
    NODE_ENV: "test",
    VITE_SUPABASE_URL: env.apiUrl,
    VITE_SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey,
    GEMINI_API_KEY: "e2e-only",
    OPENAI_API_KEY: "e2e-only",
  });
  installLoopbackFetchGuard();
  trainer = await createUserWithJwt(env, "trainer", `modelpol-${ns}`);
  agent = await createUserWithJwt(env, "agent", `modelpol-${ns}`);
  app = (await import("../../../api/src/app")).default as unknown as Hono;
}

export async function teardownModelPolicySuite() {
  runSql(
    env,
    `DELETE FROM ai_model_policy;
     DELETE FROM ai_model_policy_audit;`,
  );
  for (const user of [trainer, agent].filter(Boolean)) {
    runSql(
      env,
      `DELETE FROM activity_logs WHERE user_id=${quoted(user.userId)};`,
    );
    const { error } = await createAdmin(env).auth.admin.deleteUser(user.userId);
    expect(error).toBeNull();
  }
}

export async function resetModelPolicies() {
  const { invalidateAiModelPolicyCache } =
    await import("../../../api/src/lib/ai-model-policy");
  invalidateAiModelPolicyCache();
  runSql(
    env,
    `DELETE FROM ai_model_policy;
     DELETE FROM ai_model_policy_audit;`,
  );
}
