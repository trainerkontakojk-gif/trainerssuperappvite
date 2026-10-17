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
 * KETIK — isi instruksi konsumen AI yang dikirim server ke penyedia AI.
 * Real JWT, router Hono, dan database lokal; penyedia AI ditiru dan spec
 * membaca instruksi pada panggilan Gemini pertama sesi.
 */

test.describe.configure({ mode: "serial" });
const env = readLoopbackEnv();
const ns = `ketik-prompt-${randomUUID().slice(0, 8)}`;
let trainer: Awaited<ReturnType<typeof createUserWithJwt>>;
let app: Hono;
let guardedFetch: typeof fetch;
let instructions: string[] = [];

async function api(path: string, method = "GET", body?: unknown) {
  return tnaApiRequest(app, `http://localhost/api/v1/ketik${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${trainer.token}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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
  guardedFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === "generativelanguage.googleapis.com") {
      const payload = JSON.parse(await new Request(input, init).text());
      const parts: Array<{ text?: string }> = [
        ...(payload.systemInstruction?.parts ?? []),
        ...(payload.contents ?? []).flatMap(
          (content: { parts?: Array<{ text?: string }> }) =>
            content.parts ?? [],
        ),
      ];
      instructions.push(parts.map((part) => part.text ?? "").join("\n"));
      return Response.json({
        candidates: [
          {
            content: { role: "model", parts: [{ text: "Halo, mau tanya." }] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
          totalTokenCount: 15,
        },
      });
    }
    return guardedFetch(input, init);
  };
  trainer = await createUserWithJwt(env, "trainer", ns);
  app = (await import("../../api/src/app")).default as unknown as Hono;
  const { env: apiEnv } = await import("../../api/src/lib/env");
  expect(apiEnv.VITE_SUPABASE_URL).toBe(env.apiUrl);
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

/** Instruksi sistem untuk balasan pertama konsumen pada tipe ini. */
async function firstTurnInstruction(consumerTypeId: string): Promise<string> {
  const current = await api("/settings");
  expect(current.status).toBe(200);
  const saved = await api("/settings", "PUT", {
    ...DEFAULT_KETIK_SETTINGS,
    activeConsumerTypeId: consumerTypeId,
    // Satu skenario bawaan tanpa skrip.
    scenarios: DEFAULT_KETIK_SETTINGS.scenarios.map((scenario) => ({
      ...scenario,
      isActive: scenario.id === "pinjol",
    })),
    responsePacingMode: "training_fast",
  });
  expect(saved.status).toBe(200);
  const started = await api("/sessions", "POST", { requestId: randomUUID() });
  expect(started.status).toBe(200);
  const session = (await started.json()).data;
  expect(session.config.consumerType.id).toBe(consumerTypeId);
  instructions = [];
  const turn = await api(`/sessions/${session.id}/turns`, "POST", {
    requestId: randomUUID(),
    expectedVersion: 0,
    text: "Selamat siang, dengan Kontak OJK 157, ada yang bisa dibantu?",
  });
  expect(turn.status).toBe(200);
  expect(instructions).toHaveLength(1);
  return instructions[0];
}

test("angry consumer: no helper role, no hints, gradual disclosure and hard de-escalation", async () => {
  const prompt = await firstTurnInstruction("marah");

  // Konsumen bukan penolong agen.
  expect(prompt).not.toMatch(/fokuslah membantu agen/i);
  expect(prompt).not.toContain("tetap tanggapi agen");
  // Konsumen tidak tahu jawaban benar dan tidak memberi petunjuk.
  expect(prompt).toContain("POSISI KONSUMEN");
  expect(prompt).toContain("Jangan pernah mengoreksi agen");
  expect(prompt).not.toContain("kanal pelaporan");
  // Info dibuka bertahap walau skenario tanpa skrip.
  expect(prompt).not.toContain("SKRIP PERCAKAPAN");
  expect(prompt).toContain("BUKA INFORMASI BERTAHAP");
  expect(prompt).not.toMatch(/WAJIB menjelaskan masalah/);
  // Marah: satu batas tegas, empati template tidak meredakan.
  expect(prompt).toContain("BATAS SATU-SATUNYA");
  expect(prompt).toContain("Empati template");
  expect(prompt).toContain("CONTOH GAYA CHAT");
  expect(prompt).not.toMatch(/jawab dengan sopan/i);
  expect(prompt).not.toMatch(/terlalu teatrikal, dramatis/);
  // Skenario bawaan membawa latar belakang.
  expect(prompt).toContain("dua minggu");
});

test("friendly consumer keeps calm etiquette and no anger rules", async () => {
  const prompt = await firstTurnInstruction("ramah");

  expect(prompt).toContain("POSISI KONSUMEN");
  expect(prompt).toContain("BUKA INFORMASI BERTAHAP");
  expect(prompt).not.toContain("BATAS SATU-SATUNYA");
  expect(prompt).toMatch(/terlalu teatrikal, dramatis/);
  expect(prompt).toContain("CONTOH GAYA CHAT");
});
