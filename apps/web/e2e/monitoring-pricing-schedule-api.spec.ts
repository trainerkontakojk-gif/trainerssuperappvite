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
 * Monitoring tahap 2 — jadwal harga. Backend NYATA in-process + Supabase lokal
 * disposable (plan `plans/markdown/monitoring-phase-2-pricing-schedule.md`).
 *
 * Kontrak:
 * - harga bisa dijadwalkan mulai tanggal X 00.00 WIB, hanya untuk tanggal
 *   sesudah hari ini, dan tampil sebagai "harga berikutnya";
 * - jadwal yang belum berlaku bisa dibatalkan, yang sudah berlaku tidak;
 * - biaya dicatat dengan harga terbaru yang sudah berlaku (jadwal atau ubah
 *   sekarang), jadwal masa depan diabaikan;
 * - jadwal Gemini 3.8 Flash 1 Jan 2027 diisi migrasi;
 * - tabel jadwal tidak terbaca anon/authenticated lewat PostgREST.
 */

const env = readLoopbackEnv();
const ns = randomUUID().slice(0, 8);
const quoted = (value: string) => `'${value.replace(/'/g, "''")}'`;
const KNOWN_MODEL = "gemini-3.1-flash-lite";
const FUTURE_DATE = "2031-05-01";
const FAKE_MODEL = `e2e-sched-${ns}`;

let app: Hono;
let trainer: Awaited<ReturnType<typeof createUserWithJwt>>;
let agent: Awaited<ReturnType<typeof createUserWithJwt>>;

