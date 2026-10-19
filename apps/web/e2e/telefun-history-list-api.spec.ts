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
 * Telefun — `GET /telefun/sessions?view=list` pada backend lokal sungguhan.
 *
 * Daftar riwayat hanya membawa yang ditampilkan landing dan Riwayat (skor,
 * penilaian, status). Transkrip dan kolom internal penilaian tidak ikut;
 * Telaah mengambil satu sesi penuh lewat `GET /telefun/history/:id`.
 */

const env = readLoopbackEnv();
const ns = `telefun-list-${randomUUID().slice(0, 8)}`;
type Identity = Awaited<ReturnType<typeof createUserWithJwt>>;
let agent: Identity;
let app: Hono;

async function get(path: string) {
  const response = await tnaApiRequest(app, `http://localhost/api/v1${path}`, {
    headers: { Authorization: `Bearer ${agent.token}` },
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { data: unknown }).data;
}

test.beforeAll(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    VITE_SUPABASE_URL: env.apiUrl,
    VITE_SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey,
  });
  installLoopbackFetchGuard();
  agent = await createUserWithJwt(env, "agent", ns);
  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  if (agent) {
    expect(
      (await createAdmin(env).auth.admin.deleteUser(agent.userId)).error,
    ).toBeNull();
  }
});

test("the history list leaves out the transcript and scoring internals, and one session opens in full", async () => {
  const messages = Array.from({ length: 40 }, (_, i) => ({
    role: i % 2 ? "agent" : "consumer",
    text: `${ns} kalimat panjang nomor ${i} `.repeat(10),
  }));
  const assessment = { overallScore: 82, aspects: [] };
  const { data: inserted, error } = await createAdmin(env)
    .from("telefun_history")
    .insert({
      user_id: agent.userId,
      scenario_title: `${ns} skenario`,
      consumer_name: "Konsumen Uji",
      score: 82,
      status: "completed",
      messages,
      voice_assessment: assessment,
      live_prompt_instructions: `${ns} instruksi rahasia`,
      scoring_status: "completed",
      scoring_claim_token_hash: "hash-tidak-boleh-keluar",
      scoring_last_error: "kesalahan internal",
      ai_summary: `${ns} ringkasan`,
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  const id = inserted!.id as string;

  const list = (await get("/telefun/sessions?view=list")) as Record<
    string,
    unknown
  >[];
  const row = list.find((item) => item.id === id);
  expect(row).toBeTruthy();
  expect(row).toMatchObject({
    detail: "summary",
    scenario_title: `${ns} skenario`,
    score: 82,
    scoring_status: "completed",
    voice_assessment: assessment,
  });
  for (const hidden of [
    "messages",
    "live_prompt_instructions",
    "scoring_claim_token_hash",
    "scoring_claim_owner",
    "scoring_last_error",
    "ai_summary",
  ]) {
    expect(row, hidden).not.toHaveProperty(hidden);
  }

  const full = (await get(`/telefun/history/${id}`)) as Record<string, unknown>;
  expect(full).not.toHaveProperty("detail");
  expect(full.messages).toEqual(messages);
  expect(full).not.toHaveProperty("scoring_claim_token_hash");
});
