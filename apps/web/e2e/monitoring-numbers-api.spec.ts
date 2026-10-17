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
 * Monitoring tahap 1 — angka yang benar. Backend NYATA in-process + Supabase
 * lokal disposable (plan `plans/markdown/monitoring-phase-1-numbers.md`).
 *
 * Kontrak:
 * - durasi sesi KETIK = selisih stempel waktu pesan pertama dan terakhir, bukan
 *   `simulation_duration` (batas waktu dalam menit), di Monitoring dan SIDAK;
 * - agregasi biaya membaca semua baris bulan itu (lebih dari batas 1000 baris
 *   PostgREST), memvalidasi bulan, dan memisahkan biaya Lainnya;
 * - aksi PDKT `start_session` dihitung sebagai simulasi;
 * - harga untuk model yang tidak dikenal ditolak tanpa menulis baris.
 */

const env = readLoopbackEnv();
const ns = randomUUID().slice(0, 8);
const quoted = (value: string) => `'${value.replace(/'/g, "''")}'`;
// Bulan jauh di depan supaya agregasi hanya berisi baris spec ini.
const YEAR = 2031;
const MONTH = 3;

let app: Hono;
let trainer: Awaited<ReturnType<typeof createUserWithJwt>>;
let agent: Awaited<ReturnType<typeof createUserWithJwt>>;
let folderName: string;
let pesertaId: string;
let ketikId: string;

