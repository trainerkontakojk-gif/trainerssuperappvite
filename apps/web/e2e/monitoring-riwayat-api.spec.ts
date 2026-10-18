import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import { tnaApiRequest } from "./helpers/tnaApi";
import {
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
  runSql,
  sqlOne,
} from "./helpers/sidakRealBackend";

/**
 * Monitoring tahap 3 — Riwayat difilter dan dibagi per halaman di server.
 * Backend NYATA in-process + Supabase lokal disposable
 * (plan `plans/markdown/monitoring-phase-3-riwayat.md`).
 *
 * Kontrak `GET /ai/monitoring/history`:
 * - satu baris ringkas per sesi (tanpa transkrip), 25 per halaman, terbaru dulu;
 * - filter modul, status, tanggal WIB, dan pencarian dikerjakan server;
 * - hasil Telefun lama di `results` ikut, kecuali yang sudah ada di
 *   `telefun_history`;
 * - leader hanya melihat peserta di tim yang aksesnya disetujui, termasuk di
 *   detail sesi.
 */

const env = readLoopbackEnv();
const ns = randomUUID().slice(0, 8);
const quoted = (value: string) => `'${value.replace(/'/g, "''")}'`;

let app: Hono;
let trainer: Awaited<ReturnType<typeof createUserWithJwt>>;
let agent: Awaited<ReturnType<typeof createUserWithJwt>>;
let otherAgent: Awaited<ReturnType<typeof createUserWithJwt>>;
let leader: Awaited<ReturnType<typeof createUserWithJwt>>;
let unapprovedLeader: Awaited<ReturnType<typeof createUserWithJwt>>;
let folderName: string;
let otherFolder: string;
let pesertaId: string;
let otherPesertaId: string;
let groupId: string;
const ids: Record<string, string> = {};