function call(method: string, path: string, body?: unknown) {
  return tnaApiRequest(app, `http://localhost/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${trainer.token}`,
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
  trainer = await createUserWithJwt(env, "trainer", `sched-${ns}`);
  agent = await createUserWithJwt(env, "agent", `sched-${ns}`);
  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  runSql(
    env,
    `DELETE FROM ai_pricing_schedule WHERE model_id IN (${quoted(FAKE_MODEL)})
       OR (model_id=${quoted(KNOWN_MODEL)} AND effective_from >= '2031-01-01');
     DELETE FROM ai_pricing_settings WHERE model_id=${quoted(FAKE_MODEL)};
     DELETE FROM ai_usage_logs WHERE user_id=${quoted(agent.userId)};`,
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

test("harga bisa dijadwalkan dan tampil sebagai harga berikutnya", async () => {
  const response = await call("PUT", "/ai/monitoring/pricing", {
    model_id: KNOWN_MODEL,
    input_price_usd_per_million: 0.4,
    output_price_usd_per_million: 2.4,
    effective_from: FUTURE_DATE,
  });
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(200);
  expect(
    sqlOne(
      env,
      `SELECT effective_from = '${FUTURE_DATE} 00:00:00+07'::timestamptz
       FROM ai_pricing_schedule WHERE model_id=${quoted(KNOWN_MODEL)}
       AND effective_from >= '2031-01-01';`,
    ),
  ).toBe("t");

  const list = await call("GET", "/ai/monitoring/pricing");
  const listBody = await list.json();
  expect(list.status, JSON.stringify(listBody)).toBe(200);
  const row = listBody.data.find(
    (r: { model_id: string }) => r.model_id === KNOWN_MODEL,
  );
  expect(row.next_price).toMatchObject({
    effective_from: new Date(`${FUTURE_DATE}T00:00:00+07:00`).toISOString(),
    input_price_usd_per_million: 0.4,
    output_price_usd_per_million: 2.4,
  });
  expect(typeof row.next_price.id).toBe("string");
});

test("jadwal untuk hari ini atau tanggal lewat ditolak", async () => {
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  for (const date of [today, "2020-01-01"]) {
    const response = await call("PUT", "/ai/monitoring/pricing", {
      model_id: KNOWN_MODEL,
      input_price_usd_per_million: 0.4,
      output_price_usd_per_million: 2.4,
      effective_from: date,
    });
    expect(response.status, date).toBe(400);
  }
});

test("jadwal yang belum berlaku bisa dibatalkan, yang sudah berlaku tidak", async () => {
  const futureId = sqlOne(
    env,
    `SELECT id FROM ai_pricing_schedule WHERE model_id=${quoted(KNOWN_MODEL)}
     AND effective_from >= '2031-01-01';`,
  );
  const cancel = await call(
    "DELETE",
    `/ai/monitoring/pricing/schedule/${futureId}`,
  );
  expect(cancel.status, await cancel.text()).toBe(200);
  expect(
    sqlOne(
      env,
      `SELECT count(*) FROM ai_pricing_schedule WHERE id=${quoted(futureId)};`,
    ),
  ).toBe("0");

  const pastId = sqlOne(
    env,
    `INSERT INTO ai_pricing_schedule (model_id, effective_from, input_price_usd_per_million, output_price_usd_per_million)
     VALUES (${quoted(FAKE_MODEL)}, '2021-01-01', 1, 1) RETURNING id;`,
  );
  const refused = await call(
    "DELETE",
    `/ai/monitoring/pricing/schedule/${pastId}`,
  );
  expect(refused.status).toBe(404);
  expect(
    sqlOne(
      env,
      `SELECT count(*) FROM ai_pricing_schedule WHERE id=${quoted(pastId)};`,
    ),
  ).toBe("1");
});

test("biaya dicatat dengan harga terbaru yang sudah berlaku", async () => {
  const { logAiUsage } = await import("../../api/src/lib/ai-usage");
  // Harga sekarang (2020) < jadwal yang sudah lewat (2022) < jadwal masa depan.
  runSql(
    env,
    `INSERT INTO ai_pricing_settings (model_id, input_price_usd_per_million, output_price_usd_per_million, updated_at)
     VALUES (${quoted(FAKE_MODEL)}, 1, 1, '2020-01-01');
     INSERT INTO ai_pricing_schedule (model_id, effective_from, input_price_usd_per_million, output_price_usd_per_million)
     VALUES (${quoted(FAKE_MODEL)}, '2022-01-01', 2, 3),
            (${quoted(FAKE_MODEL)}, '2031-01-01', 9, 9);`,
  );
  const log = (requestId: string) =>
    logAiUsage({
      requestId,
      userId: agent.userId,
      provider: "gemini",
      modelId: FAKE_MODEL,
      usageContext: { module: "ketik", action: "chat_response" },
      tokens: {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        totalTokens: 2_000_000,
      },
    });
  const prices = (requestId: string) =>
    sqlOne(
      env,
      `SELECT input_price_usd_per_million || '/' || output_price_usd_per_million
       FROM ai_usage_logs WHERE request_id=${quoted(requestId)};`,
    );

  await log(`sched-${ns}-a`);
  expect(prices(`sched-${ns}-a`)).toBe("2/3");

  // "Ubah sekarang" sesudah jadwal berlaku menang atas jadwal itu.
  runSql(
    env,
    `UPDATE ai_pricing_settings SET input_price_usd_per_million=4,
       output_price_usd_per_million=5, updated_at=now()
     WHERE model_id=${quoted(FAKE_MODEL)};`,
  );
  await log(`sched-${ns}-b`);
  expect(prices(`sched-${ns}-b`)).toBe("4/5");
});

test("jadwal Gemini 3.8 Flash 1 Januari 2027 diisi migrasi", () => {
  expect(
    sqlOne(
      env,
      `SELECT input_price_usd_per_million::float || '/' || output_price_usd_per_million::float
       FROM ai_pricing_schedule WHERE model_id='gemini-3.8-flash'
       AND effective_from='2027-01-01 00:00:00+07';`,
    ),
  ).toBe("1.5/7.5");
});

test("tabel jadwal tidak terbaca lewat PostgREST oleh pengguna", async () => {
  for (const token of [env.anonKey, agent.token]) {
    const response = await fetch(
      `${env.apiUrl}/rest/v1/ai_pricing_schedule?select=id`,
      {
        headers: { apikey: env.anonKey, Authorization: `Bearer ${token}` },
      },
    );
    expect([401, 403]).toContain(response.status);
  }
});
