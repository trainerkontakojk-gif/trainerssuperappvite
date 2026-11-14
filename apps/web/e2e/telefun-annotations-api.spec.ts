import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
  runSql,
} from "./helpers/sidakRealBackend";
import { tnaApiRequest } from "./helpers/tnaApi";

// Real local auth/Hono/Postgres; fail-closed provider and storage fixtures.
const env = readLoopbackEnv();
let app: Hono;
let actor: Awaited<ReturnType<typeof createUserWithJwt>>;
let sessionId: string;
let providerStatus = 200;
let providerText: string;
let requestPayload: any;
let requestPath: string;
let providerCalls = 0;
let restoreAudioCapability: (() => void) | undefined;
const annotation = {
  timestamp_ms: 1000,
  category: "strength",
  moment: "good_de_escalation",
  text: "Agen menyampaikan empati dengan jelas.",
};
function result() {
  return {
    annotations: [annotation],
    recommendations: [{ text: "Pertahankan empati.", priority: 1 }],
  };
}
function generate() {
  return tnaApiRequest(
    app,
    `http://localhost/api/v1/telefun/annotations/generate/${sessionId}`,
    { method: "POST", headers: { Authorization: `Bearer ${actor.token}` } },
  );
}
async function rows() {
  const response = await createAdmin(env)
    .from("telefun_replay_annotations")
    .select("id,is_manual,text,timestamp_ms,category,moment")
    .eq("session_id", sessionId)
    .order("timestamp_ms");
  expect(response.error).toBeNull();
  return response.data!;
}
async function summary() {
  const response = await createAdmin(env)
    .from("telefun_coaching_summary")
    .select("recommendations,ai_annotation_count,ai_annotation_checksum")
    .eq("session_id", sessionId)
    .maybeSingle();
  expect(response.error).toBeNull();
  return response.data;
}

test.beforeAll(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    VITE_SUPABASE_URL: env.apiUrl,
    VITE_SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey,
    GEMINI_API_KEY: "e2e-only",
    GEMINI_PROXY_URL: "",
  });
  installLoopbackFetchGuard();
  const guardedFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    if (url.hostname === "generativelanguage.googleapis.com") {
      requestPayload = await req.json();
      requestPath = url.pathname;
      providerCalls++;
      if (providerStatus !== 200)
        return Response.json(
          {
            error: {
              code: providerStatus,
              message: "Private provider detail",
              status: "INVALID_ARGUMENT",
            },
          },
          { status: providerStatus },
        );
      return Response.json({
        candidates: [
          {
            content: { role: "model", parts: [{ text: providerText }] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 12,
          candidatesTokenCount: 8,
          totalTokenCount: 20,
        },
      });
    }
    if (
      url.origin === env.apiUrl &&
      url.pathname.startsWith("/storage/v1/object/")
    )
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { "Content-Type": "audio/webm" },
      });
    return guardedFetch(req);
  };
  actor = await createUserWithJwt(
    env,
    "trainer",
    `annotation-${randomUUID().slice(0, 8)}`,
  );
  const policy = await createAdmin(env)
    .from("ai_model_policy")
    .select("task")
    .eq("task", "telefun_assessment")
    .maybeSingle();
  expect(policy.error).toBeNull();
  expect(
    policy.data,
    "Isolated regression requires an empty local policy",
  ).toBeNull();
  runSql(
    env,
    `INSERT INTO ai_model_policy(task,model_id,updated_by) VALUES ('telefun_assessment','gemini-4-hydrogen','${actor.userId}');`,
  );
  const { AI_MODELS } = await import("@trainers/types");
  const caps = AI_MODELS.find(
    (model) => model.id === "gemini-4-hydrogen",
  )!.capabilities!;
  const original = caps.supportsAudioInput;
  caps.supportsAudioInput = true;
  restoreAudioCapability = () => {
    caps.supportsAudioInput = original;
  };
  app = (await import("../../api/src/app")).default as unknown as Hono;
});
test.beforeEach(async () => {
  providerStatus = 200;
  providerText = JSON.stringify(result());
  providerCalls = 0;
  sessionId = randomUUID();
  const db = createAdmin(env);
  expect(
    (
      await db.from("telefun_history").insert({
        id: sessionId,
        user_id: actor.userId,
        status: "completed",
        scenario_title: "Anotasi latihan",
        consumer_name: "Konsumen Uji",
        telefun_model_id: "gemini-3.8-live",
        telefun_transport: "gemini-live",
        recording_status: "ready",
        scoring_status: "pending",
        duration_seconds: 30,
        agent_recording_path: `${actor.userId}/${sessionId}/agent.webm`,
        messages: [],
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await db.from("telefun_replay_annotations").insert([
        {
          ...annotation,
          session_id: sessionId,
          user_id: actor.userId,
          text: "AI sebelumnya",
          is_manual: false,
        },
        {
          ...annotation,
          timestamp_ms: 2000,
          session_id: sessionId,
          user_id: actor.userId,
          text: "Catatan manual",
          is_manual: true,
        },
      ])
    ).error,
  ).toBeNull();
  expect(
    (
      await db.rpc("upsert_telefun_coaching_summary", {
        p_session_id: sessionId,
        p_recommendations: [{ text: "Rekomendasi sebelumnya", priority: 2 }],
        p_ai_annotation_count: 1,
        p_ai_annotation_checksum: "a".repeat(64),
      })
    ).error,
  ).toBeNull();
});
test.afterEach(async () => {
  const db = createAdmin(env);
  expect(
    (await db.from("telefun_history").delete().eq("id", sessionId)).error,
  ).toBeNull();
  expect(
    (await db.from("ai_usage_logs").delete().eq("user_id", actor.userId)).error,
  ).toBeNull();
});
test.afterAll(async () => {
  restoreAudioCapability?.();
  if (!actor) return;
  runSql(
    env,
    `DELETE FROM ai_model_policy WHERE task='telefun_assessment' AND updated_by='${actor.userId}';`,
  );
  expect(
    (await createAdmin(env).auth.admin.deleteUser(actor.userId)).error,
  ).toBeNull();
});

test("Hydrogen annotation request uses a compact schema and persists usage, annotations and coaching", async () => {
  const response = await generate();
  expect(response.status, await response.clone().text()).toBe(200);
  expect(providerCalls).toBe(1);
  expect(requestPath).toContain("/models/gemini-4-hydrogen:generateContent");
  const schema = requestPayload.generationConfig.responseSchema;
  expect(JSON.stringify(schema)).not.toMatch(
    /"(?:maxItems|maxLength|minimum|maximum)"/,
  );
  expect(requestPayload.generationConfig.responseMimeType).toBe(
    "application/json",
  );
  expect(requestPayload.contents[0].parts[1].inlineData.mimeType).toBe(
    "audio/webm",
  );
  expect(await rows()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ text: annotation.text, is_manual: false }),
      expect.objectContaining({ text: "Catatan manual", is_manual: true }),
    ]),
  );
  expect(await rows()).toHaveLength(2);
  expect((await summary())?.recommendations).toEqual(result().recommendations);
  const logs = await createAdmin(env)
    .from("ai_usage_logs")
    .select("model_id,input_tokens,output_tokens,action")
    .eq("user_id", actor.userId);
  expect(logs.error).toBeNull();
  expect(logs.data).toEqual([
    expect.objectContaining({
      model_id: "gemini-4-hydrogen",
      input_tokens: 12,
      output_tokens: 8,
      action: "replay-annotation-generation",
    }),
  ]);
});

