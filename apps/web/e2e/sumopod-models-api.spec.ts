import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import { DEFAULT_KETIK_SETTINGS } from "@trainers/types";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
} from "./helpers/sidakRealBackend";
import { tnaApiRequest } from "./helpers/tnaApi";

/**
 * SumoPod text models (GPT 6 Luna, DeepSeek V4.1 Flash, Claude Sonnet 5.5,
 * Claude Opus 5.5).
 * Real JWT, Hono router, and local database; SumoPod is stubbed in fetch, so
 * no request leaves the machine and the real key is never used.
 */

test.describe.configure({ mode: "serial" });
const env = readLoopbackEnv();
const ns = `sumopod-${randomUUID().slice(0, 8)}`;
const SUMOPOD_MODEL_IDS = [
  "gpt-6-luna",
  "deepseek-v4.1-flash-1017",
  "claude-sonnet-5-5",
  "claude-opus-5-5",
];
let trainer: Awaited<ReturnType<typeof createUserWithJwt>>;
let app: Hono;
let guardedFetch: typeof fetch;
let sumopodCalls: Array<{
  url: string;
  authorization: string | null;
  body: {
    model?: string;
    temperature?: number;
    messages?: Array<{ role: string; content: string }>;
  };
}> = [];
let geminiCalls = 0;

async function api(path: string, method = "GET", body?: unknown) {
  return tnaApiRequest(app, `http://localhost/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${trainer.token}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function modelIds(module: string): Promise<string[]> {
  const response = await api(`/ai/models?module=${module}`);
  expect(response.status).toBe(200);
  const models = (await response.json()).data as Array<{
    id: string;
    provider: string;
  }>;
  for (const model of models) {
    if (SUMOPOD_MODEL_IDS.includes(model.id)) {
      expect(model.provider).toBe("sumopod");
    }
  }
  return models.map((model) => model.id);
}

async function startKetikSession(selectedModel: string) {
  const saved = await api("/ketik/settings", "PUT", {
    ...DEFAULT_KETIK_SETTINGS,
    selectedModel,
    activeConsumerTypeId: "marah",
    scenarios: DEFAULT_KETIK_SETTINGS.scenarios.map((scenario) => ({
      ...scenario,
      isActive: scenario.id === "pinjol",
    })),
    responsePacingMode: "training_fast",
  });
  expect(saved.status).toBe(200);
  const started = await api("/ketik/sessions", "POST", {
    requestId: randomUUID(),
  });
  expect(started.status).toBe(200);
  const session = (await started.json()).data;
  expect(session.config.selectedModel).toBe(selectedModel);
  return session;
}

function sendTurn(sessionId: string, text: string) {
  return api(`/ketik/sessions/${sessionId}/turns`, "POST", {
    requestId: randomUUID(),
    expectedVersion: 0,
    text,
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
    SUMOPOD_API_KEY: "e2e-sumopod-key",
  });
  installLoopbackFetchGuard();
  guardedFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.hostname === "ai.sumopod.com") {
      sumopodCalls.push({
        url: request.url,
        authorization: request.headers.get("authorization"),
        body: JSON.parse(await request.text()),
      });
      return Response.json({
        id: "chatcmpl-e2e",
        object: "chat.completion",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: "Saya mau komplain, uang saya ditagih terus!",
            },
          },
        ],
        usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 },
      });
    }
    if (url.hostname === "generativelanguage.googleapis.com") {
      geminiCalls += 1;
      return Response.json(
        { error: { code: 400, message: "unexpected", status: "INVALID" } },
        { status: 400 },
      );
    }
    return guardedFetch(input, init);
  };
  trainer = await createUserWithJwt(env, "trainer", ns);
  app = (await import("../../api/src/app")).default as unknown as Hono;
  const { env: apiEnv } = await import("../../api/src/lib/env");
  expect(apiEnv.VITE_SUPABASE_URL).toBe(env.apiUrl);
});

test.beforeEach(() => {
  sumopodCalls = [];
  geminiCalls = 0;
  process.env.SUMOPOD_API_KEY = "e2e-sumopod-key";
});

test.afterAll(async () => {
  globalThis.fetch = guardedFetch;
  if (!trainer) return;
  const admin = createAdmin(env);
  expect(
    (await admin.from("ai_usage_logs").delete().eq("user_id", trainer.userId))
      .error,
  ).toBeNull();
  expect((await admin.auth.admin.deleteUser(trainer.userId)).error).toBeNull();
});

test("SumoPod models are selectable for text modules but never for Telefun", async () => {
  for (const module of ["ketik", "pdkt", "qa-analyzer", "default"]) {
    expect(await modelIds(module)).toEqual(
      expect.arrayContaining(SUMOPOD_MODEL_IDS),
    );
  }
  const telefun = await modelIds("telefun");
  for (const id of SUMOPOD_MODEL_IDS) expect(telefun).not.toContain(id);
});

test("a KETIK session on GPT 6 Luna gets its consumer reply from SumoPod and logs usage", async () => {
  const session = await startKetikSession("gpt-6-luna");
  const turn = await sendTurn(
    session.id,
    "Selamat siang, dengan Kontak OJK 157, ada yang bisa dibantu?",
  );
  expect(turn.status).toBe(200);
  const data = (await turn.json()).data;
  expect(data.messages.at(-1)).toMatchObject({
    sender: "consumer",
    text: "Saya mau komplain, uang saya ditagih terus!",
  });

  expect(geminiCalls).toBe(0);
  expect(sumopodCalls).toHaveLength(1);
  const [call] = sumopodCalls;
  expect(call.url).toBe("https://ai.sumopod.com/v1/chat/completions");
  expect(call.authorization).toBe("Bearer e2e-sumopod-key");
  expect(call.body.model).toBe("gpt-6-luna");
  expect(typeof call.body.temperature).toBe("number");
  expect(call.body.messages?.[0]?.role).toBe("system");
  expect(call.body.messages?.[0]?.content).toContain("POSISI KONSUMEN");
  expect(call.body.messages?.at(-1)?.role).toBe("user");

  const { data: logs, error } = await createAdmin(env)
    .from("ai_usage_logs")
    .select("provider, model_id, module, input_tokens, output_tokens, status")
    .eq("user_id", trainer.userId)
    .eq("model_id", "gpt-6-luna");
  expect(error).toBeNull();
  expect(logs).toEqual([
    expect.objectContaining({
      provider: "sumopod",
      model_id: "gpt-6-luna",
      module: "ketik",
      input_tokens: 120,
      output_tokens: 30,
      status: "success",
    }),
  ]);
});

for (const modelId of SUMOPOD_MODEL_IDS.slice(1)) {
  test(`${modelId} routes to SumoPod with its own model id`, async () => {
    const session = await startKetikSession(modelId);
    const turn = await sendTurn(session.id, "Halo, ada yang bisa dibantu?");
    expect(turn.status).toBe(200);
    expect(sumopodCalls.map((call) => call.body.model)).toEqual([modelId]);
    expect(geminiCalls).toBe(0);
  });
}

test("without SUMOPOD_API_KEY the turn fails closed and nothing is sent", async () => {
  const session = await startKetikSession("gpt-6-luna");
  delete process.env.SUMOPOD_API_KEY;
  const turn = await sendTurn(session.id, "Halo, ada yang bisa dibantu?");
  expect(turn.status).toBe(502);
  expect(await turn.json()).toMatchObject({
    success: false,
    error: { code: "SESSION_AI_FAILED" },
  });
  expect(sumopodCalls).toHaveLength(0);
  expect(geminiCalls).toBe(0);
});
