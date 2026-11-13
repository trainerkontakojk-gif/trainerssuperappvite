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
 * Agent directory cache (plan `supabase-egress-reduction.md`, Lampiran B probe).
 *
 * `getAgentDirectorySummary` feeds `GET /sidak/agents` and `GET /home/attention`.
 * Each call scanned the whole year of `qa_temuan`. Contract:
 * - a repeated read within the TTL does not scan `qa_temuan` again, whoever asks;
 * - each caller still sees only its own access scope (the cache holds the
 *   unscoped result; scope is applied per request, never cached);
 * - temuan and peserta written through the API show on the next read.
 *
 * Real JWT/Hono/PostgREST/RLS, loopback only; fixtures use an unused year.
 */

test.describe.configure({ mode: "serial" });

const env = readLoopbackEnv();
const ns = randomUUID().slice(0, 8);
const YEAR = 2094;
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const DIRECTORY_SELECT =
  "peserta_id,indicator_id,nilai,no_tiket,service_type,period_id,created_at,is_phantom_padding";

let app: Hono;
let trainer: Awaited<ReturnType<typeof createUserWithJwt>>;
let leader: Awaited<ReturnType<typeof createUserWithJwt>>;
let directoryScans = 0;
let periodId: string;
let yearId: string;
let groupId: string;
let requestId: string;
let indicatorIds: string[] = [];
// Seeded indicator ids are not RFC 4122, which the batch schema requires.
const apiIndicator = randomUUID();
const folderName = `e2e-dircache-${ns}`;
const peserta: string[] = [];

type DirectoryAgent = {
  id: string;
  nama: string;
  avgScore: number | null;
  atRisk: boolean;
};

async function directory(token: string): Promise<DirectoryAgent[]> {
  const response = await tnaApiRequest(
    app,
    `http://localhost/api/v1/sidak/agents?year=${YEAR}`,
    { method: "GET", headers: { Authorization: `Bearer ${token}` } },
  );
  expect(response.status).toBe(200);
  const agents = (await response.json()).data.agents as DirectoryAgent[];
  return agents.filter((agent) => peserta.includes(agent.id));
}