function get(path: string) {
  return tnaApiRequest(app, `http://localhost/api/v1${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${trainer.token}` },
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

  trainer = await createUserWithJwt(env, "trainer", `numbers-${ns}`);
  agent = await createUserWithJwt(env, "agent", `numbers-${ns}`);

  folderName = `Batch angka ${ns}`;
  runSql(
    env,
    `INSERT INTO profiler_folders (name) VALUES (${quoted(folderName)});`,
  );
  pesertaId = sqlOne(
    env,
    `INSERT INTO profiler_peserta (batch_name, nama, tim, jabatan)
     VALUES (${quoted(folderName)}, ${quoted(`Peserta ${ns}`)}, 'Tim A', 'Agent')
     RETURNING id;`,
  );

  // Batas waktu 5 menit; sesi berlangsung 6 menit 52 detik (412 detik).
  const messages = [
    {
      id: "m1",
      sender: "system",
      text: "iMessage with Bu Rina",
      timestamp: "2031-03-10T02:00:00.000Z",
    },
    {
      id: "m2",
      sender: "consumer",
      text: "Tagihan saya dobel.",
      timestamp: "2031-03-10T02:00:05.000Z",
    },
    {
      id: "m3",
      sender: "agent",
      text: "Baik Bu, saya cek.",
      timestamp: "2031-03-10T02:06:52.000Z",
    },
  ];
  ketikId = sqlOne(
    env,
    `INSERT INTO ketik_history (user_id, date, scenario_title, consumer_name, messages,
       simulation_duration, simulation_subject_type, simulation_subject_peserta_id,
       simulation_subject_name, simulation_subject_batch_name, simulation_subject_team)
     VALUES (${quoted(agent.userId)}, '2031-03-10T02:00:00Z', ${quoted(`Durasi ${ns}`)},
       'Bu Rina', ${quoted(JSON.stringify(messages))}::jsonb, 5, 'participant',
       ${quoted(pesertaId)}, ${quoted(`Peserta ${ns}`)}, ${quoted(folderName)}, 'Tim A')
     RETURNING id;`,
  );

  // 1003 panggilan simulasi KETIK + 1 start_session PDKT + 1 analisis QA = 1005.
  runSql(
    env,
    `INSERT INTO ai_usage_logs (request_id, user_id, provider, model_id, module, action,
       input_tokens, output_tokens, total_tokens, estimated_cost_idr, created_at)
     SELECT ${quoted(`numbers-${ns}-`)} || g, ${quoted(agent.userId)}, 'gemini',
       'gemini-3.8-flash', 'ketik', 'chat_response', 10, 5, 15, 1,
       '2031-03-05T03:00:00Z'::timestamptz + make_interval(secs => g)
     FROM generate_series(1, 1003) AS g;
     INSERT INTO ai_usage_logs (request_id, user_id, provider, model_id, module, action,
       input_tokens, output_tokens, total_tokens, estimated_cost_idr, created_at)
     VALUES
       (${quoted(`numbers-${ns}-start`)}, ${quoted(agent.userId)}, 'gemini', 'gemini-3.8-flash',
        'pdkt', 'start_session', 10, 5, 15, 7, '2031-03-06T03:00:00Z'),
       (${quoted(`numbers-${ns}-qa`)}, ${quoted(agent.userId)}, 'gemini', 'gemini-3.8-flash',
        'qa-analyzer', 'generate-trend-forecast', 10, 5, 15, 11, '2031-03-07T03:00:00Z');`,
  );

  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  runSql(
    env,
    `DELETE FROM ai_usage_logs WHERE user_id=${quoted(agent.userId)};
     DELETE FROM ketik_history WHERE id=${quoted(ketikId)};
     DELETE FROM profiler_folders WHERE name=${quoted(folderName)};
     DELETE FROM ai_pricing_settings WHERE model_id=${quoted(`unknown-${ns}`)};`,
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

test("durasi KETIK di riwayat Monitoring adalah lama sesi sebenarnya", async () => {
  const response = await get("/ai/monitoring/history");
  const body = await response.json();
  expect(response.status, JSON.stringify(body).slice(0, 500)).toBe(200);
  const entry = body.data.find((row: { id: string }) => row.id === ketikId);
  expect(entry).toBeTruthy();
  expect(entry.duration_seconds).toBe(412);
  // Batas waktu tetap dikirim apa adanya (menit).
  expect(entry.ketik_session.simulation_duration).toBe(5);
});

test("durasi KETIK di riwayat simulasi SIDAK adalah lama sesi sebenarnya", async () => {
  const response = await get(
    `/sidak/agents/${pesertaId}/simulations?module=ketik`,
  );
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(200);
  const item = body.data.items.find(
    (row: { id: string }) => row.id === ketikId,
  );
  expect(item).toBeTruthy();
  expect(item.durationSeconds).toBe(412);
});

test("agregasi membaca lebih dari 1000 baris dan memisahkan biaya Lainnya", async () => {
  const response = await get(
    `/ai/monitoring/aggregation?year=${YEAR}&month=${MONTH}`,
  );
  const body = await response.json();
  expect(response.status, JSON.stringify(body).slice(0, 500)).toBe(200);
  const row = body.data.find(
    (r: { user_id: string }) => r.user_id === agent.userId,
  );
  expect(row).toBeTruthy();
  expect(row.total_calls).toBe(1005);
  expect(row.total_cost_idr).toBe(1003 + 7 + 11);
  expect(row.simulation_cost_idr).toBe(1003 + 7);
  expect(row.review_cost_idr).toBe(0);
  expect(row.other_cost_idr).toBe(11);
  const startSession = row.models.find(
    (m: { action: string }) => m.action === "start_session",
  );
  expect(startSession.action_category).toBe("simulation");
});

test("agregasi menolak bulan yang tidak valid", async () => {
  const response = await get(
    `/ai/monitoring/aggregation?year=${YEAR}&month=13`,
  );
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(400);
});

test("harga untuk model yang tidak dikenal ditolak tanpa menulis baris", async () => {
  const response = await tnaApiRequest(
    app,
    "http://localhost/api/v1/ai/monitoring/pricing",
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${trainer.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model_id: `unknown-${ns}`,
        input_price_usd_per_million: 1,
        output_price_usd_per_million: 2,
      }),
    },
  );
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(400);
  expect(
    sqlOne(
      env,
      `SELECT count(*) FROM ai_pricing_settings WHERE model_id=${quoted(`unknown-${ns}`)};`,
    ),
  ).toBe("0");
});

test("harga untuk model yang dikenal tetap tersimpan", async () => {
  const modelId = "gemini-3.8-flash";
  const before = sqlOne(
    env,
    `SELECT coalesce(json_agg(p), '[]') FROM ai_pricing_settings p WHERE model_id=${quoted(modelId)};`,
  );
  try {
    const response = await tnaApiRequest(
      app,
      "http://localhost/api/v1/ai/monitoring/pricing",
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${trainer.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model_id: modelId,
          input_price_usd_per_million: 0.31,
          output_price_usd_per_million: 1.21,
        }),
      },
    );
    const body = await response.json();
    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(
      sqlOne(
        env,
        `SELECT input_price_usd_per_million FROM ai_pricing_settings WHERE model_id=${quoted(modelId)};`,
      ),
    ).toBe("0.31");
  } finally {
    runSql(
      env,
      `DELETE FROM ai_pricing_settings WHERE model_id=${quoted(modelId)};
       INSERT INTO ai_pricing_settings
       SELECT * FROM json_populate_recordset(null::ai_pricing_settings, ${quoted(before)}::json);`,
    );
  }
});
