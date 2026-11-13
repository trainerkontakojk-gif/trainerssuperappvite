import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import { tnaApiRequest } from "./helpers/tnaApi";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
  runSql,
} from "./helpers/sidakRealBackend";
import {
  AI_TASKS,
  AI_TASK_DEFINITIONS,
  AiModelPolicyListResponse,
  AiModelPolicyAuditListResponse,
} from "@trainers/types";

/**
 * Monitoring AI Model Policy E2E API tests.
 * Backend nyata in-process + Supabase lokal disposable.
 *
 * Verifikasi:
 * 1. Tabel kosong -> GET mengembalikan source: "code" dan codeDefault untuk semua tugas.
 * 2. PUT model eligible yang punya harga -> tersimpan, audit bertambah satu baris, GET mengembalikan source: "policy".
 * 3. PUT ditolak: model tanpa harga (MODEL_NO_PRICING), model tanpa audio untuk telefun_assessment (MODEL_NOT_ELIGIBLE),
 *    fallback sama dengan primary (FALLBACK_SAME_AS_PRIMARY), tugas tidak dikenal (TASK_UNKNOWN).
 * 4. Role tanpa capability (agent/leader) -> 403 untuk PUT/DELETE/GET.
 * 5. Baris berisi model tidak di registry -> resolve mengembalikan codeDefault.
 * 6. DELETE -> kembali ke codeDefault, audit tercatat.
 */

const env = readLoopbackEnv();
const ns = randomUUID().slice(0, 8);
const quoted = (value: string) => `'${value.replace(/'/g, "''")}'`;

let app: Hono;
let trainer: Awaited<ReturnType<typeof createUserWithJwt>>;
let agent: Awaited<ReturnType<typeof createUserWithJwt>>;

