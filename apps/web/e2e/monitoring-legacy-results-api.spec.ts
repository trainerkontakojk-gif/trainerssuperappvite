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
  sqlOne,
} from "./helpers/sidakRealBackend";

/**
 * Tabel legacy `results` — paritas dengan prod. Backend NYATA in-process +
 * Supabase lokal disposable.
 *
 * Prod masih menyimpan sesi Telefun lama di `results`, dan
 * `GET /ai/monitoring/history/telefun/:id/review` membacanya bila id tidak
 * ada di `telefun_history`. Repo tidak pernah membuat tabel ini, sehingga
 * jalur itu selalu gagal di lokal/E2E.
 *
 * Kontrak:
 * - sesi Telefun legacy terbaca lewat route monitoring;
 * - anon tidak bisa membaca `results` lewat PostgREST;
 * - UPDATE pada `results` berhasil (trigger updated_at prod yang rusak tidak
 *   ikut dibuat: tabelnya tidak punya kolom `updated_at`).
 */

const env = readLoopbackEnv();
const ns = randomUUID().slice(0, 8);
const quoted = (value: string) => `'${value.replace(/'/g, "''")}'`;

let app: Hono;
let trainer: Awaited<ReturnType<typeof createUserWithJwt>>;
let agent: Awaited<ReturnType<typeof createUserWithJwt>>;
let legacyId: string;

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

  trainer = await createUserWithJwt(env, "trainer", `legacy-${ns}`);
  agent = await createUserWithJwt(env, "agent", `legacy-${ns}`);
  legacyId = randomUUID();
  runSql(
    env,
    `INSERT INTO results (id, user_id, module, score, details, history)
     VALUES (${quoted(legacyId)}, ${quoted(agent.userId)}, 'telefun', 77,
             ${quoted(JSON.stringify({ scenario_title: `Legacy ${ns}`, duration: 120 }))},
             '[]');`,
  );

  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  for (const user of [trainer, agent].filter(Boolean)) {
    runSql(
      env,
      `DELETE FROM activity_logs WHERE user_id=${quoted(user.userId)};`,
    );
    const { error } = await createAdmin(env).auth.admin.deleteUser(user.userId);
    expect(error).toBeNull();
  }
});

test("sesi Telefun legacy terbaca lewat route monitoring", async () => {
  const response = await tnaApiRequest(
    app,
    `http://localhost/api/v1/ai/monitoring/history/telefun/${legacyId}/review`,
    { method: "GET", headers: { Authorization: `Bearer ${trainer.token}` } },
  );
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(200);
  expect(body.data).toMatchObject({
    module: "telefun",
    score: 77,
    scenario_title: `Legacy ${ns}`,
    duration_seconds: 120,
  });
});

test("anon tidak bisa membaca results lewat PostgREST", async () => {
  const response = await fetch(`${env.apiUrl}/rest/v1/results?select=id`, {
    headers: { apikey: env.anonKey, Authorization: `Bearer ${env.anonKey}` },
  });
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(401);
  expect(body.code).toBe("42501");
});

test("UPDATE results berhasil", () => {
  expect(
    sqlOne(
      env,
      `UPDATE results SET score=78 WHERE id=${quoted(legacyId)} RETURNING score;`,
    ),
  ).toBe("78");
});
