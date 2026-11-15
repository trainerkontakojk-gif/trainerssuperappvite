import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import { tnaApiRequest } from "./helpers/tnaApi";
import { resetSidakReferenceCache } from "./helpers/resetSidakReferenceCache";
import {
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
  runSql,
  sqlOne,
} from "./helpers/sidakRealBackend";

/**
 * Shared `qa_temuan` row cache (plan `sidak-temuan-row-cache.md`).
 *
 * The dashboard, the trend, and the agent directory each read a whole year of
 * `qa_temuan` per request. Contract:
 * - within the TTL, one scan of a year serves all three endpoints, whoever
 *   asks and whichever filter they pass;
 * - every filter (scope, service, month range, folder) returns the same rows
 *   with a cold or a warm cache, and callers never see agents outside their
 *   scope;
 * - temuan and peserta written through the API show on the next read.
 *
 * Real JWT/Hono/PostgREST/RLS, loopback only; fixtures use an unused year.
 */

test.describe.configure({ mode: "serial" });

const env = readLoopbackEnv();
const ns = randomUUID().slice(0, 8);
const YEAR = 2093;
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

let app: Hono;
let trainer: Awaited<ReturnType<typeof createUserWithJwt>>;
let leader: Awaited<ReturnType<typeof createUserWithJwt>>;
let temuanScans = 0;
let pesertaScans = 0;
const periodIds: Record<1 | 2, string> = { 1: "", 2: "" };
let yearId = "";
let groupId = "";
let requestId = "";
let indicatorIds: string[] = [];
// Seeded indicator ids are not RFC 4122, which the batch schema requires.
const apiIndicator = randomUUID();
const folders = { a: `e2e-rowcache-${ns}-a`, b: `e2e-rowcache-${ns}-b` };
let folderBId = "";
// A, B, C, E in folder a; D in folder b. A and B are in the leader's scope.
// E is SIDAK-excluded (jabatan Trainer).
const peserta: Record<"A" | "B" | "C" | "D" | "E", string> = {
  A: "",
  B: "",
  C: "",
  D: "",
  E: "",
};

type Body = Record<string, any>;

