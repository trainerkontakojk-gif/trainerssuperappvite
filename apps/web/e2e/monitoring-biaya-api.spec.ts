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
 * Monitoring tahap 5 — Biaya AI. Backend NYATA in-process + Supabase lokal
 * disposable (plan `plans/markdown/monitoring-phase-5-biaya.md`).
 *
 * Kontrak `GET /ai/monitoring/aggregation`:
 * - `user_id` mengembalikan rincian satu orang saja;
 * - leader hanya melihat biaya akun yang tertaut ke peserta di tim yang
 *   aksesnya disetujui; leader tanpa persetujuan tidak melihat apa pun.
 */

const env = readLoopbackEnv();
const ns = randomUUID().slice(0, 8);
const quoted = (value: string) => `'${value.replace(/'/g, "''")}'`;
// Bulan jauh di depan supaya agregasi hanya berisi baris spec ini.
const PERIOD = "year=2031&month=7";

let app: Hono;
let trainer: Awaited<ReturnType<typeof createUserWithJwt>>;
let agentIn: Awaited<ReturnType<typeof createUserWithJwt>>;
let agentOut: Awaited<ReturnType<typeof createUserWithJwt>>;
let leader: Awaited<ReturnType<typeof createUserWithJwt>>;
let unapprovedLeader: Awaited<ReturnType<typeof createUserWithJwt>>;
let folderIn: string;
let folderOut: string;

function aggregation(token: string, query = "") {
  return tnaApiRequest(
    app,
    `http://localhost/api/v1/ai/monitoring/aggregation?${PERIOD}${query}`,
    { method: "GET", headers: { Authorization: `Bearer ${token}` } },
  );
}

const ours = (rows: Array<{ user_id: string }>) =>
  rows
    .map((row) => row.user_id)
    .filter((id) => [agentIn.userId, agentOut.userId].includes(id))
    .sort();

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

  trainer = await createUserWithJwt(env, "trainer", `biaya-${ns}`);
  agentIn = await createUserWithJwt(env, "agent", `biaya-in-${ns}`);
  agentOut = await createUserWithJwt(env, "agent", `biaya-out-${ns}`);
  leader = await createUserWithJwt(env, "leader", `biaya-${ns}`);
  unapprovedLeader = await createUserWithJwt(
    env,
    "leader",
    `biaya-tanpa-${ns}`,
  );

  folderIn = `Batch Biaya ${ns}`;
  folderOut = `Batch Lain ${ns}`;
  runSql(
    env,
    `INSERT INTO profiler_folders (name) VALUES (${quoted(folderIn)}), (${quoted(folderOut)});
     INSERT INTO profiler_peserta (batch_name, nama, tim, jabatan, akun_id) VALUES
       (${quoted(folderIn)}, ${quoted(`Rina ${ns}`)}, 'Tim Call', 'Agent', ${quoted(agentIn.userId)}),
       (${quoted(folderOut)}, ${quoted(`Ayu ${ns}`)}, 'Tim Call', 'Agent', ${quoted(agentOut.userId)});
     INSERT INTO ai_usage_logs (request_id, user_id, provider, model_id, module, action,
       input_tokens, output_tokens, total_tokens, estimated_cost_idr, created_at)
     VALUES
       (${quoted(`biaya-${ns}-1`)}, ${quoted(agentIn.userId)}, 'gemini', 'gemini-3.8-flash',
        'ketik', 'chat_response', 100, 40, 140, 30, '2031-07-02T03:00:00Z'),
       (${quoted(`biaya-${ns}-2`)}, ${quoted(agentIn.userId)}, 'gemini', 'gemini-3.8-flash',
        'qa-analyzer', 'generate-trend-forecast', 50, 10, 60, 12, '2031-07-03T03:00:00Z'),
       (${quoted(`biaya-${ns}-3`)}, ${quoted(agentOut.userId)}, 'gemini', 'gemini-3.8-flash',
        'pdkt', 'start_session', 20, 5, 25, 4, '2031-07-04T03:00:00Z'),
       (${quoted(`biaya-${ns}-4`)}, ${quoted(agentOut.userId)}, 'gemini', 'gemini-3.8-flash',
        'telefun', 'session_analysis', 20, 5, 25, 6, '2031-07-05T03:00:00Z');`,
  );

  const groupId = sqlOne(
    env,
    `INSERT INTO access_groups(name) VALUES (${quoted(`Grup biaya ${ns}`)}) RETURNING id;`,
  );
  runSql(
    env,
    `INSERT INTO access_group_items(access_group_id, field_name, field_value)
     VALUES (${quoted(groupId)}, 'batch_name', ${quoted(folderIn)});
     WITH request AS (INSERT INTO leader_access_requests(leader_user_id, module, status)
       VALUES (${quoted(leader.userId)}, 'sidak', 'approved') RETURNING id)
     INSERT INTO leader_access_request_groups(request_id, access_group_id)
     SELECT id, ${quoted(groupId)} FROM request;`,
  );

  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  const users = [trainer, agentIn, agentOut, leader, unapprovedLeader].filter(
    Boolean,
  );
  const userList = users.map((user) => quoted(user.userId)).join(",");
  runSql(
    env,
    `DELETE FROM ai_usage_logs WHERE user_id IN (${userList});
     DELETE FROM leader_access_requests WHERE leader_user_id IN (${userList});
     DELETE FROM access_groups WHERE name=${quoted(`Grup biaya ${ns}`)};
     DELETE FROM profiler_peserta WHERE batch_name IN (${quoted(folderIn)}, ${quoted(folderOut)});
     DELETE FROM profiler_folders WHERE name IN (${quoted(folderIn)}, ${quoted(folderOut)});`,
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

test("trainer melihat biaya semua orang", async () => {
  const response = await aggregation(trainer.token);
  const body = await response.json();
  expect(response.status, JSON.stringify(body).slice(0, 500)).toBe(200);
  expect(ours(body.data)).toEqual([agentIn.userId, agentOut.userId].sort());
});

test("rincian satu orang lewat user_id", async () => {
  const response = await aggregation(
    trainer.token,
    `&user_id=${agentIn.userId}`,
  );
  const { data } = await response.json();
  expect(response.status).toBe(200);
  expect(data).toHaveLength(1);
  expect(data[0]).toMatchObject({
    user_id: agentIn.userId,
    total_calls: 2,
    total_input_tokens: 150,
    total_output_tokens: 50,
    total_cost_idr: 42,
  });

  const invalid = await aggregation(trainer.token, "&user_id=bukan-uuid");
  expect(invalid.status).toBe(400);
});

test("leader hanya melihat biaya akun di tim yang disetujui", async () => {
  const response = await aggregation(leader.token);
  const { data } = await response.json();
  expect(response.status).toBe(200);
  expect(ours(data)).toEqual([agentIn.userId]);

  const outside = await aggregation(
    leader.token,
    `&user_id=${agentOut.userId}`,
  );
  expect(outside.status).toBe(200);
  expect((await outside.json()).data).toEqual([]);
});

test("leader tanpa akses disetujui tidak melihat biaya", async () => {
  const response = await aggregation(unapprovedLeader.token);
  const { data } = await response.json();
  expect(response.status).toBe(200);
  expect(data).toEqual([]);
});