function get(token: string, path: string) {
  return tnaApiRequest(app, `http://localhost/api/v1${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
}

function history(token: string, query: Record<string, string>) {
  return get(token, `/ai/monitoring/history?${new URLSearchParams(query)}`);
}

const subject = (id: string, name: string, batch: string) =>
  `'participant', ${quoted(id)}, ${quoted(name)}, ${quoted(batch)}, 'Tim Call'`;

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

  trainer = await createUserWithJwt(env, "trainer", `riwayat-${ns}`);
  agent = await createUserWithJwt(env, "agent", `riwayat-${ns}`);
  otherAgent = await createUserWithJwt(env, "agent", `riwayat-lain-${ns}`);
  leader = await createUserWithJwt(env, "leader", `riwayat-${ns}`);
  unapprovedLeader = await createUserWithJwt(
    env,
    "leader",
    `riwayat-tanpa-${ns}`,
  );

  folderName = `Batch Pagi ${ns}`;
  otherFolder = `Batch Siang ${ns}`;
  runSql(
    env,
    `INSERT INTO profiler_folders (name) VALUES (${quoted(folderName)}), (${quoted(otherFolder)});`,
  );
  pesertaId = sqlOne(
    env,
    `INSERT INTO profiler_peserta (batch_name, nama, tim, jabatan)
     VALUES (${quoted(folderName)}, ${quoted(`Rina ${ns}`)}, 'Tim Call', 'Agent')
     RETURNING id;`,
  );
  otherPesertaId = sqlOne(
    env,
    `INSERT INTO profiler_peserta (batch_name, nama, tim, jabatan, akun_id)
     VALUES (${quoted(otherFolder)}, ${quoted(`Ayu ${ns}`)}, 'Tim Call', 'Agent',
       ${quoted(otherAgent.userId)})
     RETURNING id;`,
  );

  const messages = [
    {
      id: "m1",
      sender: "consumer",
      text: "Halo",
      timestamp: "2031-04-10T03:00:00.000Z",
    },
    {
      id: "m2",
      sender: "agent",
      text: "Baik",
      timestamp: "2031-04-10T03:06:52.000Z",
    },
  ];
  ids.ketik = sqlOne(
    env,
    `INSERT INTO ketik_history (user_id, date, scenario_title, consumer_name, messages,
       simulation_duration, final_score, review_status, simulation_subject_type,
       simulation_subject_peserta_id, simulation_subject_name,
       simulation_subject_batch_name, simulation_subject_team)
     VALUES (${quoted(trainer.userId)}, '2031-04-10T03:00:00Z', ${quoted(`Tagihan ${ns}`)},
       'Bu Sri', ${quoted(JSON.stringify(messages))}::jsonb, 5, 82, 'completed',
       ${subject(pesertaId, `Rina ${ns}`, folderName)})
     RETURNING id;`,
  );
  // 10 Apr 00.30 WIB = 9 Apr 17.30 UTC.
  ids.pdkt = sqlOne(
    env,
    `INSERT INTO pdkt_history (user_id, timestamp, config, emails, evaluation,
       evaluation_status, time_taken)
     VALUES (${quoted(otherAgent.userId)}, '2031-04-09T17:30:00Z',
       ${quoted(JSON.stringify({ scenarios: [{ title: `Undian ${ns}` }], identity: { name: "Hendra Wijaya" } }))}::jsonb,
       ${quoted(JSON.stringify([{ id: "e1", type: "received", body: "isi email panjang" }]))}::jsonb,
       NULL, 'failed', 1325)
     RETURNING id;`,
  );
  ids.telefun = sqlOne(
    env,
    `INSERT INTO telefun_history (user_id, created_at, scenario_title, consumer_name,
       duration_seconds, score, scoring_status, voice_assessment, simulation_subject_type,
       simulation_subject_peserta_id, simulation_subject_name,
       simulation_subject_batch_name, simulation_subject_team)
     VALUES (${quoted(trainer.userId)}, '2031-04-09T03:00:00Z', ${quoted(`Klaim ${ns}`)},
       'Pak Budi', 540, 6, 'completed', ${quoted(JSON.stringify({ overallScore: 7.5 }))}::jsonb,
       ${subject(otherPesertaId, `Ayu ${ns}`, otherFolder)})
     RETURNING id;`,
  );
  ids.legacy = sqlOne(
    env,
    `INSERT INTO results (user_id, module, score, details, created_at)
     VALUES (${quoted(agent.userId)}, 'telefun', 8,
       ${quoted(JSON.stringify({ scenario: `Lama ${ns}`, duration: 300 }))}::jsonb,
       '2031-04-08T03:00:00Z')
     RETURNING id;`,
  );
  // Baris `results` yang sudah dipindah ke telefun_history tidak dobel.
  runSql(
    env,
    `INSERT INTO results (id, user_id, module, score, details, created_at)
     VALUES (${quoted(ids.telefun)}, ${quoted(trainer.userId)}, 'telefun', 6,
       ${quoted(JSON.stringify({ scenario: `Klaim ${ns}` }))}::jsonb, '2031-04-09T03:00:00Z');`,
  );
  // 30 sesi KETIK lain untuk halaman, sebulan sesudahnya.
  runSql(
    env,
    `INSERT INTO ketik_history (user_id, date, scenario_title, consumer_name, review_status)
     SELECT ${quoted(agent.userId)}, '2031-05-01T03:00:00Z'::timestamptz + make_interval(mins => g),
       ${quoted(`Halaman ${ns} `)} || g, 'Konsumen', NULL
     FROM generate_series(1, 30) AS g;`,
  );

  groupId = sqlOne(
    env,
    `INSERT INTO access_groups(name) VALUES (${quoted(`Grup ${ns}`)}) RETURNING id;`,
  );
  runSql(
    env,
    `INSERT INTO access_group_items(access_group_id, field_name, field_value)
     VALUES (${quoted(groupId)}, 'batch_name', ${quoted(folderName)});
     WITH request AS (INSERT INTO leader_access_requests(leader_user_id, module, status)
       VALUES (${quoted(leader.userId)}, 'sidak', 'approved') RETURNING id)
     INSERT INTO leader_access_request_groups(request_id, access_group_id)
     SELECT id, ${quoted(groupId)} FROM request;`,
  );

  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  const users = [trainer, agent, otherAgent, leader, unapprovedLeader].filter(
    Boolean,
  );
  const userList = users.map((user) => quoted(user.userId)).join(",");
  runSql(
    env,
    `DELETE FROM ketik_history WHERE user_id IN (${userList});
     DELETE FROM pdkt_history WHERE user_id IN (${userList});
     DELETE FROM telefun_history WHERE user_id IN (${userList});
     DELETE FROM results WHERE user_id IN (${userList});
     DELETE FROM leader_access_requests WHERE leader_user_id IN (${userList});
     DELETE FROM access_groups WHERE name=${quoted(`Grup ${ns}`)};
     DELETE FROM profiler_peserta WHERE batch_name IN (${quoted(folderName)}, ${quoted(otherFolder)});
     DELETE FROM profiler_folders WHERE name IN (${quoted(folderName)}, ${quoted(otherFolder)});`,
  );
  for (const user of users) {
    runSql(
      env,
      `DELETE FROM activity_logs WHERE user_id=${quoted(user.userId)};
       DELETE FROM profiles WHERE id=${quoted(user.userId)};
       DELETE FROM auth.users WHERE id=${quoted(user.userId)};`,
    );
  }
});

test("satu baris ringkas per sesi, terbaru dulu, tanpa transkrip", async () => {
  const response = await history(trainer.token, {
    q: ns,
    from: "2031-04-01",
    to: "2031-04-30",
  });
  expect(response.status).toBe(200);
  const { data } = await response.json();

  expect(data.total).toBe(4);
  expect(data.page).toBe(1);
  expect(data.page_size).toBe(25);
  expect(data.scope).toEqual({ kind: "all" });
  expect(data.counts).toEqual({
    ketik: 1,
    pdkt: 1,
    telefun: 2,
    completed: 3,
    processing: 0,
    failed: 1,
    not_started: 0,
  });
  expect(
    data.rows.map((row: { module: string; id: string }) => [
      row.module,
      row.id,
    ]),
  ).toEqual([
    ["ketik", ids.ketik],
    ["pdkt", ids.pdkt],
    ["telefun", ids.telefun],
    ["telefun", ids.legacy],
  ]);

  const [ketik, pdkt, telefun, legacy] = data.rows;
  expect(ketik).toMatchObject({
    occurred_at: "2031-04-10T03:00:00.000Z",
    scenario_title: `Tagihan ${ns}`,
    duration_seconds: 412,
    score: 82,
    score_scale: 100,
    review_status: "completed",
    participant: { name: `Rina ${ns}`, batch: folderName },
  });
  expect(pdkt).toMatchObject({
    scenario_title: `Undian ${ns}`,
    consumer_name: "Hendra Wijaya",
    duration_seconds: 1325,
    score: null,
    review_status: "failed",
    // Tanpa subjek peserta: nama akun pelaksana.
    participant: { name: "E2E agent", batch: null },
    actor: { email: otherAgent.email, name: "E2E agent", role: "agent" },
  });
  expect(telefun).toMatchObject({ score: 7.5, score_scale: 10 });
  expect(legacy).toMatchObject({
    scenario_title: `Lama ${ns}`,
    duration_seconds: 300,
    score: 8,
    legacy: true,
  });
  for (const row of data.rows) {
    expect(row).not.toHaveProperty("history");
    expect(row).not.toHaveProperty("messages");
    expect(row).not.toHaveProperty("emails");
  }
});

test("filter modul, status, tanggal WIB, dan pencarian di server", async () => {
  const only = async (query: Record<string, string>) => {
    const response = await history(trainer.token, query);
    expect(response.status).toBe(200);
    const { data } = await response.json();
    return data.rows.map((row: { id: string }) => row.id);
  };

  expect(await only({ q: ns, module: "pdkt" })).toEqual([ids.pdkt]);
  expect(await only({ q: ns, status: "failed" })).toEqual([ids.pdkt]);
  // PDKT terjadi 10 Apr 00.30 WIB, jadi masuk hari 10 April.
  expect(await only({ q: ns, from: "2031-04-10", to: "2031-04-10" })).toEqual([
    ids.ketik,
    ids.pdkt,
  ]);
  expect(await only({ q: ns, to: "2031-04-08" })).toEqual([ids.legacy]);
  // Cari nama konsumen dan email pelaksana.
  expect(
    await only({ q: "Hendra Wijaya", from: "2031-04-01", to: "2031-04-30" }),
  ).toEqual([ids.pdkt]);
  expect(
    await only({ q: agent.email, from: "2031-04-01", to: "2031-04-30" }),
  ).toEqual([ids.legacy]);
});

test("25 baris per halaman", async () => {
  const page = async (number: string) => {
    const response = await history(trainer.token, {
      q: `Halaman ${ns}`,
      page: number,
    });
    expect(response.status).toBe(200);
    return (await response.json()).data;
  };
  const first = await page("1");
  expect(first.total).toBe(30);
  expect(first.rows).toHaveLength(25);
  expect(first.rows[0].scenario_title).toBe(`Halaman ${ns} 30`);
  const second = await page("2");
  expect(second.page).toBe(2);
  expect(second.rows).toHaveLength(5);
  expect(second.rows.at(-1).scenario_title).toBe(`Halaman ${ns} 1`);
});

test("parameter tidak valid ditolak dengan pesan ramah", async () => {
  for (const query of <Array<Record<string, string>>>[
    { module: "sidak" },
    { status: "x" },
    { from: "10-04-2031" },
    { page: "0" },
  ]) {
    const response = await history(trainer.token, query);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toBe("Filter riwayat tidak valid.");
  }
});

test("leader hanya melihat peserta di tim yang disetujui", async () => {
  const response = await history(leader.token, { q: ns });
  expect(response.status).toBe(200);
  const { data } = await response.json();
  expect(data.scope).toEqual({
    kind: "team",
    batches: [folderName],
    teams: [],
  });
  expect(data.rows.map((row: { id: string }) => row.id)).toEqual([ids.ketik]);

  const inScope = await get(
    leader.token,
    `/ai/monitoring/history/ketik/${ids.ketik}/review`,
  );
  expect(inScope.status).toBe(200);
  const outOfScope = await get(
    leader.token,
    `/ai/monitoring/history/telefun/${ids.telefun}/review`,
  );
  expect(outOfScope.status).toBe(404);
});

test("leader tanpa akses disetujui tidak melihat sesi", async () => {
  const response = await history(unapprovedLeader.token, { q: ns });
  expect(response.status).toBe(200);
  const { data } = await response.json();
  expect(data.scope).toEqual({ kind: "none" });
  expect(data.total).toBe(0);
  expect(data.rows).toEqual([]);
});

test("view dan fungsi riwayat tidak terbuka untuk anon", async () => {
  const view = await fetch(
    `${env.apiUrl}/rest/v1/monitoring_sessions?select=id`,
    {
      headers: { apikey: env.anonKey },
    },
  );
  expect([401, 403, 404]).toContain(view.status);
  const rpc = await fetch(
    `${env.apiUrl}/rest/v1/rpc/monitoring_sessions_page`,
    {
      method: "POST",
      headers: { apikey: env.anonKey, "Content-Type": "application/json" },
      body: "{}",
    },
  );
  expect([401, 403, 404]).toContain(rpc.status);
});