test("backend retains count and text limits with the simplified provider schema", async () => {
  providerText = JSON.stringify({
    annotations: Array.from({ length: 31 }, (_, i) => ({
      ...annotation,
      timestamp_ms: i * 100,
      text: "a".repeat(600),
    })),
    recommendations: Array.from({ length: 6 }, () => ({
      text: "Latihan lanjutan",
      priority: 3,
    })),
  });
  const response = await generate();
  expect(response.status, await response.clone().text()).toBe(200);
  const body = await response.json();
  expect(body.data.annotations).toHaveLength(30);
  expect(body.data.recommendations).toHaveLength(5);
  expect(
    body.data.annotations.every(
      (row: { text: string }) => row.text.length === 500,
    ),
  ).toBe(true);
  expect((await rows()).filter((row) => !row.is_manual)).toHaveLength(30);
});

test("provider rejection reports generation failure without exposing details or overwriting rows", async () => {
  const before = await rows();
  const previousSummary = await summary();
  providerStatus = 400;
  const response = await generate();
  expect(response.status).toBe(500);
  const body = await response.json();
  expect(body.error.code).toBe("GENERATION_ERROR");
  expect(body.error.message).not.toMatch(
    /Private provider detail|INVALID_ARGUMENT|\{/,
  );
  expect(providerCalls).toBe(1);
  expect(await rows()).toEqual(before);
  expect(await summary()).toEqual(previousSummary);
});

for (const invalid of [
  "invalid JSON",
  "invalid priority",
  "invalid category",
  "invalid timestamp",
]) {
  test(`${invalid} preserves existing annotation and coaching data`, async () => {
    const before = await rows();
    const previousSummary = await summary();
    const value = result();
    if (invalid === "invalid priority") value.recommendations[0].priority = 6;
    if (invalid === "invalid category")
      value.annotations[0] = { ...annotation, category: "unknown" };
    if (invalid === "invalid timestamp")
      value.annotations[0] = { ...annotation, timestamp_ms: -1 };
    providerText =
      invalid === "invalid JSON" ? "{broken" : JSON.stringify(value);
    const response = await generate();
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("GENERATION_ERROR");
    expect(body.error.message).toBe(
      "Hasil anotasi AI tidak valid. Silakan coba lagi.",
    );
    expect(await rows()).toEqual(before);
    expect(await summary()).toEqual(previousSummary);
  });
}