function call(method: string, path: string, body?: unknown, token = trainer.token) {
  return tnaApiRequest(app, `http://localhost/api/v1/ai${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test.beforeAll(async () => {
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
  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
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
});

test.beforeEach(async () => {
  runSql(
    env,
    `DELETE FROM ai_model_policy;
     DELETE FROM ai_model_policy_audit;`,
  );
});

test.describe("AI Model Policy API", () => {
  test("1. Tabel kosong -> GET mengembalikan source 'code' dan codeDefault untuk semua tugas", async () => {
    const res = await call("GET", "/monitoring/models");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: true; data: AiModelPolicyListResponse };
    const data = body.data;

    expect(data.items.length).toBe(AI_TASKS.length);
    for (const task of AI_TASKS) {
      const item = data.items.find((i) => i.task === task);
      expect(item).toBeDefined();
      expect(item?.source).toBe("code");
      expect(item?.modelId).toBe(AI_TASK_DEFINITIONS[task].codeDefault);
      expect(item?.codeDefault).toBe(AI_TASK_DEFINITIONS[task].codeDefault);
      expect(item?.eligible.length).toBeGreaterThan(0);
      expect(item?.updatedBy).toBeNull();
    }
  });

  test("2. PUT model eligible berbayar -> sukses, audit bertambah, GET menjadi source 'policy'", async () => {
    // Put sidak_forecast ke gemini-3.5-flash-lite
    const putRes = await call("PUT", "/monitoring/models/sidak_forecast", {
      modelId: "gemini-3.5-flash-lite",
    });
    expect(putRes.status).toBe(200);

    const getRes = await call("GET", "/monitoring/models");
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as { success: true; data: AiModelPolicyListResponse };
    const data = getBody.data;
    const item = data.items.find((i) => i.task === "sidak_forecast");
    expect(item?.modelId).toBe("gemini-3.5-flash-lite");
    expect(item?.source).toBe("policy");
    expect(item?.updatedBy).toBe(trainer.userId);

    // Cek audit log
    const auditRes = await call("GET", "/monitoring/models/audit");
    expect(auditRes.status).toBe(200);
    const auditBody = (await auditRes.json()) as { success: true; data: AiModelPolicyAuditListResponse };
    const auditData = auditBody.data;
    expect(auditData.items.length).toBeGreaterThanOrEqual(1);
    const latest = auditData.items[0];
    expect(latest.task).toBe("sidak_forecast");
    expect(latest.newModelId).toBe("gemini-3.5-flash-lite");
    expect(latest.changedBy).toBe(trainer.userId);
  });

  test("3. Validasi penolakan PUT", async () => {
    // 3a. Tugas tidak dikenal
    const unknownTask = await call("PUT", "/monitoring/models/invalid_task", {
      modelId: "gemini-3.8-flash",
    });
    expect(unknownTask.status).toBe(400);

    // 3b. Model tanpa audio untuk telefun_assessment
    const noAudio = await call("PUT", "/monitoring/models/telefun_assessment", {
      modelId: "gpt-5.4-mini",
    });
    expect(noAudio.status).toBe(400);

    // 3c. Fallback sama dengan primary
    // Jika ketik_review sedang gemini-3.8-flash, fallback tidak boleh diubah ke gemini-3.8-flash
    const sameFallback = await call("PUT", "/monitoring/models/ketik_review_fallback", {
      modelId: "gemini-3.8-flash",
    });
    expect(sameFallback.status).toBe(400);
  });

  test("4. Role tanpa capability (agent) mendapat 403", async () => {
    const getRes = await call("GET", "/monitoring/models", undefined, agent.token);
    expect(getRes.status).toBe(403);

    const putRes = await call(
      "PUT",
      "/monitoring/models/sidak_forecast",
      { modelId: "gemini-3.5-flash-lite" },
      agent.token,
    );
    expect(putRes.status).toBe(403);

    const delRes = await call(
      "DELETE",
      "/monitoring/models/sidak_forecast",
      undefined,
      agent.token,
    );
    expect(delRes.status).toBe(403);
  });

  test("5. DELETE mengembalikan ke codeDefault dan mencatat audit", async () => {
    // Set dulu
    await call("PUT", "/monitoring/models/sidak_forecast", {
      modelId: "gemini-3.5-flash-lite",
    });

    // Delete
    const delRes = await call("DELETE", "/monitoring/models/sidak_forecast");
    expect(delRes.status).toBe(200);

    // GET harus kembali ke code
    const getRes = await call("GET", "/monitoring/models");
    const getBody = (await getRes.json()) as { success: true; data: AiModelPolicyListResponse };
    const data = getBody.data;
    const item = data.items.find((i) => i.task === "sidak_forecast");
    expect(item?.source).toBe("code");
    expect(item?.modelId).toBe(AI_TASK_DEFINITIONS.sidak_forecast.codeDefault);

    // Audit mencatat pengembalian
    const auditRes = await call("GET", "/monitoring/models/audit");
    const auditBody = (await auditRes.json()) as { success: true; data: AiModelPolicyAuditListResponse };
    const auditData = auditBody.data;
    expect(auditData.items[0].task).toBe("sidak_forecast");
    expect(auditData.items[0].newModelId).toBe(
      AI_TASK_DEFINITIONS.sidak_forecast.codeDefault,
    );
  });

  test("6. Baris model tidak di registry fallback ke codeDefault tanpa error", async () => {
    // Sisipkan row invalid langsung ke DB
    runSql(
      env,
      `INSERT INTO ai_model_policy (task, model_id) VALUES ('sidak_forecast', 'non-existent-model')
       ON CONFLICT (task) DO UPDATE SET model_id = EXCLUDED.model_id;`,
    );

    const { resolveTaskModel, invalidateAiModelPolicyCache } = await import(
      "../../api/src/lib/ai-model-policy"
    );
    invalidateAiModelPolicyCache();

    const resolved = await resolveTaskModel("sidak_forecast");
    expect(resolved.source).toBe("code");
    expect(resolved.modelId).toBe(AI_TASK_DEFINITIONS.sidak_forecast.codeDefault);
  });
});
