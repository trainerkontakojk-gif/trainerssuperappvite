import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
} from "./helpers/sidakRealBackend";
import { tnaApiRequest } from "./helpers/tnaApi";

/**
 * Telefun — `POST /telefun/score/:id` pada backend lokal sungguhan.
 *
 * Ringkasan coaching adalah panggilan AI kedua. Skor tidak boleh menunggunya:
 * di sini Gemini tidak pernah menjawab, dan skor tetap harus kembali.
 */

const env = readLoopbackEnv();
const ns = `telefun-score-${randomUUID().slice(0, 8)}`;
let agent: Awaited<ReturnType<typeof createUserWithJwt>>;
let app: Hono;
let guardedFetch: typeof fetch;
const providerCalls: string[] = [];
const sessionIds: string[] = [];

const FEEDBACK =
  "Tempo bicara stabil dan jelas sehingga konsumen mudah mengikuti.";
const ASPECT = {
  score: 8.3,
  verdict: "Baik sekali, konsisten",
  feedback: FEEDBACK,
};
/** Penilaian tersimpan yang lengkap: analisis suara memakai cache, tanpa AI. */
const CACHED_ASSESSMENT = {
  overallScore: 8.3,
  speakingRate: { ...ASPECT, wordsPerMinute: 140 },
  intonation: ASPECT,
  articulation: ASPECT,
  fillerWords: { ...ASPECT, count: 0, examples: [] },
  emotionalTone: { ...ASPECT, dominant: "tenang" },
  transcript: "Selamat siang, dengan layanan konsumen OJK.",
  highlights: [
    "Menyapa konsumen dengan ramah",
    "Mengonfirmasi data konsumen",
    "Menutup panggilan dengan sopan",
  ],
  strengths: ["Suara jelas sekali", "Tempo bicara stabil", "Nada tetap tenang"],
  holdManagement: null,
};

test.beforeAll(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    VITE_SUPABASE_URL: env.apiUrl,
    VITE_SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey,
    GEMINI_API_KEY: "e2e-only",
  });
  installLoopbackFetchGuard();
  // Gemini yang tidak pernah menjawab; selain itu tetap lewat guard loopback.
  guardedFetch = globalThis.fetch;
  globalThis.fetch = ((input: any, init?: any) => {
    const raw =
      typeof input === "string" ? input : (input?.url ?? String(input));
    if (new URL(raw).hostname === "generativelanguage.googleapis.com") {
      providerCalls.push(raw);
      return new Promise<Response>(() => {});
    }
    return guardedFetch(input, init);
  }) as typeof fetch;
  agent = await createUserWithJwt(env, "agent", ns);
  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  if (guardedFetch) globalThis.fetch = guardedFetch;
  if (!agent) return;
  const admin = createAdmin(env);
  if (sessionIds.length > 0) {
    const deleted = await admin
      .from("telefun_history")
      .delete()
      .in("id", sessionIds);
    expect(deleted.error, "delete run scoring session").toBeNull();
    const remaining = await admin
      .from("telefun_history")
      .select("id")
      .in("id", sessionIds);
    expect(remaining.error, "read back deleted scoring session").toBeNull();
    expect(remaining.data).toEqual([]);
  }
  const deletedUser = await admin.auth.admin.deleteUser(agent.userId);
  expect(deletedUser.error, "delete run scoring auth user").toBeNull();
});

test("the score returns without waiting for the coaching summary", async () => {
  const id = randomUUID();
  sessionIds.push(id);
  const { data: row, error } = await createAdmin(env)
    .from("telefun_history")
    .insert({
      id,
      user_id: agent.userId,
      scenario_title: `${ns} skor`,
      consumer_name: "Konsumen Uji",
      status: "completed",
      scoring_status: "pending",
      recording_status: "ready",
      recording_error: null,
      recording_path: `${agent.userId}/${id}/full_call.webm`,
      agent_recording_path: `${agent.userId}/${id}/agent_only.webm`,
      recording_ready_at: new Date().toISOString(),
      voice_assessment: CACHED_ASSESSMENT,
    })
    .select("id")
    .single();
  expect(error).toBeNull();

  const response = await Promise.race([
    tnaApiRequest(app, `http://localhost/api/v1/telefun/score/${row!.id}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${agent.token}` },
    }),
    new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), 10_000),
    ),
  ]);

  expect(response, "the score waited for the coaching AI call").not.toBe(
    "timeout",
  );
  if (response === "timeout") return;
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    success: boolean;
    data: { score: number };
  };
  expect(body.data.score).toBe(8.3);
  // The coaching call was still started.
  await expect.poll(() => providerCalls.length).toBeGreaterThan(0);
});