async function get(token: string, path: string): Promise<Body> {
  const response = await tnaApiRequest(app, `http://localhost/api/v1${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await response.text();
  expect(response.status, text).toBe(200);
  return JSON.parse(text).data;
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

const dashboard = (token: string, extra = "") =>
  get(token, `/sidak/dashboard?year=${YEAR}${extra}`);
const trend = (token: string, extra = "") =>
  get(
    token,
    `/sidak/dashboard/trend?year=${YEAR}&startMonth=1&endMonth=12${extra}`,
  );
const directory = async (token: string) => {
  const ids = new Set(Object.values(peserta));
  const data = await get(token, `/sidak/agents?year=${YEAR}`);
  return (data.agents as Body[]).filter((agent) => ids.has(agent.id));
};

const label = (id: string) =>
  Object.entries(peserta).find(([, value]) => value === id)?.[0] ?? id;
const agentSet = (topAgents: Body[]) =>
  topAgents.map((agent) => label(agent.agentId)).sort();

type Combo = { name: string; read: () => Promise<Body> };
const combos = (): Combo[] => [
  { name: "dashboard trainer", read: () => dashboard(trainer.token) },
  { name: "dashboard leader", read: () => dashboard(leader.token) },
  {
    name: "dashboard chat",
    read: () => dashboard(trainer.token, "&service_type=chat"),
  },
  {
    name: "dashboard email",
    read: () => dashboard(trainer.token, "&service_type=email"),
  },
  {
    name: "dashboard month 2",
    read: () => dashboard(trainer.token, "&startMonth=2&endMonth=2"),
  },
  {
    name: "dashboard period 1",
    read: () => dashboard(trainer.token, `&period_ids=${periodIds[1]}`),
  },
  {
    name: "dashboard folder b",
    read: () => dashboard(trainer.token, `&folder_ids=${folderBId}`),
  },
  { name: "trend trainer", read: () => trend(trainer.token) },
  { name: "trend leader", read: () => trend(leader.token) },
  {
    name: "trend month 1 chat",
    read: () =>
      get(
        trainer.token,
        `/sidak/dashboard/trend?year=${YEAR}&startMonth=1&endMonth=1&service_type=chat`,
      ),
  },
  { name: "directory trainer", read: () => directory(trainer.token) },
  { name: "directory leader", read: () => directory(leader.token) },
];

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
    if ((init?.method ?? "GET") === "GET") {
      if (
        url.pathname === "/rest/v1/qa_temuan" &&
        url.searchParams.get("tahun") === `eq.${YEAR}`
      )
        temuanScans++;
      if (
        url.pathname === "/rest/v1/profiler_peserta" &&
        url.searchParams.get("select") === "id,nama,batch_name,tim,jabatan"
      )
        pesertaScans++;
    }
    return guarded(input, init);
  }) as typeof fetch;

  trainer = await createUserWithJwt(env, "trainer", `rowcache-${ns}`);
  leader = await createUserWithJwt(env, "leader", `rowcache-${ns}`);
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
    `INSERT INTO qa_indicators (id,service_type,name,category,bobot) VALUES (${q(apiIndicator)},'chat',${q(`rowcache-${ns}`)},'critical',1);`,
  );
  for (const month of [1, 2] as const)
    periodIds[month] = sqlOne(
      env,
      `INSERT INTO qa_periods (month,year) VALUES (${month},${YEAR}) RETURNING id;`,
    );
  yearId = sqlOne(
    env,
    `INSERT INTO profiler_years (year,label) VALUES (${YEAR},'E2E rowcache') RETURNING id;`,
  );
  runSql(
    env,
    `INSERT INTO profiler_folders (name,year_id) VALUES (${q(folders.a)},${q(yearId)});`,
  );
  folderBId = sqlOne(
    env,
    `INSERT INTO profiler_folders (name,year_id) VALUES (${q(folders.b)},${q(yearId)}) RETURNING id;`,
  );

  const spec: Array<{
    key: keyof typeof peserta;
    folder: string;
    jabatan: string;
    nilai: Partial<Record<1 | 2, number>>;
  }> = [
    { key: "A", folder: folders.a, jabatan: "Agent", nilai: { 1: 0, 2: 3 } },
    { key: "B", folder: folders.a, jabatan: "Agent", nilai: { 1: 3, 2: 0 } },
    { key: "C", folder: folders.a, jabatan: "Agent", nilai: { 1: 0 } },
    { key: "D", folder: folders.b, jabatan: "Agent", nilai: { 2: 0 } },
    { key: "E", folder: folders.a, jabatan: "Trainer", nilai: { 1: 0 } },
  ];
  for (const [index, entry] of spec.entries()) {
    const id = sqlOne(
      env,
      `INSERT INTO profiler_peserta (batch_name,nama,tim,jabatan,nomor_urut)
       VALUES (${q(entry.folder)},${q(`Rowcache ${entry.key} ${ns}`)},'Tim Uji',${q(entry.jabatan)},${index + 1}) RETURNING id;`,
    );
    peserta[entry.key] = id;
    for (const [month, nilai] of Object.entries(entry.nilai)) {
      const m = Number(month) as 1 | 2;
      const rows = indicatorIds
        .map(
          (indicator, i) =>
            `(${q(id)},${q(periodIds[m])},${q(indicator)},'chat',${q(`e2e-rowcache-${ns}-${entry.key}-${m}`)},false,${nilai},${nilai < 3 ? "'E2E temuan'" : "NULL"},${YEAR},'${YEAR}-0${m}-10T00:00:0${i % 10}Z')`,
        )
        .join(",");
      runSql(
        env,
        `INSERT INTO qa_temuan (peserta_id,period_id,indicator_id,service_type,no_tiket,is_phantom_padding,nilai,ketidaksesuaian,tahun,created_at) VALUES ${rows};`,
      );
    }
  }
  // A phantom padding row: the trend never counts it.
  runSql(
    env,
    `INSERT INTO qa_temuan (peserta_id,period_id,indicator_id,service_type,no_tiket,is_phantom_padding,nilai,tahun,created_at) VALUES (${q(peserta.B)},${q(periodIds[1])},${q(apiIndicator)},'chat',NULL,true,0,${YEAR},'${YEAR}-01-11T00:00:00Z');`,
  );

  groupId = sqlOne(
    env,
    `INSERT INTO access_groups (name,description,is_active) VALUES (${q(`e2e-rowcache-${ns}`)},'e2e',true) RETURNING id;`,
  );
  for (const id of [peserta.A, peserta.B])
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
  const ids = Object.values(peserta).filter(Boolean);
  if (ids.length > 0) {
    const list = ids.map(q).join(",");
    runSql(env, `DELETE FROM qa_temuan WHERE peserta_id IN (${list});`);
    runSql(env, `DELETE FROM profiler_peserta WHERE id IN (${list});`);
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
  runSql(
    env,
    `DELETE FROM profiler_folders WHERE name IN (${q(folders.a)},${q(folders.b)});`,
  );
  if (yearId) runSql(env, `DELETE FROM profiler_years WHERE id=${q(yearId)};`);
  for (const id of Object.values(periodIds).filter(Boolean))
    runSql(env, `DELETE FROM qa_periods WHERE id=${q(id)};`);
  runSql(env, `DELETE FROM qa_indicators WHERE id=${q(apiIndicator)};`);
});

test("one year scan serves the dashboard, trend, and directory", async () => {
  await resetSidakReferenceCache();
  const before = temuanScans;
  const beforePeserta = pesertaScans;
  await dashboard(trainer.token);
  expect(temuanScans - before, "first dashboard read").toBeGreaterThan(0);

  const afterFirst = temuanScans;
  const afterFirstPeserta = pesertaScans;
  for (const combo of combos()) await combo.read();
  expect(temuanScans - afterFirst, "qa_temuan scans after the first read").toBe(
    0,
  );
  expect(pesertaScans - beforePeserta).toBeGreaterThan(0);
  expect(
    pesertaScans - afterFirstPeserta,
    "dashboard peserta reads after the first read",
  ).toBe(0);
});

test("every filter returns the same rows cold and warm", async () => {
  const results: Record<string, unknown> = {};
  for (const combo of combos()) {
    await resetSidakReferenceCache();
    const cold = await combo.read();
    const warm = await combo.read();
    expect(warm, combo.name).toEqual(cold);
    results[combo.name] = cold;
  }

  const byName = (name: string) => results[name] as Body;
  // A, B, C and D are audited; E is SIDAK-excluded.
  expect(agentSet(byName("dashboard trainer").topAgents)).toEqual([
    "A",
    "B",
    "C",
    "D",
  ]);
  expect(byName("dashboard trainer").summary.totalAgents).toBe(4);
  expect(agentSet(byName("dashboard leader").topAgents)).toEqual(["A", "B"]);
  expect(byName("dashboard leader").summary.totalAgents).toBe(2);
  expect(agentSet(byName("dashboard chat").topAgents)).toEqual([
    "A",
    "B",
    "C",
    "D",
  ]);
  expect(byName("dashboard email").topAgents).toEqual([]);
  expect(agentSet(byName("dashboard month 2").topAgents)).toEqual([
    "A",
    "B",
    "D",
  ]);
  expect(agentSet(byName("dashboard period 1").topAgents)).toEqual([
    "A",
    "B",
    "C",
  ]);
  expect(agentSet(byName("dashboard folder b").topAgents)).toEqual(["D"]);

  const failing = indicatorIds.length;
  // Month 1: A and C fail every indicator (E is excluded only from the
  // dashboard); month 2: B and D. The phantom row never counts.
  expect(byName("trend leader").totalSummary.totalDefects).toBe(2 * failing);
  expect(byName("trend leader").totalSummary.auditedAgents).toBe(2);
  expect(byName("trend month 1 chat").totalSummary.totalDefects).toBe(
    3 * failing,
  );

  expect(
    (byName("directory trainer") as unknown as Body[])
      .map((agent) => label(agent.id))
      .sort(),
  ).toEqual(["A", "B", "C", "D"]);
  expect(
    (byName("directory leader") as unknown as Body[])
      .map((agent) => label(agent.id))
      .sort(),
  ).toEqual(["A", "B"]);
});

test("temuan and peserta written through the API show on the next read", async () => {
  const d = peserta.D;
  const baseDash = await dashboard(trainer.token);
  const baseTrend = await trend(trainer.token);
  const ticket = `e2e-rowcache-${ns}-new`;
  await send("POST", "/sidak/temuan/batch", {
    peserta_id: d,
    period_id: periodIds[1],
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
  const afterCreate = await dashboard(trainer.token);
  expect(afterCreate.summary.totalDefects).toBe(
    baseDash.summary.totalDefects + 1,
  );
  expect((await trend(trainer.token)).totalSummary.totalDefects).toBe(
    baseTrend.totalSummary.totalDefects + 1,
  );
  expect(
    agentSet(
      (await dashboard(trainer.token, `&period_ids=${periodIds[1]}`)).topAgents,
    ),
  ).toEqual(["A", "B", "C", "D"]);

  const [id] = runSql(
    env,
    `SELECT id FROM qa_temuan WHERE peserta_id=${q(d)} AND no_tiket=${q(ticket)};`,
  )
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  expect(id).toBeTruthy();

  await send("PUT", `/sidak/temuan/${id}`, {
    nilai: 3,
    ketidaksesuaian: null,
  });
  expect((await dashboard(trainer.token)).summary.totalDefects).toBe(
    baseDash.summary.totalDefects,
  );
  await send("PUT", `/sidak/temuan/${id}`, {
    nilai: 0,
    ketidaksesuaian: "E2E temuan lagi",
  });
  expect((await trend(trainer.token)).totalSummary.totalDefects).toBe(
    baseTrend.totalSummary.totalDefects + 1,
  );
  await send("DELETE", `/sidak/temuan/${id}`, {});
  expect((await dashboard(trainer.token)).summary.totalDefects).toBe(
    baseDash.summary.totalDefects,
  );
  expect((await trend(trainer.token)).totalSummary.totalDefects).toBe(
    baseTrend.totalSummary.totalDefects,
  );

  await dashboard(trainer.token); // warm
  const nama = `Rowcache D renamed ${ns}`;
  await send("PUT", `/profiler/peserta/${d}`, { nama });
  const renamed = (await dashboard(trainer.token)).topAgents.find(
    (agent: Body) => agent.agentId === d,
  );
  expect(renamed?.nama).toBe(nama);
});