async function send(method: string, path: string, body: unknown) {
  const response = await tnaApiRequest(app, `http://localhost/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${trainer.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  expect(response.status, text).toBeLessThan(300);
}

const byId = (agents: DirectoryAgent[], id: string) =>
  agents.find((agent) => agent.id === id)!;

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
  // Installed before the app import: the Supabase client captures `fetch`.
  const guarded = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof input === "string" || input instanceof URL
        ? input.toString()
        : input.url,
    );
    if (
      url.pathname === "/rest/v1/qa_temuan" &&
      (init?.method ?? "GET") === "GET" &&
      url.searchParams.get("select") === DIRECTORY_SELECT &&
      url.searchParams.get("tahun") === `eq.${YEAR}`
    )
      directoryScans++;
    return guarded(input, init);
  }) as typeof fetch;

  trainer = await createUserWithJwt(env, "trainer", `dircache-${ns}`);
  leader = await createUserWithJwt(env, "leader", `dircache-${ns}`);
  expect(runSql(env, `SELECT id FROM qa_periods WHERE year=${YEAR};`)).toBe("");
  expect(runSql(env, `SELECT id FROM profiler_years WHERE year=${YEAR};`)).toBe(
    "",
  );

  indicatorIds = runSql(
    env,
    "SELECT id FROM qa_indicators WHERE service_type='chat' AND is_active ORDER BY sort_order, name;",
  )
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  expect(indicatorIds.length).toBeGreaterThan(0);

  runSql(
    env,
    `INSERT INTO qa_indicators (id,service_type,name,category,bobot) VALUES (${q(apiIndicator)},'chat',${q(`dircache-${ns}`)},'critical',1);`,
  );
  periodId = sqlOne(
    env,
    `INSERT INTO qa_periods (month,year) VALUES (1,${YEAR}) RETURNING id;`,
  );
  yearId = sqlOne(
    env,
    `INSERT INTO profiler_years (year,label) VALUES (${YEAR},'E2E dircache') RETURNING id;`,
  );
  runSql(
    env,
    `INSERT INTO profiler_folders (name,year_id) VALUES (${q(folderName)},${q(yearId)});`,
  );
  // A and B are in the leader's scope; C is not. A fails every indicator,
  // B passes every one, C fails every one.
  for (const [index, nilai] of [0, 3, 0].entries()) {
    const id = sqlOne(
      env,
      `INSERT INTO profiler_peserta (batch_name,nama,tim,jabatan,nomor_urut)
       VALUES (${q(folderName)},${q(`Dircache ${"ABC"[index]} ${ns}`)},'Tim Uji','Agent',${index + 1}) RETURNING id;`,
    );
    peserta.push(id);
    const rows = indicatorIds
      .map(
        (indicator) =>
          `(${q(id)},${q(periodId)},${q(indicator)},'chat',${q(`e2e-dircache-${ns}-${index}`)},false,${nilai},${nilai < 3 ? "'E2E temuan'" : "NULL"},${YEAR})`,
      )
      .join(",");
    runSql(
      env,
      `INSERT INTO qa_temuan (peserta_id,period_id,indicator_id,service_type,no_tiket,is_phantom_padding,nilai,ketidaksesuaian,tahun) VALUES ${rows};`,
    );
  }

  groupId = sqlOne(
    env,
    `INSERT INTO access_groups (name,description,is_active) VALUES (${q(`e2e-dircache-${ns}`)},'e2e',true) RETURNING id;`,
  );
  for (const id of peserta.slice(0, 2))
    runSql(
      env,
      `INSERT INTO access_group_items (access_group_id,field_name,field_value,is_active) VALUES (${q(groupId)},'peserta_id',${q(id)},true);`,
    );
  requestId = sqlOne(
    env,
    `INSERT INTO leader_access_requests (leader_user_id,module,status) VALUES (${q(leader.userId)},'sidak','approved') RETURNING id;`,
  );
  runSql(
    env,
    `INSERT INTO leader_access_request_groups (request_id,access_group_id) VALUES (${q(requestId)},${q(groupId)});`,
  );

  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  if (peserta.length > 0) {
    const ids = peserta.map(q).join(",");
    runSql(env, `DELETE FROM qa_temuan WHERE peserta_id IN (${ids});`);
    runSql(env, `DELETE FROM profiler_peserta WHERE id IN (${ids});`);
  }
  if (requestId)
    runSql(
      env,
      `DELETE FROM leader_access_request_groups WHERE request_id=${q(requestId)}; DELETE FROM leader_access_requests WHERE id=${q(requestId)};`,
    );
  if (groupId)
    runSql(
      env,
      `DELETE FROM access_group_items WHERE access_group_id=${q(groupId)}; DELETE FROM access_groups WHERE id=${q(groupId)};`,
    );
  runSql(env, `DELETE FROM profiler_folders WHERE name=${q(folderName)};`);
  if (yearId) runSql(env, `DELETE FROM profiler_years WHERE id=${q(yearId)};`);
  if (periodId) runSql(env, `DELETE FROM qa_periods WHERE id=${q(periodId)};`);
  runSql(env, `DELETE FROM qa_indicators WHERE id=${q(apiIndicator)};`);
});

test("repeated reads reuse one scan and keep each caller's scope", async () => {
  const before = directoryScans;
  const first = await directory(trainer.token);
  expect(directoryScans - before).toBeGreaterThan(0);
  expect(first.map((agent) => agent.id).sort()).toEqual([...peserta].sort());
  expect(byId(first, peserta[0]!).atRisk).toBe(true);
  expect(byId(first, peserta[1]!).atRisk).toBe(false);

  const afterFirst = directoryScans;
  const second = await directory(trainer.token);
  const scoped = await directory(leader.token);
  expect(directoryScans - afterFirst, "scans after the first read").toBe(0);
  expect(second).toEqual(first);
  // The leader never sees agent C, even though the cache holds it.
  expect(scoped.map((agent) => agent.id).sort()).toEqual(
    peserta.slice(0, 2).sort(),
  );
  expect(scoped).toEqual(first.filter((agent) => agent.id !== peserta[2]));
});

test("temuan written through the API show on the next read", async () => {
  const b = peserta[1]!;
  await directory(trainer.token); // warm
  const ticket = `e2e-dircache-${ns}-new`;
  await send("POST", "/sidak/temuan/batch", {
    peserta_id: b,
    period_id: periodId,
    service_type: "chat",
    no_tiket: ticket,
    items: [
      {
        indicator_id: apiIndicator,
        nilai: 0,
        ketidaksesuaian: "E2E temuan baru",
        no_tiket: ticket,
      },
    ],
  });
  const afterCreate = byId(await directory(trainer.token), b);
  expect(afterCreate.atRisk).toBe(true);

  const ids = runSql(
    env,
    `SELECT id FROM qa_temuan WHERE peserta_id=${q(b)} AND no_tiket=${q(ticket)} ORDER BY id;`,
  )
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  expect(ids).toHaveLength(1);

  await send("PUT", `/sidak/temuan/${ids[0]}`, { nilai: 3 });
  const afterUpdate = byId(await directory(trainer.token), b);
  expect(afterUpdate.atRisk).toBe(false);

  await send("PUT", `/sidak/temuan/${ids[0]}`, { nilai: 0 });
  expect(byId(await directory(trainer.token), b).atRisk).toBe(true);
  await send("DELETE", `/sidak/temuan/${ids[0]}`, {});
  expect(byId(await directory(trainer.token), b).atRisk).toBe(false);
});

test("peserta updated through the API show on the next read", async () => {
  const a = peserta[0]!;
  await directory(trainer.token); // warm
  const nama = `Dircache A renamed ${ns}`;
  await send("PUT", `/profiler/peserta/${a}`, { nama });
  expect(byId(await directory(trainer.token), a).nama).toBe(nama);
});
