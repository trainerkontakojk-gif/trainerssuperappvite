import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

// Opt-in live diagnostic: real local API/Postgres and real Hydrogen, at most
// four requests with synthetic WebM only. A failure is readiness evidence;
// this test does not enable production registry eligibility.
const LIVE_HYDROGEN = process.env.E2E_HYDROGEN_LIVE_SMOKE === "1";
test.skip(
  !LIVE_HYDROGEN,
  "Live provider diagnostic requires explicit opt-in and synthetic audio",
);
const liveProviderEvidence: Array<{
  kind: string;
  status: number;
  modelVersion?: string;
  usage?: Record<string, unknown>;
  durationMs: number;
}> = [];
let liveProviderCalls = 0;
let liveAudio: Buffer | undefined;
let restoreAudioCapability: (() => void) | undefined;
function readSmokeKey(): string {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "e2e-only")
    return process.env.GEMINI_API_KEY;
  for (const file of ["../../../.env.local", "../../../.env"]) {
    try {
      const raw = readFileSync(
        fileURLToPath(new URL(file, import.meta.url)),
        "utf8",
      );
      const key = raw
        .match(/^GEMINI_API_KEY=["']?([^"'\r\n#]+)["']?\s*$/m)?.[1]
        ?.trim();
      if (key) return key;
    } catch {
      /* Try the next existing credential source without logging secrets. */
    }
  }
  throw new Error("Live audio smoke requires an existing Gemini credential");
}
const env = readLoopbackEnv();
const ns = `hydrogen-audio-${randomUUID().slice(0, 8)}`;
let app: Hono;
let agent: Awaited<ReturnType<typeof createUserWithJwt>>;
let guardedFetch: typeof fetch;
let coachingWrites = 0;
const sessionIds: string[] = [];
const requestedModelUrls: string[] = [];
const providerCalls: Array<{ kind: string }> = [];
async function createSession(overrides: Record<string, unknown> = {}) {
  const id = randomUUID();
  sessionIds.push(id);
  expect(
    (
      await createAdmin(env)
        .from("telefun_history")
        .insert({
          id,
          user_id: agent.userId,
          scenario_title: ns,
          consumer_name: "Konsumen Uji",
          status: "completed",
          telefun_model_id: "gemini-3.8-live",
          telefun_transport: "gemini-live",
          scoring_status: "pending",
          recording_status: "ready",
          recording_error: null,
          recording_path: `${agent.userId}/${id}/full_call.webm`,
          agent_recording_path: `${agent.userId}/${id}/agent_only.webm`,
          recording_ready_at: new Date().toISOString(),
          duration_seconds: 30,
          messages: [],
          ...overrides,
        })
    ).error,
  ).toBeNull();
  return id;
}
function score(id: string) {
  return tnaApiRequest(app, `http://localhost/api/v1/telefun/score/${id}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${agent.token}` },
  });
}
async function readSession(id: string) {
  const result = await createAdmin(env)
    .from("telefun_history")
    .select("voice_assessment,scoring_status")
    .eq("id", id)
    .single();
  expect(result.error).toBeNull();
  return result.data!;
}
async function usageLogs() {
  const result = await createAdmin(env)
    .from("ai_usage_logs")
    .select("action,model_id,input_tokens,output_tokens")
    .eq("user_id", agent.userId);
  expect(result.error).toBeNull();
  return result.data!;
}
test.beforeAll(async () => {
  const nativeFetch = globalThis.fetch;
  if (LIVE_HYDROGEN) {
    const path = process.env.E2E_HYDROGEN_AUDIO_FILE;
    if (!path) throw new Error("Live smoke requires a synthetic WebM file");
    liveAudio = readFileSync(path);
    if (!liveAudio.length || liveAudio.length > 1024 * 1024)
      throw new Error("Synthetic audio must be nonempty and under 1 MiB");
  }
  Object.assign(process.env, {
    NODE_ENV: "test",
    VITE_SUPABASE_URL: env.apiUrl,
    VITE_SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey,
    GEMINI_API_KEY: readSmokeKey(),
    GEMINI_PROXY_URL: "",
    OPENAI_API_KEY: "e2e-only",
  });
  installLoopbackFetchGuard();
  guardedFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    if (url.hostname === "generativelanguage.googleapis.com") {
      const payload = await req.json();
      const parts = payload.contents[0].parts;
      const prompt =
        parts.find((part: { text?: string }) => part.text)?.text ?? "";
      const kind = prompt.includes("TUGAS: TRANSKRIPSI VERBATIM AGEN")
        ? "transcription"
        : prompt.includes(
              "Analisis rekaman telepon simulasi layanan konsumen berikut.",
            )
          ? "annotations"
          : parts.some((part: { inlineData?: unknown }) => part.inlineData)
            ? "assessment"
            : "coaching";
      providerCalls.push({ kind });
      requestedModelUrls.push(url.pathname);
      if (LIVE_HYDROGEN) {
        if (
          req.method !== "POST" ||
          !url.pathname.endsWith("/models/gemini-4-hydrogen:generateContent")
        )
          throw new Error("Live smoke permits only Hydrogen GenerateContent");
        if (++liveProviderCalls > 4)
          throw new Error("Live smoke provider-call budget exhausted");
        payload.generationConfig = {
          ...payload.generationConfig,
          maxOutputTokens: 8192,
          thinkingConfig: { thinkingLevel: "LOW" },
        };
        const started = Date.now();
        const response = await nativeFetch(
          new Request(req, {
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(90000),
            redirect: "error",
          }),
        );
        const meta = await response.clone().json();
        liveProviderEvidence.push({
          kind,
          status: response.status,
          modelVersion: meta.modelVersion,
          usage: meta.usageMetadata,
          durationMs: Date.now() - started,
        });
        return response;
      }
      throw new Error("Live provider mode was not authorized");
    }
    if (
      url.origin === new URL(env.apiUrl).origin &&
      url.pathname.startsWith("/storage/v1/object/") &&
      req.method === "GET"
    )
      return new Response(new Uint8Array(liveAudio!), {
        headers: { "Content-Type": "audio/webm" },
      });
    const response = await guardedFetch(req);
    if (
      url.origin === new URL(env.apiUrl).origin &&
      url.pathname === "/rest/v1/rpc/upsert_telefun_coaching_summary" &&
      response.ok
    )
      coachingWrites++;
    return response;
  };
  agent = await createUserWithJwt(env, "trainer", ns);
  app = (await import("../../api/src/app")).default as unknown as Hono;
  expect((await import("../../api/src/lib/env")).env.VITE_SUPABASE_URL).toBe(
    env.apiUrl,
  );
  const existingPolicy = await createAdmin(env)
    .from("ai_model_policy")
    .select("task")
    .eq("task", "telefun_assessment")
    .maybeSingle();
  expect(existingPolicy.error).toBeNull();
  expect(
    existingPolicy.data,
    "Local Telefun policy must be empty before isolated smoke",
  ).toBeNull();
  if (LIVE_HYDROGEN) {
    const { AI_MODELS } = await import("@trainers/types");
    const caps = AI_MODELS.find(
      (model) => model.id === "gemini-4-hydrogen",
    )!.capabilities!;
    const original = caps.supportsAudioInput;
    caps.supportsAudioInput = true;
    restoreAudioCapability = () => {
      caps.supportsAudioInput = original;
    };
  }
});
test.afterAll(async () => {
  restoreAudioCapability?.();
  if (guardedFetch) globalThis.fetch = guardedFetch;
  if (!agent) return;
  const db = createAdmin(env);
  if (sessionIds.length)
    expect(
      (await db.from("telefun_history").delete().in("id", sessionIds)).error,
    ).toBeNull();
  expect(
    (await db.from("ai_usage_logs").delete().eq("user_id", agent.userId)).error,
  ).toBeNull();
  expect((await db.auth.admin.deleteUser(agent.userId)).error).toBeNull();
});
test("Hydrogen policy supports transcription, scoring, coaching and replay annotations", async () => {
  test.setTimeout(LIVE_HYDROGEN ? 300000 : 60000);
  requestedModelUrls.length = 0;
  let observedAssessment: unknown;
  try {
    const policy = await tnaApiRequest(
      app,
      "http://localhost/api/v1/ai/monitoring/models/telefun_assessment",
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${agent.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ modelId: "gemini-4-hydrogen" }),
      },
    );
    expect(policy.status, await policy.clone().text()).toBe(200);
    const id = await createSession({
      duration_seconds: LIVE_HYDROGEN ? 30 : 300,
    });
    const response = await score(id);
    expect(response.status, await response.clone().text()).toBe(200);
    await expect
      .poll(() => coachingWrites, { timeout: LIVE_HYDROGEN ? 90000 : 10000 })
      .toBe(1);
    const session = await readSession(id);
    expect(session.scoring_status).toBe("completed");
    expect(session.voice_assessment.transcript.length).toBeGreaterThan(20);
    if (LIVE_HYDROGEN)
      expect(session.voice_assessment.transcript).toMatch(/melati/i);
    observedAssessment = session.voice_assessment;
    const coaching = await createAdmin(env)
      .from("telefun_coaching_summary")
      .select("recommendations")
      .eq("session_id", id)
      .single();
    expect(coaching.error).toBeNull();
    expect(coaching.data?.recommendations.length).toBeGreaterThan(0);
    const annotationResponse = await tnaApiRequest(
      app,
      `http://localhost/api/v1/telefun/annotations/generate/${id}`,
      { method: "POST", headers: { Authorization: `Bearer ${agent.token}` } },
    );
    expect(
      annotationResponse.status,
      await annotationResponse.clone().text(),
    ).toBe(200);
    const annotations = (await annotationResponse.json()).data.annotations;
    expect(annotations.length).toBeGreaterThan(0);
    expect(providerCalls.map((call) => call.kind)).toEqual([
      "transcription",
      "assessment",
      "coaching",
      "annotations",
    ]);
    expect(requestedModelUrls).toHaveLength(4);
    expect(
      requestedModelUrls.every((url) => url.includes("gemini-4-hydrogen")),
    ).toBe(true);
    await expect.poll(async () => (await usageLogs()).length).toBe(4);
    const logs = await usageLogs();
    expect(
      logs.every(
        (row) =>
          row.model_id === "gemini-4-hydrogen" &&
          row.input_tokens > 0 &&
          row.output_tokens > 0,
      ),
    ).toBe(true);
    expect(logs.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        "voice_assessment",
        "replay-annotation-generation",
      ]),
    );
    const stored = await createAdmin(env)
      .from("telefun_replay_annotations")
      .select("id")
      .eq("session_id", id);
    expect(stored.error).toBeNull();
    expect(stored.data?.length).toBe(annotations.length);
    const costs = await createAdmin(env)
      .from("ai_usage_logs")
      .select("action,model_id,input_tokens,output_tokens,estimated_cost_usd")
      .eq("user_id", agent.userId);
    expect(costs.error).toBeNull();
    if (LIVE_HYDROGEN) {
      expect(liveProviderEvidence).toHaveLength(4);
      expect(
        liveProviderEvidence.every(
          (call) =>
            call.status === 200 && call.modelVersion?.includes("hydrogen"),
        ),
      ).toBe(true);
    }
    await test.info().attach("hydrogen-telefun-audio-evidence", {
      body: JSON.stringify({
        providerMode: LIVE_HYDROGEN
          ? "real Google Gemini"
          : "local provider fixture",
        syntheticAudio: true,
        smokeOverrides: LIVE_HYDROGEN
          ? {
              maxOutputTokens: 8192,
              thinkingLevel: "LOW",
              maxProviderCalls: 4,
            }
          : null,
        requestedModelUrls,
        provider: liveProviderEvidence,
        transcript: session.voice_assessment.transcript,
        annotationCount: annotations.length,
        coachingRecommendationCount: coaching.data?.recommendations.length,
        usage: costs.data,
      }),
      contentType: "application/json",
    });
  } finally {
    if (LIVE_HYDROGEN)
      await test.info().attach("hydrogen-provider-attempts", {
        body: JSON.stringify({
          provider: liveProviderEvidence,
          assessment: observedAssessment,
        }),
        contentType: "application/json",
      });
    runSql(
      env,
      `DELETE FROM ai_model_policy WHERE task='telefun_assessment' AND updated_by='${agent.userId}'; DELETE FROM ai_model_policy_audit WHERE changed_by='${agent.userId}';`,
    );
    (
      await import("../../api/src/lib/ai-model-policy")
    ).invalidateAiModelPolicyCache();
  }
});
